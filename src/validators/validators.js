const Joi = require('joi');

// ─── Booking ──────────────────────────────────────────────────
exports.createBookingSchema = Joi.object({
  propertyId: Joi.string().hex().length(24).required(),
  amount:     Joi.number().min(0).required(),
  start_date: Joi.date().iso().required(),
  end_date:   Joi.date().iso().min(Joi.ref('start_date')).required(),
});

// ─── Payment ──────────────────────────────────────────────────
exports.createPaymentSchema = Joi.object({
  bookingId: Joi.string().hex().length(24).required(),
  amount:    Joi.number().min(0).optional(),
  // FIX — Standardize: remove 'online', add 'debit_card' and 'paypal'
  method:    Joi.string().valid('cash','credit_card','debit_card','bank_transfer','paypal').default('cash'),
});

exports.updatePaymentStatusSchema = Joi.object({
  // FIX — 'paid' instead of 'completed'
  status: Joi.string().valid('pending','paid','failed','refunded').required(),
});

// ─── Inquiry ──────────────────────────────────────────────────
exports.sendInquirySchema = Joi.object({
  propertyId: Joi.string().hex().length(24).required(),
  message:    Joi.string().min(5).max(1000).required(),
});

// ─── Review ───────────────────────────────────────────────────
exports.createReviewSchema = Joi.object({
  propertyId: Joi.string().hex().length(24).required(),
  rating:     Joi.number().integer().min(1).max(5).required(),
  comment:    Joi.string().max(500).optional(),
});
exports.updateReviewSchema = Joi.object({
  rating:  Joi.number().integer().min(1).max(5).optional(),
  comment: Joi.string().max(500).optional(),
}).min(1);

// ─── Favorite ─────────────────────────────────────────────────
exports.addFavoriteSchema = Joi.object({
  propertyId: Joi.string().hex().length(24).required(),
});

// ─── ViewingRequest ───────────────────────────────────────────
exports.createViewingRequestSchema = Joi.object({
  propertyId:    Joi.string().hex().length(24).required(),
  preferredDate: Joi.date().iso().min('now').required(),
  preferredTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required()
    .messages({ 'string.pattern.base': 'Time must be in HH:MM format' }),
  message: Joi.string().max(500).optional(),
});
exports.updateViewingStatusSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected', 'completed').required(),
});
