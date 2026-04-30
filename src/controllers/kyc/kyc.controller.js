// ──────────────────────────────────────────────────────────
// KYC (Know Your Customer) Controller
// ──────────────────────────────────────────────────────────

const User = require('../../models/user.model');
const logger = require('../../utils/logger');

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
    if (!frontImage) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.FRONT_IMAGE_REQUIRED'),
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    // Store document(s) - replace old ones when new ones submitted
    user.kycDocuments = [
      {
        type: documentType,
        frontImage,
        backImage: backImage || null,
        uploadedAt: new Date(),
      },
    ];

    // Update KYC status
    user.kycStatus = 'pending';
    user.kycSubmittedAt = new Date();
    await user.save({ validateBeforeSave: false });

    logger.info(`[KYC] User ${user._id} submitted KYC documents (${documentType}) → status: PENDING`);

    res.status(200).json({
      status: 'success',
      message: req.t('KYC.SUBMITTED'),
      data: {
        kycStatus: 'pending',
        submitted: true,
        submittedAt: user.kycSubmittedAt,
        documentType,
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
      'name email kycStatus kycDocuments kycSubmittedAt kycVerifiedAt kycApprovedAt kycRejectionReason'
    );

    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    // Don't expose image URLs in documents (security)
    const documents = user.kycDocuments.map(doc => ({
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
          documentcount: user.kycDocuments.length,
          documents,
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
 * GET /api/v1/admin/kyc/pending
 * List all pending KYC submissions (Admin only)
 */
exports.getPendingKYC = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await User.countDocuments({ kycStatus: 'pending' });

    const users = await User.find({ kycStatus: 'pending' })
      .select('name email kycDocuments kycSubmittedAt kycAttempts')
      .skip(skip)
      .limit(limit)
      .sort('-kycSubmittedAt');

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
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    if (user.kycStatus === 'approved') {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.ALREADY_APPROVED'),
      });
    }

    // Atomic Update to prevent race conditions
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.params.userId, kycStatus: 'pending' },
      {
        $set: {
          kycStatus: 'approved',
          kycVerifiedAt: new Date(),
          kycApprovedBy: req.user._id,
          kycApprovedAt: new Date(),
          kycRejectionReason: null
        }
      },
      { new: true, runValidators: false }
    );

    if (!updatedUser) {
       return res.status(400).json({ status: 'fail', message: 'KYC status is no longer pending or user not found' });
    }

    logger.info(
      `[KYC] Admin ${req.user._id} (${req.user.name}) APPROVED KYC for user ${updatedUser._id} (${updatedUser.name})`
    );

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
    next(err);
  }
};

/**
 * PATCH /api/v1/admin/kyc/:userId/reject
 * Reject KYC submission (Admin only)
 */
exports.rejectKYC = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.REJECTION_REASON_REQUIRED'),
      });
    }

    if (reason.length > 500) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.REJECTION_REASON_MAX'),
      });
    }

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    if (user.kycStatus === 'rejected') {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.ALREADY_REJECTED'),
        rejectionReason: user.kycRejectionReason,
      });
    }

    // Atomic Update to prevent race conditions
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.params.userId, kycStatus: 'pending' },
      {
        $set: {
          kycStatus: 'rejected',
          kycRejectionReason: reason
        },
        $inc: { kycAttempts: 1 }
      },
      { new: true, runValidators: false }
    );

    if (!updatedUser) {
      return res.status(400).json({ status: 'fail', message: 'KYC status is no longer pending or user not found' });
    }

    logger.info(
      `[KYC] Admin ${req.user._id} (${req.user.name}) REJECTED KYC for user ${updatedUser._id} (${updatedUser.name}): "${reason}"`
    );

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
          attempts: user.kycAttempts,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/admin/kyc/:userId/reset
 * Reset KYC status to allow resubmission (Admin only)
 */
exports.resetKYC = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ status: 'fail', message: req.t('AUTH.USER_NOT_FOUND') });
    }

    if (user.kycStatus === 'not_submitted') {
      return res.status(400).json({
        status: 'fail',
        message: req.t('KYC.ALREADY_NOT_SUBMITTED'),
      });
    }

    // Reset to allow resubmission
    user.kycStatus = 'not_submitted';
    user.kycDocuments = [];
    user.kycSubmittedAt = null;
    user.kycVerifiedAt = null;
    user.kycRejectionReason = null;
    await user.save({ validateBeforeSave: false });

    logger.info(`[KYC] Admin ${req.user._id} RESET KYC for user ${user._id} (${user.name})`);

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
    next(err);
  }
};
