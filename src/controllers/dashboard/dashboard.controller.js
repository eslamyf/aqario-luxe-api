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
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
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

// @route GET /api/v1/dashboard/admin/activity
exports.adminActivity = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    
    // Optimized Aggregation Pipeline using $unionWith to fetch and normalize global events
    const activities = await User.aggregate([
      // 1. Process recent Users
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          entityId: '$_id',
          type: 'USER_REGISTERED',
          message: { $concat: ['New user registered: ', '$name'] },
          createdAt: 1,
          colorCode: 'blue'
        }
      },
      // 2. Union with recent Properties
      {
        $unionWith: {
          coll: 'properties',
          pipeline: [
            { $sort: { createdAt: -1 } },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                entityId: '$_id',
                type: 'NEW_LISTING',
                message: { $concat: ['New property listed: ', '$title'] },
                createdAt: 1,
                colorCode: 'purple'
              }
            }
          ]
        }
      },
      // 3. Union with recent Bookings
      {
        $unionWith: {
          coll: 'bookings',
          pipeline: [
            { $sort: { created_at: -1 } },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                entityId: '$_id',
                type: 'NEW_BOOKING',
                message: 'New booking reservation created.',
                createdAt: '$created_at',
                colorCode: 'gold'
              }
            }
          ]
        }
      },
      // 4. Sort the combined stream globally
      { $sort: { createdAt: -1 } },
      // 5. Final output limit
      { $limit: limit }
    ]);

    res.status(200).json({ status: 'success', data: { activities } });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/users
exports.recentUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const { search, role, status } = req.query;

    const filter = {};

    // 1️⃣ Multi-word Search (case-insensitive, out of order, partial match)
    if (search) {
      const searchTerms = search.trim().split(/\s+/);
      filter.$and = searchTerms.map(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
          $or: [
            { name: { $regex: escaped, $options: 'i' } },
            { email: { $regex: escaped, $options: 'i' } }
          ]
        };
      });
    }

    // Filter by role
    const validRoles = ['buyer', 'owner', 'agent', 'admin'];
    if (role && validRoles.includes(role)) {
      filter.role = role;
    }

    // Filter by status: active | banned
    if (status === 'banned')  filter.isBanned = true;
    if (status === 'active')  filter.isBanned = false;

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .select('name email role createdAt isActive isBanned isVerified kycStatus photo')
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      page,
      total,
      pages: Math.ceil(total / limit),
      results: users.length,
      data: { users },
    });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/bookings
exports.recentBookings = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const { search, status } = req.query;

    const filter = {};

    // 1. Filter by Status
    if (status && status !== 'all') {
      filter.status = status;
    }

    // 2. Search by Client Name, Email or Property Title
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      
      // Find matching users and properties to get their IDs
      const [users, properties] = await Promise.all([
        User.find({ $or: [{ name: searchRegex }, { email: searchRegex }] }).select('_id'),
        Property.find({ title: searchRegex }).select('_id')
      ]);

      const userIds = users.map(u => u._id);
      const propertyIds = properties.map(p => p._id);

      filter.$or = [
        { user_id: { $in: userIds } },
        { property_id: { $in: propertyIds } }
      ];
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort('-created_at')
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'name email photo')
        .populate('property_id', 'title price location images owner')
        .lean(),
      Booking.countDocuments(filter)
    ]);

    // Attach payment info for each booking
    const bookingsWithPayments = await Promise.all(bookings.map(async (b) => {
      const payment = await Payment.findOne({ booking: b._id }).select('status paymentMethod totalAmount createdAt');
      return { ...b, payment };
    }));

    res.status(200).json({
      status: 'success',
      page,
      total,
      pages: Math.ceil(total / limit),
      results: bookings.length,
      data: { bookings: bookingsWithPayments }
    });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/payments
exports.recentPayments = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const payments = await Payment.find().sort('-createdAt').skip(skip).limit(limit)
      .populate('user', 'name email').populate('booking', 'start_date end_date amount');
    const total = await Payment.countDocuments();
    res.status(200).json({ status: 'success', page, total, pages: Math.ceil(total / limit), results: payments.length, data: { payments } });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/properties
exports.recentProperties = async (req, res, next) => {
  try {
    const { page, limit, skip } = res.locals.pagination;
    const { search, type, isApproved, status, priceRange } = req.query;

    const filter = {};

    // 1. Search by title OR Owner Name
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      
      // Find users matching the search string to search by owner name
      const matchingUsers = await User.find({ name: searchRegex }).select('_id');
      const ownerIds = matchingUsers.map(u => u._id);

      filter.$or = [
        { title: searchRegex },
        { owner: { $in: ownerIds } }
      ];
    }

    // 2. Filter by type (villa, apartment, etc)
    if (type && type !== 'all') {
      filter.type = type;
    }

    // 3. Filter by approval status
    // Use $ne: true for pending to catch both false and undefined values
    if (isApproved === 'true')  filter.isApproved = true;
    if (isApproved === 'false') filter.isApproved = { $ne: true };

    // 4. Filter by listing status (available, reserved, sold)
    if (status && status !== 'all') {
      filter.status = status;
    }

    // 5. Filter by price range
    if (priceRange === 'low')    filter.price = { $lt: 500000 };
    if (priceRange === 'medium') filter.price = { $gte: 500000, $lte: 5000000 };
    if (priceRange === 'high')   filter.price = { $gt: 5000000 };

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('owner', 'name email'),
      Property.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      page,
      total,
      pages: Math.ceil(total / limit),
      results: properties.length,
      data: { properties },
    });
  } catch (err) {
    next(err);
  }
};

// ── Admin Management ──────────────────────────────────────────

// @route PATCH /api/v1/dashboard/admin/users/:id/role
exports.changeUserRole = async (req, res, next) => {
  try {
    // 1) Prevent self-modification
    if (req.user.id === req.params.id) {
      return res.status(403).json({ status: 'fail', message: 'You cannot modify your own role.' });
    }

    const { role } = req.body;
    const validRoles = ['buyer', 'owner', 'agent']; // 'admin' is intentionally excluded
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid role. Allowed values: ${validRoles.join(', ')}. Admin role cannot be assigned this way.`
      });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.USER_NOT_FOUND') });
    
    // 2) Prevent downgrading other admins
    if (user.role === 'admin') {
      return res.status(403).json({ status: 'fail', message: 'You cannot downgrade another admin.' });
    }

    user.role = role;
    await user.save();
    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.ROLE_UPDATED'), data: { user } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/users/:id/ban
exports.toggleBanUser = async (req, res, next) => {
  try {
    // Prevent self-banning
    if (req.user.id === req.params.id) {
      return res.status(403).json({ status: 'fail', message: 'You cannot ban your own account.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.USER_NOT_FOUND') });

    // Prevent banning admins
    if (user.role === 'admin') {
      return res.status(403).json({ status: 'fail', message: 'Admin accounts cannot be banned.' });
    }

    user.isBanned = !user.isBanned;
    user.isActive = !user.isBanned;
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
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { isApproved: true, status: 'available' },
      { new: true, runValidators: false }
    );

    if (!property) {
      return res.status(404).json({ status: 'fail', message: 'Property not found' });
    }

    res.status(200).json({ status: 'success', data: { property } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/properties/:id/reject
exports.rejectProperty = async (req, res, next) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { isApproved: false },
      { new: true, runValidators: false }
    );

    if (!property) {
      return res.status(404).json({ status: 'fail', message: 'Property not found' });
    }

    res.status(200).json({ status: 'success', data: { property } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/auctions/:id/approve
exports.approveAuction = async (req, res, next) => {
  try {
    const auction = await Auction.findById(req.params.id);
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
    const period = req.query.period || 'monthly'; // 'monthly' | 'yearly'
    
    let groupId = { year: { $year: '$createdAt' } };
    let sortObj = { '_id.year': 1 };
    
    if (period === 'monthly') {
      groupId.month = { $month: '$createdAt' };
      sortObj['_id.month'] = 1;
    }

    const report = await Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.PAID } },
      {
        $group: {
          _id: groupId,
          totalRevenue: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: sortObj },
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
    const review = await Review.findById(req.params.id);
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
    const payments = await Payment.find({ user: req.user._id })
      .skip(skip).limit(limit)
      .populate({
        path: 'booking',
        select: 'start_date end_date amount status property_id',
        populate: { path: 'property_id', select: 'title price location images' }
      })
      .sort('-createdAt');
    const total = await Payment.countDocuments({ user: req.user._id });
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
      Payment.find({ user: userId }).sort('-createdAt').limit(limit),
      Inquiry.find({ $or: [{ sender: userId }, { receiver: userId }] }).sort('-createdAt').limit(limit).populate('property', 'title'),
    ]);
    res.status(200).json({ status: 'success', data: { recentBookings, recentPayments, recentInquiries } });
  } catch (err) {
    next(err);
  }
};
