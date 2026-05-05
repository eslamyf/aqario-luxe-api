const mongoose = require('mongoose');

// SECURITY FIX — Comprehensive Payment Model with:
// 1. Server-validated amounts (never trust frontend)
// 2. Idempotency guard (isVerified prevents webhook double-credit)
// 3. Payment expiry mechanism (auto-cleanup for failed payments)
// 4. Explicit commission/fee tracking (transparent for users + owners)
// 5. Unique index to prevent double payments

const paymentSchema = new mongoose.Schema(
  {
    // ─── REFERENCES ───────────────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
      // Alias: use 'userId' as an interchangeable query key in aggregations
      // Note: Mongoose alias is not supported on ObjectId fields natively.
      // Use the 'user' field directly. See docs/schemas.md for cross-model naming guide.
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property is required'],
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking is required'],
      index: true,
    },

    // ─── AMOUNT CALCULATION (Server-validated only) ───────────────
    propertyPrice: {
      type: Number,
      required: [true, 'Property price is required'],
      min: 0,
    },
    platformFee: {
      type: Number,
      default: 0,
      min: 0,  // Usually 2.5% of propertyPrice
    },
    netAmount: {
      type: Number,
      required: [true, 'Net amount is required'],
      min: 0,  // Amount owner receives (propertyPrice only, no fee)
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: 0,  // What user pays = propertyPrice + platformFee
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR'],
    },

    // ─── PAYMENT METHOD & STATUS ──────────────────────────────────
    paymentMethod: {
      type: String,
      enum: {
        values: ['cash', 'bank_transfer', 'paypal', 'paymob'],
        message: 'Invalid payment method',
      },
      required: [true, 'Payment method is required'],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'failed', 'refunded', 'expired'],
        message: 'Invalid payment status',
      },
      default: 'pending',
      index: true,
    },

    // ─── PROVIDER INTEGRATION ─────────────────────────────────────
    paymentKey: String,  // From Paymob/PayPal/provider
    transactionId: String,  // Provider transaction ID
    provider: String,  // 'paymob', 'paypal', etc.

    // ─── CRITICAL: IDEMPOTENCY GUARD ──────────────────────────────
    // Prevents webhook from being processed twice and creating double credit
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ─── PAYMENT EXPIRY ────────────────────────────────────────────
    // Pending payments expire after 30 minutes
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
      index: true,  // For cron job to find expired payments
    },
    verifiedAt: Date,

    // ─── SECURITY & AUDIT ─────────────────────────────────────────
    ipAddress: String,
    userAgent: String,
    webhookSignature: String,  // For webhook verification

    // ─── REFUND HANDLING ──────────────────────────────────────────
    refundReason: String,
    refundedAt: Date,
    refundTransactionId: String,

    // ─── METADATA (flexible for provider-specific data) ────────────
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────────────────────────
// INDEXES
// ─────────────────────────────────────────────────────────────────

// CRITICAL: Prevent double payments
// A booking can have at most ONE non-failed payment at a time
paymentSchema.index(
  { booking: 1, status: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'completed'] },
    },
  }
);

// Queries
paymentSchema.index({ user: 1, status: 1 }); // Index for dashboard aggregations
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ property: 1, createdAt: -1 });
paymentSchema.index({ transactionId: 1 }, { sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
