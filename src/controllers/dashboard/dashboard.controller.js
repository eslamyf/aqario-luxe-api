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
const Subscription = require('../../models/subscription.model');
const { PAYMENT_STATUS, SUBSCRIPTION_STATUS } = require('../../utils/constants');
const { logAction, getAuditLogs } = require('../../services/audit.service');

// ══════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════

// @route GET /api/v1/dashboard/admin/stats
exports.adminStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalProperties,
      totalBookings,
      pendingKyc,
      paymentRevenue,
      subscriptionRevenue,
      activeSubscriptions,
    ] = await Promise.all([
      User.countDocuments(),
      Property.countDocuments(),
      Booking.countDocuments(),
      User.countDocuments({ kycStatus: 'pending' }),
      // Revenue from property payments (platform commission)
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.PAID } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, platformFees: { $sum: '$platformFee' } } },
      ]),
      // Revenue from subscriptions
      Subscription.aggregate([
        { $match: { status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.EXPIRED] } } },
        { $group: { _id: null, total: { $sum: '$price' }, count: { $sum: 1 } } },
      ]),
      // Count active subscriptions
      Subscription.countDocuments({ status: SUBSCRIPTION_STATUS.ACTIVE }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalUsers,
        totalProperties,
        totalBookings,
        pendingKyc,
        // Payment revenue
        totalRevenue:     paymentRevenue[0]?.total       || 0,
        platformFees:     paymentRevenue[0]?.platformFees || 0,
        // Subscription revenue
        subscriptionRevenue:  subscriptionRevenue[0]?.total || 0,
        subscriptionCount:    subscriptionRevenue[0]?.count || 0,
        activeSubscriptions,
        // Combined platform revenue
        totalPlatformRevenue: (paymentRevenue[0]?.platformFees || 0) + (subscriptionRevenue[0]?.total || 0),
      },
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

    const prevRole = user.role;
    user.role = role;
    await user.save();

    // ── Audit Trail ──────────────────────────────────────────────
    await logAction(
      req.user._id, 'CHANGE_ROLE', 'User', user._id,
      { before: { role: prevRole }, after: { role } },
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.ROLE_UPDATED'), data: { user } });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/users/:id/ban
exports.toggleBanUser = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    // Prevent self-banning
    if (req.user.id === req.params.id) {
      if (session) await session.abortTransaction();
      return res.status(403).json({ status: 'fail', message: 'You cannot ban your own account.' });
    }

    const user = await User.findById(req.params.id).session(session);
    if (!user) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.USER_NOT_FOUND') });
    }

    // Prevent banning admins
    if (user.role === 'admin') {
      if (session) await session.abortTransaction();
      return res.status(403).json({ status: 'fail', message: 'Admin accounts cannot be banned.' });
    }

    const wasBanned = user.isBanned;
    user.isBanned = !user.isBanned;
    user.isActive = !user.isBanned;
    await user.save({ session });

    // ── Audit Trail ──────────────────────────────────────────────
    const banAction = user.isBanned ? 'BAN_USER' : 'UNBAN_USER';
    await logAction(
      req.user._id, banAction, 'User', user._id,
      { before: { isBanned: wasBanned }, after: { isBanned: user.isBanned } },
      { ip: req.ip, userAgent: req.headers['user-agent'], session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({
      status: 'success',
      message: user.isBanned ? req.t('DASHBOARD.USER_BANNED') : req.t('DASHBOARD.USER_UNBANNED'),
      data: { user },
    });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

// @route PATCH /api/v1/dashboard/admin/properties/:id/approve
exports.approveProperty = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const existing = await Property.findById(req.params.id).session(session);
    if (!existing) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: 'Property not found' });
    }

    // Business Guard
    if (existing.isApproved) {
      if (session) await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: 'Property is already approved.' });
    }

    existing.isApproved = true;
    existing.status = 'available';
    await existing.save({ session });

    // ── Audit Trail ──────────────────────────────────────────────
    await logAction(
      req.user._id, 'APPROVE_PROPERTY', 'Property', existing._id,
      { before: { isApproved: false, status: existing.status }, after: { isApproved: true, status: 'available' } },
      { ip: req.ip, userAgent: req.headers['user-agent'], session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({ status: 'success', data: { property: existing } });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

// @route PATCH /api/v1/dashboard/admin/properties/:id/reject
exports.rejectProperty = async (req, res, next) => {
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const existing = await Property.findById(req.params.id).session(session);
    if (!existing) {
      if (session) await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: 'Property not found' });
    }

    // Business Guard
    if (!existing.isApproved && existing.status === 'unavailable') {
      if (session) await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: 'Property is already rejected/unavailable.' });
    }

    const prevStatus = existing.status;
    const prevApproved = existing.isApproved;
    existing.isApproved = false;
    existing.status = 'unavailable';
    await existing.save({ session });

    // ── Audit Trail ──────────────────────────────────────────────
    await logAction(
      req.user._id, 'REJECT_PROPERTY', 'Property', existing._id,
      { before: { isApproved: prevApproved, status: prevStatus }, after: { isApproved: false, status: 'unavailable' } },
      { ip: req.ip, userAgent: req.headers['user-agent'], reason: req.body.reason || null, session }
    );

    if (session) await session.commitTransaction();
    res.status(200).json({ status: 'success', data: { property: existing } });
  } catch (err) {
    if (session) await session.abortTransaction();
    next(err);
  } finally {
    if (session) session.endSession();
  }
};

// @route PATCH /api/v1/dashboard/admin/auctions/:id/approve
exports.approveAuction = async (req, res, next) => {
  try {
    const auction = req.guardedResource ? await Auction.findById(req.params.id) : await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.AUCTION_NOT_FOUND') });

    const wasApproved = auction.isApproved;
    auction.isApproved = true;
    // Cron job handles status transition — do not set status here
    await auction.save();

    // ── Audit Trail ──────────────────────────────────────────────
    await logAction(
      req.user._id, 'APPROVE_AUCTION', 'Auction', auction._id,
      { before: { isApproved: wasApproved }, after: { isApproved: true } },
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

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
    // Use deleteOne() (not findByIdAndDelete) to trigger post('deleteOne') hook
    // which calls calcAverageRatings and updates the property avgRating
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.REVIEW_NOT_FOUND') });

    const snapshot = { userId: review.userId, propertyId: review.propertyId, rating: review.rating };
    await review.deleteOne();

    // ── Audit Trail ──────────────────────────────────────────────
    await logAction(
      req.user._id, 'DELETE_REVIEW', 'Review', req.params.id,
      { before: snapshot, after: null },
      { ip: req.ip, userAgent: req.headers['user-agent'], reason: req.body.reason || null }
    );

    res.status(200).json({ status: 'success', message: req.t('DASHBOARD.REVIEW_DELETED') });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/v1/dashboard/admin/audit-logs
exports.getAuditLogs = async (req, res, next) => {
  try {
    const result = await getAuditLogs(req.query);
    res.status(200).json({
      status: 'success',
      ...result,
      data: { logs: result.logs },
    });
  } catch (err) {
    next(err);
  }
};

// @route PATCH /api/v1/dashboard/admin/users/:id/permissions
exports.updateUserPermissions = async (req, res, next) => {
  try {
    // Prevent self-modification of permissions
    if (req.user.id === req.params.id) {
      return res.status(403).json({ status: 'fail', message: 'You cannot modify your own permissions.' });
    }

    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ status: 'fail', message: 'permissions must be an array.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: 'fail', message: req.t('DASHBOARD.USER_NOT_FOUND') });

    if (user.role !== 'admin') {
      return res.status(400).json({ status: 'fail', message: 'Permissions can only be set on admin accounts.' });
    }

    const prevPermissions = [...(user.permissions || [])];
    user.permissions = permissions;
    await user.save();

    // ── Audit Trail ──────────────────────────────────────────────
    await logAction(
      req.user._id, 'UPDATE_PERMISSIONS', 'User', user._id,
      { before: { permissions: prevPermissions }, after: { permissions } },
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    res.status(200).json({
      status: 'success',
      message: 'Permissions updated successfully.',
      data: { user: { _id: user._id, name: user.name, email: user.email, permissions: user.permissions } },
    });
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
        { $match: { status: PAYMENT_STATUS.PAID } },
        { $lookup: { from: 'bookings', localField: 'booking', foreignField: '_id', as: 'bookingDoc' } },
        { $unwind: '$bookingDoc' },
        { $match: { 'bookingDoc.property_id': { $in: propertyIds } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
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
