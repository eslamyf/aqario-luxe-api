const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    plan: {
      type: String,
      enum: ['basic', 'pro', 'enterprise'],
      required: [true, 'Plan is required'],
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
      index: true,
    },

    // ── Limits ──────────────────────────────────────────────────
    maxListings: {
      type: Number,
      required: true, // 3 | 10 | -1 (unlimited)
    },
    listingsUsedThisMonth: {
      type: Number,
      default: 0,
    },

    // ── Pricing ─────────────────────────────────────────────────
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR'],
    },

    // ── Lifecycle ───────────────────────────────────────────────
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },

    // ── Payment Reference ───────────────────────────────────────
    paymentMethod: String,
    transactionId: String,

    // ── Admin Activation ────────────────────────────────────────
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ── Billing Cycle Reset Tracker ─────────────────────────────
    lastResetAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 }); // cron expiry scan
subscriptionSchema.index({ status: 1, createdAt: -1 }); // admin list

module.exports = mongoose.model('Subscription', subscriptionSchema);
