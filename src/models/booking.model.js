const mongoose = require('mongoose');

// FIX — Replace the 3 booleans (pending, applied, rejected) with a single clear enum
// Old: pending:true/false + applied:true/false + rejected:true/false
// New: status: 'pending' | 'approved' | 'rejected' | 'cancelled'

const bookingSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      alias: 'userId',
    },
    property_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      alias: 'propertyId',
    },
    amount: {
      type: Number,
      required: true,
    },
    start_date: {
      type: Date,
      required: true,
      alias: 'startDate',
    },
    end_date: {
      type: Date,
      required: true,
      alias: 'endDate',
    },
    // FIX — One enum instead of 3 confusing booleans
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
    },

    // AUDIT TRAIL & HISTORY
    statusHistory: [
      {
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        reason: String
      }
    ],
    lastActionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastActionAt: Date,
    isPriority: { type: Boolean, default: false },

    // PAYMENT TRACKING
    paymentStatus: {
      type: String,
      enum: ['not_initiated', 'pending', 'paid', 'refunded'],
      default: 'not_initiated',
      index: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

bookingSchema.index({ property_id: 1, start_date: 1, end_date: 1 });
bookingSchema.index({ user_id: 1 });
bookingSchema.index({ user_id: 1, status: 1 }); // Index for dashboard aggregations
bookingSchema.index({ user_id: 1, created_at: -1 });
bookingSchema.index({ property_id: 1, status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
