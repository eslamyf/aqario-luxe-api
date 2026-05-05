// ──────────────────────────────────────────────────────────
// Subscription Controller
// ──────────────────────────────────────────────────────────

const Subscription = require('../models/subscription.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const { logAction } = require('../services/audit.service');
const { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } = require('../utils/constants');

// ──────────────────────────────────────────────────────────
// PUBLIC / USER ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/subscriptions/plans
 * List all available subscription plans
 */
exports.getPlans = (req, res) => {
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => ({
    id: key,
    ...plan,
  }));

  res.status(200).json({
    status: 'success',
    data: { plans },
  });
};

/**
 * GET /api/v1/subscriptions/my
 * Get current user's active subscription
 */
exports.getMySubscription = async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({
      user: req.user._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
    }).lean();

    res.status(200).json({
      status: 'success',
      data: sub || null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/subscriptions/history
 * Get all subscriptions for current user
 */
exports.getMySubscriptionHistory = async (req, res, next) => {
  try {
    const subscriptions = await Subscription.find({ user: req.user._id })
      .sort('-createdAt')
      .lean();

    res.status(200).json({
      status: 'success',
      results: subscriptions.length,
      data: { subscriptions },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/subscriptions/subscribe
 * Create a new subscription (owner/agent only)
 */
exports.subscribe = async (req, res, next) => {
  try {
    const { plan } = req.body;

    // Validate plan
    if (!plan || !SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid plan. Available plans: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`,
      });
    }

    // Check for existing active subscription
    const existing = await Subscription.findOne({
      user: req.user._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
    });

    if (existing) {
      return res.status(400).json({
        status: 'fail',
        message: 'You already have an active subscription.',
        data: {
          currentPlan: existing.plan,
          endDate: existing.endDate,
        },
      });
    }

    // Create subscription
    const planConfig = SUBSCRIPTION_PLANS[plan];
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000);

    const subscription = await Subscription.create({
      user: req.user._id,
      plan,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      maxListings: planConfig.maxListings,
      listingsUsedThisMonth: 0,
      price: planConfig.price,
      currency: planConfig.currency,
      startDate,
      endDate,
      paymentMethod: req.body.paymentMethod || 'manual',
      transactionId: req.body.transactionId || null,
    });

    // Update user with subscription reference
    await User.findByIdAndUpdate(req.user._id, {
      activeSubscription: subscription._id,
      subscriptionStatus: 'active',
    });

    logger.info(`[SUBSCRIPTION] User ${req.user._id} subscribed to ${plan} plan | ends ${endDate.toISOString()}`);

    res.status(201).json({
      status: 'success',
      message: `Successfully subscribed to ${planConfig.name} plan.`,
      data: { subscription },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/subscriptions/cancel
 * Cancel current active subscription
 */
exports.cancelSubscription = async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({
      user: req.user._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
    });

    if (!sub) {
      return res.status(404).json({
        status: 'fail',
        message: 'No active subscription found.',
      });
    }

    sub.status = SUBSCRIPTION_STATUS.CANCELLED;
    await sub.save();

    await User.findByIdAndUpdate(req.user._id, {
      activeSubscription: null,
      subscriptionStatus: 'none',
    });

    logger.info(`[SUBSCRIPTION] User ${req.user._id} cancelled ${sub.plan} subscription`);

    res.status(200).json({
      status: 'success',
      message: 'Subscription cancelled successfully.',
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/subscriptions/admin/list
 * List all subscriptions with pagination (Admin only)
 */
exports.adminListSubscriptions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status: filterStatus } = req.query;

    const filter = {};
    if (filterStatus && filterStatus !== 'all') {
      filter.status = filterStatus;
    }

    const [subscriptions, total] = await Promise.all([
      Subscription.find(filter)
        .populate('user', 'name email role photo')
        .populate('activatedBy', 'name email')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      Subscription.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: subscriptions.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: { subscriptions },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/subscriptions/admin/:id/activate
 * Admin manually activates a subscription
 */
exports.adminActivateSubscription = async (req, res, next) => {
  try {
    const { plan } = req.body;
    const userId = req.params.id;

    if (!plan || !SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid plan. Available: ${Object.keys(SUBSCRIPTION_PLANS).join(', ')}`,
      });
    }

    // Cancel existing active subscription if any
    await Subscription.updateMany(
      { user: userId, status: SUBSCRIPTION_STATUS.ACTIVE },
      { status: SUBSCRIPTION_STATUS.CANCELLED }
    );

    const planConfig = SUBSCRIPTION_PLANS[plan];
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000);

    const subscription = await Subscription.create({
      user: userId,
      plan,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      maxListings: planConfig.maxListings,
      listingsUsedThisMonth: 0,
      price: planConfig.price,
      currency: planConfig.currency,
      startDate,
      endDate,
      activatedBy: req.user._id,
      paymentMethod: 'admin_manual',
    });

    await User.findByIdAndUpdate(userId, {
      activeSubscription: subscription._id,
      subscriptionStatus: 'active',
    });

    logger.info(`[SUBSCRIPTION] Admin ${req.user._id} activated ${plan} for user ${userId}`);

    await logAction(
      req.user._id, 'ACTIVATE_SUBSCRIPTION', 'Subscription', subscription._id,
      { after: { plan, userId, endDate } },
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    res.status(200).json({
      status: 'success',
      message: `${planConfig.name} plan activated successfully.`,
      data: { subscription },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/subscriptions/admin/revenue
 * Subscription revenue analytics (Admin only)
 */
exports.adminSubscriptionRevenue = async (req, res, next) => {
  try {
    const [stats] = await Subscription.aggregate([
      {
        $facet: {
          totals: [
            { $group: {
              _id: null,
              totalRevenue: { $sum: '$price' },
              totalSubscriptions: { $sum: 1 },
            }},
          ],
          byPlan: [
            { $group: {
              _id: '$plan',
              revenue: { $sum: '$price' },
              count: { $sum: 1 },
            }},
            { $sort: { revenue: -1 } },
          ],
          byStatus: [
            { $group: {
              _id: '$status',
              count: { $sum: 1 },
            }},
          ],
          monthly: [
            { $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
              },
              revenue: { $sum: '$price' },
              count: { $sum: 1 },
            }},
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 },
          ],
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalRevenue: stats.totals[0]?.totalRevenue || 0,
        totalSubscriptions: stats.totals[0]?.totalSubscriptions || 0,
        byPlan: stats.byPlan,
        byStatus: stats.byStatus,
        monthly: stats.monthly,
      },
    });
  } catch (err) {
    next(err);
  }
};
