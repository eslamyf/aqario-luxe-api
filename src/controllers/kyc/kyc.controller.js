// ──────────────────────────────────────────────────────────
// KYC (Know Your Customer) Controller
// ──────────────────────────────────────────────────────────

const User = require('../../models/user.model');
const logger = require('../../utils/logger');
const { logAction } = require('../../services/audit.service');
const asyncHandler = require('../../utils/asyncHandler');
const { getPaginationParams } = require('../../utils/paginate');
const mongoose = require('mongoose');
const { createNotification } = require('../../utils/notificationHelper');

// ──────────────────────────────────────────────────────────
// USER ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/kyc
 * Upload KYC documents (National ID, Passport, etc.)
 */
exports.uploadKYCDocuments = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
  }

  const existingDoc = user.kycDocuments && user.kycDocuments[0];
  const finalDocumentType = req.body.documentType || 'national_id';
  const finalFrontImage = req.body.frontImage || null;
  const finalBackImage = req.body.backImage || null;
  const finalLivePhoto = req.body.livePhoto || null;
  const finalNationality = req.body.nationality || null;
  const finalPhoneNumber = req.body.phoneNumber || null;

  // Validate document type
  const VALID_TYPES = ['national_id', 'passport', 'drivers_license'];
  if (!VALID_TYPES.includes(finalDocumentType)) {
    return res.status(400).json({
      status: 'fail',
      message: 'KYC.INVALID_DOC_TYPE',
    });
  }

  if (!finalFrontImage) {
    return res.status(400).json({
      status: 'fail',
      message: 'KYC.FRONT_IMAGE_REQUIRED',
    });
  }

  if (!finalNationality || finalNationality.trim() === '') {
    return res.status(400).json({ status: 'fail', message: 'KYC.NATIONALITY_REQUIRED' });
  }
  if (!finalPhoneNumber || finalPhoneNumber.trim() === '') {
    return res.status(400).json({ status: 'fail', message: 'KYC.PHONE_NUMBER_REQUIRED' });
  }
  if (!finalLivePhoto || finalLivePhoto.trim() === '') {
    return res.status(400).json({ status: 'fail', message: 'KYC.LIVE_PHOTO_REQUIRED' });
  }

  // ── Finalize ownership docs ──────
  user.ownershipDocuments = user.ownershipDocuments.map(doc => {
    doc.isTemporary = false;
    return doc;
  });

  // Store identity document(s) - replace old ones or clear if empty
  if (finalFrontImage) {
    user.kycDocuments = [
      {
        type: finalDocumentType || 'national_id',
        frontImage: finalFrontImage,
        backImage: finalBackImage || null,
        uploadedAt: new Date(),
      },
    ];
  } else {
    user.kycDocuments = [];
  }

  // Store new KYC fields
  user.kycNationality = finalNationality;
  user.kycPhoneNumber = finalPhoneNumber;
  user.kycLivePhoto = finalLivePhoto;

  // Update KYC status and version
  if (user.kycDocuments.length === 0 && user.ownershipDocuments.length === 0) {
    user.kycStatus = 'not_submitted';
    user.kycNationality = undefined;
    user.kycPhoneNumber = undefined;
    user.kycLivePhoto = undefined;
    user.kycSubmittedAt = undefined;
  } else {
    user.kycStatus = 'pending';
    user.kycSubmittedAt = new Date();
    user.kycVersion += 1; // Increment semantic version on final submission
  }

  await user.save({ validateBeforeSave: false });

  logger.info(`[KYC] User ${user._id} submitted KYC (${finalDocumentType}) | ${user.ownershipDocuments.length} ownership docs → PENDING`);

  // Instantly send a socket notification to all admin users upon a successful KYC submission
  if (user.kycStatus === 'pending') {
    try {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await createNotification(req.io, admin._id, {
          type: 'system',
          title: req.t('NOTIFICATION.NEW_KYC_SUBMISSION'),
          message: req.t('NOTIFICATION.NEW_KYC_SUBMISSION_MSG', { name: user.name }),
          link: '/admin/kyc'
        });
      }
    } catch (notifErr) {
      logger.error(`[KYC] Failed to send socket notification to admins: ${notifErr.message}`);
    }
  }

  res.status(200).json({
    status: 'success',
    message: req.t('KYC.SUBMITTED'),
    data: {
      kycStatus: 'pending',
      submitted: true,
      submittedAt: user.kycSubmittedAt,
      documentType: finalDocumentType,
      ownershipDocumentCount: user.ownershipDocuments.length
    },
  });
});

/**
 * POST /api/v1/kyc/upload
 * Upload a single KYC image to Cloudinary and return the URL
 */
exports.uploadKYCImageSingle = asyncHandler(async (req, res) => {
  if (!req.body.imageUrl) {
    return res.status(400).json({ status: 'fail', message: 'Image upload failed' });
  }

  res.status(200).json({
    status: 'success',
    data: {
      url: req.body.imageUrl,
    },
  });
});

/**
 * POST /api/v1/kyc/ownership/upload
 * Upload a single ownership document file (PDF/image) to Cloudinary
 * and immediately save it to user.ownershipDocuments in DB
 */
exports.uploadOwnershipFile = asyncHandler(async (req, res) => {
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
});

/**
 * DELETE /api/v1/kyc/ownership/:docId
 * Remove an ownership document by its MongoDB _id
 */
exports.deleteOwnershipFile = asyncHandler(async (req, res) => {
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
});

/**
 * DELETE /api/v1/kyc/identity-document
 * Immediately remove identity document (front/back card or passport) from DB
 */
exports.deleteIdentityDocument = asyncHandler(async (req, res) => {
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
});

/**
 * GET /api/v1/kyc/status
 * Check current KYC verification status
 */
exports.getKYCStatus = asyncHandler(async (req, res) => {
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
});

/**
 * GET /api/v1/kyc/me
 * Get detailed KYC information for current user
 */
exports.getMyKYC = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    'name email photo kycStatus kycDocuments kycNationality kycPhoneNumber kycLivePhoto ownershipDocuments kycSubmittedAt kycVerifiedAt kycApprovedAt kycRejectionReason kycVersion'
  );

  if (!user) {
    return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
  }

  // Expose image URLs in documents for in-browser preview (omitting sensitive images for security)
  const documents = user.kycDocuments.map(doc => ({
    _id: doc._id,
    type: doc.type,
    uploadedAt: doc.uploadedAt,
  }));

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
        nationality: user.kycNationality,
        phoneNumber: user.kycPhoneNumber,
        livePhoto: user.kycLivePhoto,
        documentcount: user.kycDocuments.length,
        documents,
        ownershipDocuments: user.ownershipDocuments,
        version: user.kycVersion,
        submittedAt: user.kycSubmittedAt,
        approvedAt: user.kycApprovedAt,
        rejectionReason: user.kycRejectionReason,
      },
    },
  });
});

// ──────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/kyc/list
 * List KYC submissions with advanced filtering and search (Admin only)
 */
exports.getKYCList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query, 50, 100);
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
      .select('+kycSubmittedAt +kycApprovedAt name email kycStatus kycDocuments kycNationality kycPhoneNumber kycLivePhoto kycVersion kycAttempts ownershipDocuments kycRejectionReason createdAt')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt')
      .lean(),
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
});

/**
 * GET /api/v1/admin/kyc/summary
 * Get KYC statistics (Admin only)
 */
exports.getKYCSummary = asyncHandler(async (req, res) => {
  const [total, notSubmitted, pending, approved, rejected] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ kycStatus: 'not_submitted' }),
    User.countDocuments({ kycStatus: 'pending' }),
    User.countDocuments({ kycStatus: 'approved' }),
    User.countDocuments({ kycStatus: 'rejected' })
  ]);

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
});

/**
 * PATCH /api/v1/admin/kyc/:userId/approve
 * Approve KYC submission (Admin only)
 */
exports.approveKYC = asyncHandler(async (req, res) => {
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

    const prevStatus = user.kycStatus;
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
    throw err;
  } finally {
    if (session) session.endSession();
  }
});

/**
 * PATCH /api/v1/admin/kyc/:userId/reject
 * Reject KYC submission (Admin only)
 */
exports.rejectKYC = asyncHandler(async (req, res) => {
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
    throw err;
  } finally {
    if (session) session.endSession();
  }
});

/**
 * PATCH /api/v1/admin/kyc/:userId/revert
 * Revert KYC status to pending for re-evaluation (Admin only)
 */
exports.revertKYC = asyncHandler(async (req, res) => {
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
    throw err;
  } finally {
    if (session) session.endSession();
  }
});

/**
 * PATCH /api/v1/admin/kyc/:userId/reset
 * Reset KYC status to allow resubmission (Admin only)
 */
exports.resetKYC = asyncHandler(async (req, res) => {
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

    user.kycStatus = 'not_submitted';
    user.kycDocuments = [];
    user.kycNationality = undefined;
    user.kycPhoneNumber = undefined;
    user.kycLivePhoto = undefined;
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
    throw err;
  } finally {
    if (session) session.endSession();
  }
});

/**
 * GET /api/v1/kyc/ownership/download/:userId/:docId
 * Securely enforces a forced download of the ownership document using its original file format.
 */
exports.downloadOwnershipFile = asyncHandler(async (req, res) => {
  const { userId, docId } = req.params;

  // Enforce access control: Admin or the owner of the document
  if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to download this document',
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ status: 'fail', message: 'User not found' });
  }

  const doc = user.ownershipDocuments.find(d => d._id.toString() === docId);
  if (!doc) {
    return res.status(404).json({ status: 'fail', message: 'Document not found' });
  }

  const fileUrl = doc.fileUrl || doc.imageUrl;
  if (!fileUrl) {
    return res.status(400).json({ status: 'fail', message: 'Document file URL is missing' });
  }

  // Parse original file extension from URL or original filename
  const path = require('path');
  const url = require('url');
  const parsedUrl = url.parse(fileUrl);
  let ext = path.extname(parsedUrl.pathname).toLowerCase();
  if (!ext && doc.fileName) {
    ext = path.extname(doc.fileName).toLowerCase();
  }

  // Map extensions to strict MIME types
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Extract original filename (without extension) from DB or URL
  let originalFileName = 'document';
  if (doc.fileName) {
    originalFileName = path.basename(doc.fileName, path.extname(doc.fileName));
  } else if (parsedUrl.pathname) {
    originalFileName = path.basename(parsedUrl.pathname, path.extname(parsedUrl.pathname));
  }

  // Sanitize the filename to prevent HTTP Header Injection (remove newlines, carriage returns, quotes, and backslashes)
  let sanitizedFileName = originalFileName.replace(/[\r\n"\\]/g, '').trim();
  if (!sanitizedFileName) {
    sanitizedFileName = 'document';
  }

  // Get clean extension without leading dot
  const cleanExt = (ext || '.bin').replace(/^\./, '');
  const downloadName = `${sanitizedFileName}_${docId}.${cleanExt}`;

  // Download and stream response securely from Cloudinary/storage
  const https = require('https');
  const http = require('http');
  const downloadClient = fileUrl.startsWith('https') ? https : http;

  const requestFile = (targetUrl) => {
    downloadClient.get(targetUrl, (streamRes) => {
      // Handle potential 301/302 redirects
      if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
        return requestFile(streamRes.headers.location);
      }

      if (streamRes.statusCode !== 200) {
        return res.status(500).json({
          status: 'fail',
          message: `Storage server returned status code ${streamRes.statusCode}`,
        });
      }

      // Set forced download headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

      streamRes.pipe(res);
    }).on('error', (err) => {
      logger.error(`[KYC] Ownership doc download error: ${err.message}`);
      res.status(500).json({ status: 'fail', message: 'Error fetching file from storage' });
    });
  };

  requestFile(fileUrl);
});
