const mongoose = require('mongoose');

const promotionTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['featured', 'boost', 'badge'],
      required: [true, 'Promotion type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      enum: ['USD', 'EGP'],
      default: 'USD',
    },
    provider: {
      type: String,
      required: [true, 'Payment provider is required'],
      enum: ['paymob', 'paypal'],
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    transactionId: {
      type: String,
      index: true,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    paidAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
promotionTransactionSchema.index({ property: 1, type: 1, status: 1 });
promotionTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PromotionTransaction', promotionTransactionSchema);
