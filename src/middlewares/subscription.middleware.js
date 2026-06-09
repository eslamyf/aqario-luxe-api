// ──────────────────────────────────────────────────────────
// Subscription Guard Middleware  — Freemium Model
// ──────────────────────────────────────────────────────────

const Subscription = require('../models/subscription.model');
const Property     = require('../models/property.model');

/**
 * Freemium gate for property creation.
 *
 * Rules (in evaluation order):
 *   1. Admins       → always pass through.
 *   2. Free tier    → allowed up to FREE_LISTING_LIMIT (3) total listings ever
 *                     created by this user, regardless of subscription status.
 *   3. Subscribed   → allowed up to the plan's monthly quota (-1 = unlimited).
 *   4. No sub + ≥ 3 → 403 FREE_LIMIT_REACHED  (upgrade prompt).
 *   5. Sub + quota  → 403 LISTING_LIMIT_REACHED (upgrade prompt).
 *
 * On success, attaches `req.subscription` (may be null for free-tier path).
 * The downstream property controller can inspect it to decide whether to
 * increment `listingsUsedThisMonth`.
 *
 * Usage:
 *   router.post('/properties', protect, requireKYC,
 *     restrictTo('owner','agent','admin'),
 *     requireActiveSubscription, controller);
 */

/** Number of free listings every user gets before needing a subscription. */
const FREE_LISTING_LIMIT = 3;

const requireActiveSubscription = async (req, res, next) => {
  try {
    // ── 1. Admin bypass ───────────────────────────────────────────────────────
    if (req.user.role === 'admin') return next();

    // ── 2. Count total properties this user has ever created ──────────────────
    // Property schema stores the creator in the `owner` field (ObjectId → User).
    const propertyCount = await Property.countDocuments({ owner: req.user._id });

    // ── 3. Freemium allowance: under the free limit → always pass ────────────
    if (propertyCount < FREE_LISTING_LIMIT) {
      req.subscription = null; // signal: free-tier path, no sub object
      return next();
    }

    // ── 4. Free limit exhausted → check for an active subscription ───────────
    // Read subscriptionStatus directly from req.user (already hydrated by the
    // `protect` middleware) — no extra DB round-trip needed for this check.
    const hasActiveSub = req.user.subscriptionStatus === 'active';

    if (!hasActiveSub) {
      // User has hit the free cap and holds no active plan.
      const message = req.t
        ? req.t('SUBSCRIPTION.FREE_LIMIT_REACHED', { limit: FREE_LISTING_LIMIT })
        : `You have used all ${FREE_LISTING_LIMIT} free listings. Upgrade to continue publishing.`;

      const hint = req.t
        ? req.t('SUBSCRIPTION.UPGRADE_HINT')
        : 'Choose a subscription plan to unlock more listings.';

      return res.status(403).json({
        status: 'fail',
        code: 'FREE_LIMIT_REACHED',
        message,
        data: {
          freeLimit:   FREE_LISTING_LIMIT,
          used:        propertyCount,
          subscriptionStatus: req.user.subscriptionStatus,
          hint,
          upgradeUrl: '/subscriptions',
        },
      });
    }

    // ── 5. Fetch subscription doc to enforce plan quota ───────────────────────
    const sub = await Subscription.findOne({
      user:   req.user._id,
      status: 'active',
    });

    if (!sub) {
      // Rare edge case: user.subscriptionStatus is stale (de-sync).
      // Treat it the same as FREE_LIMIT_REACHED so UX stays consistent.
      const message = req.t
        ? req.t('SUBSCRIPTION.REQUIRED')
        : 'An active subscription is required to create additional property listings.';

      const hint = req.t
        ? req.t('SUBSCRIPTION.UPGRADE_HINT')
        : 'Upgrade to a paid plan to continue listing your properties.';

      return res.status(403).json({
        status: 'fail',
        code: 'NO_SUBSCRIPTION',
        message,
        data: {
          subscriptionStatus: req.user.subscriptionStatus,
          hint,
          upgradeUrl: '/subscriptions',
        },
      });
    }

    // ── 6. Enforce plan's monthly listing quota (-1 = unlimited) ─────────────
    if (sub.maxListings !== -1 && sub.listingsUsedThisMonth >= sub.maxListings) {
      const message = req.t
        ? req.t('SUBSCRIPTION.LIMIT_REACHED', {
            used:  sub.listingsUsedThisMonth,
            limit: sub.maxListings,
          })
        : `Monthly listing limit reached (${sub.listingsUsedThisMonth}/${sub.maxListings}). Upgrade your plan.`;

      const hint = req.t
        ? req.t('SUBSCRIPTION.UPGRADE_HINT')
        : 'Upgrade to a higher plan to increase your monthly listing quota.';

      return res.status(403).json({
        status: 'fail',
        code: 'LISTING_LIMIT_REACHED',
        message,
        data: {
          plan:    sub.plan,
          used:    sub.listingsUsedThisMonth,
          limit:   sub.maxListings,
          endDate: sub.endDate,
          hint,
          upgradeUrl: '/subscriptions',
        },
      });
    }

    // ── 7. All checks passed → attach subscription for downstream usage ───────
    req.subscription = sub;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireActiveSubscription };

