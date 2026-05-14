const paymentService = require('../services/PaymentService');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────
// Payment Controller
// ─────────────────────────────────────────────────────────────────
// Handles payment endpoints, validates input, delegates to service
// ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/payments/checkout
 * Initiate payment after booking is approved
 * 
 * Body:
 * {
 *   bookingId: ObjectId,
 *   paymentMethod: 'paymob' | 'paypal' | 'bank_transfer' | 'cash'
 * }
 */
exports.initiatePayment = async (req, res, next) => {
  try {
    const { bookingId, paymentMethod } = req.body;

    // Validate input
    if (!bookingId) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('PAYMENT.BOOKING_ID_REQUIRED'),
      });
    }

    const validMethods = ['cash', 'bank_transfer', 'paypal', 'paymob'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('PAYMENT.INVALID_METHOD', { methods: validMethods.join(', ') }),
      });
    }

    // Call service
    const result = await paymentService.initiatePayment(
      bookingId,
      paymentMethod,
      req.user._id,
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({
      status: 'success',
      message: req.t('PAYMENT.INITIATED'),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments/:id
 * Get payment status
 */
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const result = await paymentService.getPaymentStatus(req.params.id, req.user._id);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments
 * List user payment history
 */
exports.listPayments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await paymentService.listPayments(req.user._id, page, limit);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/payments/:id/refund
 * Refund payment (admin only)
 */
exports.refundPayment = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const result = await paymentService.refundPayment(req.params.id, reason, req.user._id);

    res.status(200).json({
      status: 'success',
      message: req.t('PAYMENT.REFUNDED'),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/payments/verify
 * Verify payment via provider (polling)
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        status: 'fail',
        message: req.t('PAYMENT.PAYMENT_ID_REQUIRED'),
      });
    }

    const result = await paymentService.verifyPayment(paymentId);

    res.status(200).json({
      status: 'success',
      message: req.t('PAYMENT.VERIFIED'),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/payments/verify/:bookingId
 * BUG-07 FIX: Poll payment status by bookingId — used by payment-success.component.ts
 * The Angular frontend polls this endpoint after redirect from Paymob to confirm payment.
 * Without this endpoint, users were stuck on "Confirming Payment..." indefinitely (404 loop).
 */
exports.verifyByBooking = async (req, res, next) => {
  try {
    const Payment = require('../models/payment.model');

    const payment = await Payment.findOne({
      booking: req.params.bookingId,
      user:    req.user._id,
    }).sort({ createdAt: -1 }); // Get the most recent payment for this booking

    if (!payment) {
      return res.status(404).json({
        status:  'fail',
        message: req.t('PAYMENT.NOT_FOUND'),
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        paid:          payment.status === 'paid',
        paymentStatus: payment.status,
        verified:      payment.isVerified,
        transactionId: payment.transactionId || null,
        provider:      payment.provider || payment.paymentMethod,
        expiresAt:     payment.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/payments/promotion
 * Initiate payment for property promotion
 */
exports.initiatePromotion = async (req, res, next) => {
  try {
    const { propertyId, type, paymentMethod } = req.body;

    if (!propertyId || !type || !paymentMethod) {
      return res.status(400).json({
        status: 'fail',
        message: 'propertyId, type, and paymentMethod are required',
      });
    }

    const result = await paymentService.initiatePromotion(
      propertyId,
      type,
      paymentMethod,
      req.user._id
    );

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = exports;
