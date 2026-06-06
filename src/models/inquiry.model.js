const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
      alias: 'senderId',
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver is required'],
      alias: 'ownerId',
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property is required'],
      alias: 'propertyId',
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
      alias: 'message',
    },
    isRead: { type: Boolean, default: false },
    // FIX — Add replies system for inquiry responses
    replies: [
      {
        from:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message:   { type: String, required: true, maxlength: 1000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

inquirySchema.index({ sender: 1 });
inquirySchema.index({ receiver: 1 });
inquirySchema.index({ property: 1, createdAt: -1 });

module.exports = mongoose.model('Inquiry', inquirySchema);
