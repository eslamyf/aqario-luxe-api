const mongoose = require('mongoose');

const idempotencySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  requestPath: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
  },
  responseStatus: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '24h', // MongoDB TTL index to automatically delete garbage after 24h
  },
});

module.exports = mongoose.model('IdempotencyKey', idempotencySchema);
