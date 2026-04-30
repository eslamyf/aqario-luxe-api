const mongoose  = require('mongoose');
const User      = require('../../models/user.model');
const Property  = require('../../models/property.model');
const Booking   = require('../../models/booking.model');
const Payment   = require('../../models/payment.model');
const Favorite  = require('../../models/favorite.model');
const Inquiry   = require('../../models/inquiry.model');
const Auction   = require('../../models/auction.model');
const Review    = require('../../models/review.model');
const Bid       = require('../../models/bid.model');
const { PAYMENT_STATUS } = require('../../utils/constants');

// ══════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════

// @route GET /api/v1/dashboard/admin/stats
exports.adminStats = async (req, res, next) => {
  try {
    const [totalUsers, totalProperties, totalBookings, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Booking.countDocuments(),
      // FIX #3 — Change 'completed' to 'paid'
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.status(200).json({
      status: 'success',
      data: { totalUsers, totalProperties, totalBookings, totalRevenue: totalRevenue[0]?.total || 0 },
    });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/users
exports.recentUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const users = await User.find().sort('-createdAt').skip(skip).limit(limit)
      .select('name email role createdAt isActive isBanned');
    const total = await User.countDocuments();
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: users.length, data: { users } });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/bookings
exports.recentBookings = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const bookings = await Booking.find().sort('-createdAt').skip(skip).limit(limit)
      .populate('user_id', 'name email').populate('property_id', 'title price');
    const total = await Booking.countDocuments();
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: bookings.length, data: { bookings } });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/payments
exports.recentPayments = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const payments = await Payment.find().sort('-createdAt').skip(skip).limit(limit)
      .populate('user_id', 'name email').populate('booking_id', 'start_date end_date amount');
    const total = await Payment.countDocuments();
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: payments.length, data: { payments } });
  } catch (err) {
    next(err);
  }
};

// ── Admin Management ──────────────────────────────────────────

// @route PATCH /api/v1/dashboard/admin/users/:id/role
exports.changeUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['buyer', 'owner', 'agent', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ status: 'fail', message: req.t('DASHBOARD.INVALID_ROLE', { roles: validRoles.join(', ') }) });
    }
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.USER_NOT_FOUND') });
    user.role = role;
    await user.save();
    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.ROLE_UPDATED'), data: { user } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/users/:id/ban
// FIX — Use isBanned that now exists in the schema
exports.toggleBanUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.USER_NOT_FOUND') });
    user.isBanned = !user.isBanned;
    await user.save();
    res.status(200).json({
      status: 'success',
      message: user.isBanned ? req.t('DASHBOARD.USER_BANNED') : req.t('DASHBOARD.USER_UNBANNED'),
      data: { user },
    });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/properties/:id/approve
exports.approveProperty = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id).lean();
    if (!property) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.PROPERTY_NOT_FOUND') });
    property.isApproved = true;
    await property.save();
    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.PROPERTY_APPROVED'), data: { property } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/properties/:id/reject
exports.rejectProperty = async (req, res, next) => {
  try {
    const property = await Property.findById(req.params.id).lean();
    if (!property) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.PROPERTY_NOT_FOUND') });
    property.isApproved = false;
    await property.save();
    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.PROPERTY_REJECTED'), data: { property } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/auctions/:id/approve
exports.approveAuction = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.id).lean();
    if (!auction) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.AUCTION_NOT_FOUND') });
    auction.isApproved = true;
    // FIX — لا نغير status هنا، الـ cron job يتولى ذلك
    await auction.save();
    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.AUCTION_APPROVED'), data: { auction } });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/reports/revenue
// FIX — Add year to group to differentiate between different years
exports.revenueReport = async (req, res, next) => {
  try {
    const report = await Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.PAID } }, // FIX — استخدام constant بدل 'paid'
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          totalRevenue: { $sum: '$amount' },
          count:        { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    res.status(200).json({ status: 'success', data: { report } });
  } catch (err) {
    next(err);
  }
};

// @route DELETE /api/v1/dashboard/admin/reviews/:id
exports.deleteReview = async (req, res, next) => {
  try {
    // FIX — استخدام deleteOne() بدل findByIdAndDelete() حتى يُطلق الـ post('deleteOne') hook
    // الذي يستدعي calcAverageRatings تلقائياً لإعادة حساب avgRating على العقار
    const review = await Review.findById(req.params.id).lean();
    if (!review) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.REVIEW_NOT_FOUND') });
    await review.deleteOne();
    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.REVIEW_DELETED') });
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════
//  OWNER DASHBOARD
// ══════════════════════════════════════════════════════

exports.ownerStats = async (req, res, next) => {
  try {
    const myProperties = await Property.find({ owner: req.user._id }).select('_id');
    const propertyIds  = myProperties.map((p) => p._id);

    const [totalProperties, totalBookings, pendingBookings, revenue] = await Promise.all([
      Property.countDocuments({ owner: req.user._id }),
      Booking.countDocuments({ property_id: { $in: propertyIds } }),
      Booking.countDocuments({ property_id: { $in: propertyIds }, status: 'pending' }),
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.PAID } }, // FIX — استخدام constant بدل 'paid'
        { $lookup: { from: 'bookings', localField: 'booking_id', foreignField: '_id', as: 'booking' } },
        { $unwind: '$booking' },
        { $match: { 'booking.property_id': { $in: propertyIds } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    res.status(200).json({
      status: 'success',
      data:   { totalProperties, totalBookings, pendingBookings, revenue: revenue[0]?.total || 0 },
    });
  } catch (err) {
    next(err);
  }
};

exports.ownerProperties = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const properties = await Property.find({ owner: req.user._id }).sort('-createdAt').skip(skip).limit(limit);
    const total = await Property.countDocuments({ owner: req.user._id });
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: properties.length, data: { properties } });
  } catch (err) {
    next(err);
  }
};

// FIX #8 — Add missing const { page, limit, skip }
exports.ownerBookings = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination; // FIX — كانت مستخدمة بدون تعريف
    const myProperties = await Property.find({ owner: req.user._id }).select('_id');
    const propertyIds  = myProperties.map((p) => p._id);

    const bookings = await Booking.find({ property_id: { $in: propertyIds } })
      .skip(skip).limit(limit)
      .populate('user_id',     'name email phone')
      .populate('property_id', 'title price location')
      .sort('-created_at');

    const total = await Booking.countDocuments({ property_id: { $in: propertyIds } });
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: bookings.length, data: { bookings } });
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════
//  BUYER DASHBOARD
// ══════════════════════════════════════════════════════

exports.buyerStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Parallel Execution for low latency
    const [totalBookings, activeBookings, savedProperties, spentResult] = await Promise.all([
      Booking.countDocuments({ user_id: userId }),
      Booking.countDocuments({ user_id: userId, status: { $in: ['approved', 'pending'] } }),
      Favorite.countDocuments({ user_id: userId }),
      Payment.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), status: PAYMENT_STATUS.PAID } },
        { $group: { _id: null, totalSpent: { $sum: '$totalAmount' } } }
      ])
    ]);

    const totalSpent = spentResult[0]?.totalSpent || 0;

    res.status(200).json({
      status: 'success',
      data: {
        totalBookings,
        activeBookings,
        savedProperties,
        totalSpent
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.buyerBookings = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const bookings = await Booking.find({ user_id: req.user._id })
      .skip(skip).limit(limit)
      .populate('property_id', 'title price location images').sort('-created_at');
    const total = await Booking.countDocuments({ user_id: req.user._id });
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: bookings.length, data: { bookings } });
  } catch (err) {
    next(err);
  }
};

exports.buyerPayments = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const payments = await Payment.find({ user_id: req.user._id })
      .skip(skip).limit(limit)
      .populate('booking_id', 'start_date end_date property_id').sort('-createdAt');
    const total = await Payment.countDocuments({ user_id: req.user._id });
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: payments.length, data: { payments } });
  } catch (err) {
    next(err);
  }
};

// FIX — Use countDocuments for true total
exports.buyerFavorites = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const favorites = await Favorite.find({ user_id: req.user._id })
      .populate('property_id', 'title price location images avgRating')
      .skip(skip).limit(limit).sort('-created_at');
    const total = await Favorite.countDocuments({ user_id: req.user._id }); // FIX — countDocuments بدل favorites.length
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: favorites.length, data: { favorites } });
  } catch (err) {
    next(err);
  }
};

exports.activityFeed = async (req, res, next) => {
  try {
    const limit  = 5;
    const userId = req.user._id;
    const [recentBookings, recentPayments, recentInquiries] = await Promise.all([
      Booking.find({ user_id: userId }).sort('-created_at').limit(limit).populate('property_id', 'title'),
      Payment.find({ user_id: userId }).sort('-createdAt').limit(limit),
      Inquiry.find({ $or: [{ sender: userId }, { receiver: userId }] }).sort('-createdAt').limit(limit).populate('property', 'title'),
    ]);
    res.status(200).json({ status: 'success', data: { recentBookings, recentPayments, recentInquiries } });
  } catch (err) {
    next(err);
  }
};
