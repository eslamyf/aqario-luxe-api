const Review   = require('../../models/review.model');
const Property = require('../../models/property.model');
const Booking  = require('../../models/booking.model');
const asyncHandler = require('../../utils/asyncHandler');
const { getPaginationParams } = require('../../utils/paginate');
const { clearCache } = require('../../middlewares/cache.middleware');
const { createNotification } = require('../../utils/notificationHelper');

// ─── Create Review ────────────────────────────────────────────
exports.createReview = asyncHandler(async (req, res) => {
  const { propertyId, rating, comment } = req.body;

  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json({ status: 'fail', message: req.t('PROPERTY.NOT_FOUND') });
  }
  if (property.owner.toString() === req.user._id.toString()) {
    return res.status(400).json({ status: 'fail', message: req.t('REVIEW.OWN_PROPERTY') });
  }

  // Verify user has actually completed their stay
  const booking = await Booking.findOne({
    user_id:     req.user._id,
    property_id: propertyId,
    status:      'completed',
  });
  if (!booking) {
    return res.status(403).json({
      status:  'fail',
      message: req.t('REVIEW.MUST_COMPLETE_BOOKING'),
    });
  }

  try {
    const review = await Review.create({ propertyId, userId: req.user._id, rating, comment });
    await review.populate('userId', 'name photo');

    clearCache(`/api/v1/properties/${propertyId}`);

    // Notify property owner
    await createNotification(req.io, property.owner, {
      type:    'review',
      title:   req.t('NOTIFICATION.NEW_REVIEW'),
      message: req.t('NOTIFICATION.NEW_REVIEW_MSG', { name: req.user.name, property: property.title, rating }),
      link:    `/properties/${propertyId}`,
    }).catch(() => {});

    res.status(201).json({ status: 'success', data: { review } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ status: 'fail', message: req.t('REVIEW.ALREADY_RATED') });
    }
    throw err;
  }
});

// ─── Get Property Reviews ─────────────────────────────────────
exports.getPropertyReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);

  const [total, reviews] = await Promise.all([
    Review.countDocuments({ propertyId: req.params.propertyId }),
    Review.find({ propertyId: req.params.propertyId })
      .populate('userId', 'name photo')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt')
      .lean(),
  ]);

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: { reviews },
  });
});

// ─── Update Review ────────────────────────────────────────────
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ status: 'fail', message: req.t('REVIEW.NOT_FOUND') });
  if (review.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
  }

  const { rating, comment } = req.body;
  review.rating  = rating  ?? review.rating;
  review.comment = comment ?? review.comment;
  await review.save();

  clearCache(`/api/v1/properties/${review.propertyId}`);
  res.status(200).json({ status: 'success', data: { review } });
});

// ─── Delete Review ────────────────────────────────────────────
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ status: 'fail', message: req.t('REVIEW.NOT_FOUND') });
  if (review.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
  }

  await review.deleteOne();
  clearCache(`/api/v1/properties/${review.propertyId}`);
  res.status(204).json({ status: 'success', data: null });
});
