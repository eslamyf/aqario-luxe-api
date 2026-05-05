// ──────────────────────────────────────────────────────────
// KYC (Know Your Customer) Controller
// ──────────────────────────────────────────────────────────

const User = require('../../models/user.model');
const logger = require('../../utils/logger');
const { logAction } = require('../../services/audit.service');

// ──────────────────────────────────────────────────────────
// USER ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/kyc
 * Upload KYC documents (National ID, Passport, etc.)
 */
exports.uploadKYCDocuments = async (req, res, next) => {
  try {
    const { documentType, frontImage, backImage } = req.body;

    // Validate document type
    const VALID_TYPES = ['national_id', 'passport', 'drivers_license'];
    if (!VALID_TYPES.includes(documentType)) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.INVALID_DOC_TYPE', { types: VALID_TYPES.join(', ') }),
      });
    }

    // Validate images (should already be Cloudinary URLs from upload middleware)
    // Relaxed validation: users can upload what they want or delete everything.
    // If no frontImage is provided, we just clear the identity documents later.

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    // ── Finalize ownership docs ──────
    // Mark all current docs as permanent.
    user.ownershipDocuments = user.ownershipDocuments.map(doc => {
      doc.isTemporary = false;
      return doc;
    });

    // Store identity document(s) - replace old ones or clear if empty
    if (frontImage) {
      user.kycDocuments = [
        {
          type: documentType || 'national_id',
          frontImage,
          backImage: backImage || null,
          uploadedAt: new Date(),
        },
      ];
    } else {
      user.kycDocuments = [];
    }

    // Update KYC status and version
    if (user.kycDocuments.length === 0 && user.ownershipDocuments.length === 0) {
      user.kycStatus = 'not_submitted';
      user.kycSubmittedAt = undefined;
    } else {
      user.kycStatus = 'pending';
      user.kycSubmittedAt = new Date();
      user.kycVersion += 1; // Increment semantic version on final submission
    }

    await user.save({ validateBeforeSave: false });

    logger.info(`[KYC] User ${user._id} submitted KYC (${documentType}) | ${user.ownershipDocuments.length} ownership docs → PENDING`);

    res.status(200).json({
      status: 'success',
      message: req.t('KYC.SUBMITTED'),
      data: {
        kycStatus: 'pending',
        submitted: true,
        submittedAt: user.kycSubmittedAt,
        documentType,
        ownershipDocumentCount: user.ownershipDocuments.length
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/kyc/upload
 * Upload a single KYC image to Cloudinary and return the URL
 */
exports.uploadKYCImageSingle = async (req, res, next) => {
  try {
    if (!req.body.imageUrl) {
      return res.status(400).json({ status: 'fail', message: 'Image upload failed' });
    }

    res.status(200).json({
      status: 'success',
      data: {
        url: req.body.imageUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/kyc/ownership/upload
 * Upload a single ownership document file (PDF/image) to Cloudinary
 * and immediately save it to user.ownershipDocuments in DB
 */
exports.uploadOwnershipFile = async (req, res, next) => {
  try {
    if (!req.body.fileUrl) {
      return res.status(400).json({ status: 'fail', message: 'File upload failed' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found' });
    }

    const newDoc = {
      fileUrl: req.body.fileUrl,
      fileName: req.body.fileName || 'document',
      fileType: req.body.fileType || 'image',
      isTemporary: true,  // Will be finalized on KYC submit
      uploadedAt: new Date(),
    };

    user.ownershipDocuments.push(newDoc);
    await user.save({ validateBeforeSave: false });

    // Get the saved subdocument with its generated _id
    const savedDoc = user.ownershipDocuments[user.ownershipDocuments.length - 1];

    logger.info(`[KYC] User ${user._id} uploaded ownership doc → ${savedDoc.fileName} (id: ${savedDoc._id})`);

    res.status(200).json({
      status: 'success',
      data: {
        document: {
          _id: savedDoc._id,
          fileUrl: savedDoc.fileUrl,
          fileName: savedDoc.fileName,
          fileType: savedDoc.fileType,
          isTemporary: savedDoc.isTemporary,
          uploadedAt: savedDoc.uploadedAt,
        },
        total: user.ownershipDocuments.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/kyc/ownership/:docId
 * Remove an ownership document by its MongoDB _id
 */
exports.deleteOwnershipFile = async (req, res, next) => {
  try {
    const { docId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found' });
    }

    const docIndex = user.ownershipDocuments.findIndex(
      doc => doc._id.toString() === docId
    );

    if (docIndex === -1) {
      return res.status(404).json({ status: 'fail', message: 'Document not found' });
    }

    const removed = user.ownershipDocuments[docIndex];
    user.ownershipDocuments.splice(docIndex, 1);

    // If no documents remain at all, reset status
    if (user.kycDocuments.length === 0 && user.ownershipDocuments.length === 0) {
      user.kycStatus = 'not_submitted';
      user.kycSubmittedAt = undefined;
    }

    await user.save({ validateBeforeSave: false });

    logger.info(`[KYC] User ${user._id} deleted ownership doc id=${docId} → ${removed.fileName}`);

    res.status(200).json({
      status: 'success',
      message: 'Document removed successfully',
      data: { remaining: user.ownershipDocuments.length },
    });
  } catch (err) {
    next(err);
  }
};


/**
 * DELETE /api/v1/kyc/identity-document
 * Immediately remove identity document (front/back card or passport) from DB
 */
exports.deleteIdentityDocument = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found' });
    }

    user.kycDocuments = [];

    // If no ownership docs remain either, reset status
    if (user.ownershipDocuments.length === 0) {
      user.kycStatus = 'not_submitted';
      user.kycSubmittedAt = undefined;
    }

    await user.save({ validateBeforeSave: false });

    logger.info(`[KYC] User ${user._id} deleted identity documents from DB`);

    res.status(200).json({
      status: 'success',
      message: 'Identity documents removed successfully',
      data: { kycStatus: user.kycStatus }
    });
  } catch (err) {
    next(err);
  }
};


/**
 * GET /api/v1/kyc/status
 * Check current KYC verification status
 */
exports.getKYCStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      'kycStatus kycSubmittedAt kycVerifiedAt kycApprovedAt kycRejectionReason'
    );

    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    res.status(200).json({
      status: 'success',
      data: {
        kycStatus: user.kycStatus,
        submitted: !!user.kycSubmittedAt,
        verified: !!user.kycVerifiedAt,
        approved: user.kycStatus === 'approved',
        pending: user.kycStatus === 'pending',
        rejected: user.kycStatus === 'rejected',
        submittedAt: user.kycSubmittedAt,
        approvedAt: user.kycApprovedAt,
        rejectionReason: user.kycRejectionReason,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/kyc/me
 * Get detailed KYC information for current user
 */
exports.getMyKYC = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      'name email photo kycStatus kycDocuments ownershipDocuments kycSubmittedAt kycVerifiedAt kycApprovedAt kycRejectionReason kycVersion'
    );

    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          name: user.name,
          email: user.email,
          kycStatus: user.kycStatus,
        },
        kycInfo: {
          status: user.kycStatus,
          documentcount: user.kycDocuments.length,
          documents: user.kycDocuments,
          ownershipDocuments: user.ownershipDocuments,
          version: user.kycVersion,
          submittedAt: user.kycSubmittedAt,
          approvedAt: user.kycApprovedAt,
          rejectionReason: user.kycRejectionReason,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/kyc/list
 * List KYC submissions with advanced filtering and search (Admin only)
 */
exports.getKYCList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, status } = req.query;

    const filter = {};

    // 1. Filter by status
    if (status && status !== 'all') {
      filter.kycStatus = status;
    } else {
      // In KYC center, 'all' means everyone who at least attempted verification
      // Exclude those who haven't submitted anything yet
      filter.kycStatus = { $ne: 'not_submitted' };
    }

    // 2. Search by Name or Email
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('+kycSubmittedAt +kycApprovedAt name email kycStatus kycDocuments kycVersion kycAttempts ownershipDocuments kycRejectionReason createdAt')
        .skip(skip)
        .limit(limit)
        .sort('-createdAt'),
      User.countDocuments(filter)
    ]);

    res.status(200).json({
      status: 'success',
      results: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: { users },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/admin/kyc/summary
 * Get KYC statistics (Admin only)
 */
exports.getKYCSummary = async (req, res, next) => {
  try {
    const total = await User.countDocuments();
    const notSubmitted = await User.countDocuments({ kycStatus: 'not_submitted' });
    const pending = await User.countDocuments({ kycStatus: 'pending' });
    const approved = await User.countDocuments({ kycStatus: 'approved' });
    const rejected = await User.countDocuments({ kycStatus: 'rejected' });

    res.status(200).json({
      status: 'success',
      data: {
        total,
        kycStats: {
          notSubmitted,
          pending,
          approved,
          rejected,
          completionRate: total > 0 ? ((approved / total) * 100).toFixed(2) : 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/admin/kyc/:userId/approve
 * Approve KYC submission (Admin only)
 */
exports.approveKYC = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    // Conflict of Interest: admin cannot approve their own KYC
    if (req.params.userId === req.user._id.toString()) {
      if (session) await session.abortTransaction();
      return res.status(403).json({
        status: 'fail',
        code: 'CONFLICT_OF_INTEREST',
        message: 'Conflict of interest: you cannot approve your own KYC.',
      });
    }

    const user = await User.findById(req.params.userId).session(session);
    if (!user) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    // Business Guard
    if (user.kycStatus === 'approved') {
      if (session) await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: 'User KYC is already approved.' });
    }
    if (user.kycStatus === 'not_submitted') {
      if (session) await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: 'User has not submitted KYC.' });
    }

    const prevRole = user.role;
    user.kycStatus = 'approved';
    user.isVerified = true;
    user.kycVerifiedAt = new Date();
    user.kycApprovedBy = req.user._id;
    user.kycApprovedAt = new Date();
    user.kycRejectionReason = null;

    // ── AUTO-PROMOTE ──
    if (user.role === 'buyer') {
      user.role = 'owner';
      logger.info(`[KYC] User ${user._id} AUTO-PROMOTED from buyer to owner`);
    }

    await user.save({ session, validateBeforeSave: false });

    logger.info(`[KYC] Admin ${req.user._id} APPROVED KYC for user ${user._id} (${user.name})`);

    await logAction(
      req.user._id, 'APPROVE_KYC', 'User', user._id,
      { before: { kycStatus: prevStatus }, after: { kycStatus: 'approved' } },
      { ip: req.ip, userAgent: req.headers['user-agent'], session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({
      status: 'success',
      message: req.t('KYC.APPROVED'),
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          kycStatus: user.kycStatus,
          kycApprovedAt: user.kycApprovedAt,
        },
      },
    });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

/**
 * PATCH /api/v1/admin/kyc/:userId/reject
 * Reject KYC submission (Admin only)
 */
exports.rejectKYC = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.REJECTION_REASON_REQUIRED'),
      });
    }

    // Conflict of Interest: admin cannot reject their own KYC
    if (req.params.userId === req.user._id.toString()) {
      if (session) await session.abortTransaction();
      return res.status(403).json({
        status: 'fail',
        code: 'CONFLICT_OF_INTEREST',
        message: 'Conflict of interest: you cannot reject your own KYC.',
      });
    }

    const user = await User.findById(req.params.userId).session(session);
    if (!user) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    // Business Guard
    if (user.kycStatus === 'rejected') {
      if (session) await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: 'User KYC is already rejected.' });
    }

    const prevStatus = user.kycStatus;
    user.kycStatus = 'rejected';
    user.isVerified = false;
    user.kycRejectionReason = reason;
    user.kycAttempts = (user.kycAttempts || 0) + 1;
    await user.save({ session, validateBeforeSave: false });

    logger.info(`[KYC] Admin ${req.user._id} REJECTED KYC for user ${user._id} (${user.name}): "${reason}"`);

    await logAction(
      req.user._id, 'REJECT_KYC', 'User', user._id,
      { before: { kycStatus: prevStatus }, after: { kycStatus: 'rejected', reason } },
      { ip: req.ip, userAgent: req.headers['user-agent'], reason, session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({
      status: 'success',
      message: req.t('KYC.REJECTED'),
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          kycStatus: user.kycStatus,
          rejectionReason: user.kycRejectionReason,
        },
      },
    });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

/**
 * PATCH /api/v1/admin/kyc/:userId/revert
 * Revert KYC status to pending for re-evaluation (Admin only)
 */
exports.revertKYC = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    // Conflict of Interest guard
    if (req.params.userId === req.user._id.toString()) {
      if (session) await session.abortTransaction();
      return res.status(403).json({
        status: 'fail',
        code: 'CONFLICT_OF_INTEREST',
        message: 'Conflict of interest: you cannot revert your own KYC.',
      });
    }

    const user = await User.findById(req.params.userId).session(session);
    if (!user) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    // Business Guard
    if (user.kycStatus === 'pending') {
      if (session) await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: 'User KYC is already pending.' });
    }

    const prevStatus = user.kycStatus;
    user.kycStatus = 'pending';
    user.isVerified = false;
    user.kycRejectionReason = null;
    user.kycApprovedAt = null;
    await user.save({ session, validateBeforeSave: false });

    logger.info(`[KYC] Admin ${req.user._id} REVERTED KYC status to PENDING for user ${user._id} (${user.name})`);

    await logAction(
      req.user._id, 'REVERT_KYC', 'User', user._id,
      { before: { kycStatus: prevStatus }, after: { kycStatus: 'pending' } },
      { ip: req.ip, userAgent: req.headers['user-agent'], session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({
      status: 'success',
      message: 'KYC status reverted to pending successfully',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          kycStatus: user.kycStatus,
        },
      },
    });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

/**
 * PATCH /api/v1/admin/kyc/:userId/reset
 * Reset KYC status to allow resubmission (Admin only)
 */
exports.resetKYC = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    // Conflict of Interest guard
    if (req.params.userId === req.user._id.toString()) {
      if (session) await session.abortTransaction();
      return res.status(403).json({
        status: 'fail',
        code: 'CONFLICT_OF_INTEREST',
        message: 'Conflict of interest: you cannot reset your own KYC.',
      });
    }

    const user = await User.findById(req.params.userId).session(session);
    if (!user) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    if (user.kycStatus === 'not_submitted') {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.ALREADY_NOT_SUBMITTED'),
      });
    }

    const prevStatus = user.kycStatus;
    const prevRole = user.role;

    user.kycStatus = 'not_submitted';
    user.kycDocuments = [];
    user.kycSubmittedAt = null;
    user.kycVerifiedAt = null;
    user.kycRejectionReason = null;

    // ── ROLE REVERT ──
    if (user.role === 'owner') {
      user.role = 'buyer';
      logger.info(`[KYC] User ${user._id} REVERTED from owner to buyer`);
    }

    await user.save({ session, validateBeforeSave: false });

    logger.info(`[KYC] Admin ${req.user._id} RESET KYC for user ${user._id} (${user.name})`);

    await logAction(
      req.user._id, 'RESET_KYC', 'User', user._id,
      { before: { kycStatus: prevStatus }, after: { kycStatus: 'not_submitted' } },
      { ip: req.ip, userAgent: req.headers['user-agent'], session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({
      status: 'success',
      message: req.t('KYC.RESET'),
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          kycStatus: user.kycStatus,
        },
      },
    });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};
