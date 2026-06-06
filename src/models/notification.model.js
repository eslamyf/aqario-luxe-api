const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['booking', 'payment', 'inquiry', 'viewing', 'review', 'system'],
      required: true,
    },
    title:   { type: String, required: true },
    message: { type: String, required: true },
    isRead:  { type: Boolean, default: false },
    // Link to the associated entity (property, booking, etc.)
    link:    { type: String, default: null },
    // Additional payload metadata
    meta:    { type: mongoose.Schema.Types.Mixed, default: {} },
    targetUrl: { type: String, default: null },
    metadata: {
      type: { type: String, default: null },
      referenceId: { type: String, default: null }
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
