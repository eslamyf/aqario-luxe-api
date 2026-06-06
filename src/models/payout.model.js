const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be at least 1 EGP'],
    },
    method: {
      type: String,
      enum: ['paymob_wallet', 'paypal'],
      required: [true, 'Payout method is required'],
    },
    accountDetails: {
      type: String,
      required: [true, 'Account details are required'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Payout', payoutSchema);
