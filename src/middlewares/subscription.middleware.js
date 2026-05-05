// ──────────────────────────────────────────────────────────
// Subscription Guard Middleware
// ──────────────────────────────────────────────────────────

const Subscription = require('../models/subscription.model');

/**
 * Enforce active subscription + listing limit for property creation.
 * Admins bypass this check entirely.
 *
 * Usage:
 * router.post('/properties', protect, requireKYC, restrictTo('owner','agent','admin'),
 *   requireActiveSubscription, controller);
 *
 * On success, attaches `req.subscription` for controller to increment usage.
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    // Admins can create properties without subscription
    if (req.user.role === 'admin') return next();

    const sub = await Subscription.findOne({
      user: req.user._id,
      status: 'active',
    });

    if (!sub) {
      return res.status(403).json({
        status: 'fail',
        code: 'NO_SUBSCRIPTION',
        message: req.t ? req.t('SUBSCRIPTION.REQUIRED') : 'Active subscription required to create properties.',
        data: { subscriptionStatus: 'none' },
      });
    }

    // Check monthly listing limit (-1 = unlimited)
    if (sub.maxListings !== -1 && sub.listingsUsedThisMonth >= sub.maxListings) {
      return res.status(403).json({
        status: 'fail',
        code: 'LISTING_LIMIT_REACHED',
        message: req.t
          ? req.t('SUBSCRIPTION.LIMIT_REACHED', { used: sub.listingsUsedThisMonth, limit: sub.maxListings })
          : `Monthly listing limit reached (${sub.listingsUsedThisMonth}/${sub.maxListings}). Upgrade your plan.`,
        data: {
          plan: sub.plan,
          used: sub.listingsUsedThisMonth,
          limit: sub.maxListings,
          endDate: sub.endDate,
        },
      });
    }

    // Attach subscription for downstream controller to increment usage
    req.subscription = sub;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireActiveSubscription };
