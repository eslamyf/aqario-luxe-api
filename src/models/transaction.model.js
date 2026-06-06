const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner is required'],
      index: true,
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
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: [true, 'Payment is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Total buyer amount is required'],
      min: 0,
    },
    commission: {
      type: Number,
      required: [true, 'Commission is required'],
      min: 0,
    },
    netAmount: {
      type: Number,
      required: [true, 'Net amount is required'],
      min: 0,
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR'],
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'refunded'],
      default: 'completed',
      index: true,
    },
    type: {
      type: String,
      enum: ['booking_income', 'payout'],
      default: 'booking_income',
    }
  },
  { timestamps: true }
);

// Indexes for ledger and dashboard listing performance
transactionSchema.index({ owner: 1, createdAt: -1 });
transactionSchema.index({ payment: 1 }, { unique: true });

module.exports = mongoose.model('Transaction', transactionSchema);
