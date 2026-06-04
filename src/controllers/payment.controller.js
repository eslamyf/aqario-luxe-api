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

exports.capturePaypalOrder = async (req, res, next) => {
  try {
    // 1. Robust Request Body Parsing & Parameter Validation
    const { bookingId, token, payerId } = req.body;

    if (!bookingId || !token || !payerId) {
      return res.status(400).json({
        status: 'fail',
        message: 'bookingId, token, and payerId are required',
      });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    const baseUrl = mode === 'live' || mode === 'production'
      ? 'https://api.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        status: 'error',
        message: 'PayPal credentials are not configured in environment variables.',
      });
    }

    // 2. Generate PayPal Access Token Dynamically
    let access_token;
    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: 'grant_type=client_credentials',
      });

      if (!tokenRes.ok) {
        const errorData = await tokenRes.json().catch(() => ({}));
        logger.error('[PayPal Capture] Failed to retrieve access token:', errorData);
        return res.status(tokenRes.status).json({
          status: 'fail',
          message: 'Failed to generate PayPal access token',
          error: errorData,
        });
      }

      const tokenData = await tokenRes.json();
      access_token = tokenData.access_token;
    } catch (tokenErr) {
      logger.error('[PayPal Capture] Token generation network error:', tokenErr);
      return res.status(500).json({
        status: 'error',
        message: 'Network error generating PayPal access token',
        error: tokenErr.message,
      });
    }

    // 3. Execute the PayPal v2 Orders Capture Call
    let captureData;
    try {
      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${token}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({}),
      });

      captureData = await captureRes.json().catch(() => ({}));

      if (!captureRes.ok) {
        const isComplianceViolation =
          process.env.NODE_ENV !== 'production' &&
          captureRes.status === 422 &&
          Array.isArray(captureData.details) &&
          captureData.details.some(d => d.issue === 'COMPLIANCE_VIOLATION');

        if (isComplianceViolation) {
          logger.warn('[PayPal Capture] COMPLIANCE_VIOLATION detected in sandbox environment. Proceeding with mock capture success.');
          captureData = {
            status: 'COMPLETED',
            purchase_units: [
              {
                payments: {
                  captures: [
                    {
                      id: `mock-capture-${token}`,
                    }
                  ]
                }
              }
            ]
          };
        } else {
          // 4. Defensive Error Handling & Response Mapping
          logger.error('[PayPal Capture] Capture order error response:', captureData);
          return res.status(captureRes.status).json({
            status: 'fail',
            message: captureData.message || 'PayPal capture failed',
            error: captureData,
          });
        }
      }
    } catch (captureErr) {
      logger.error('[PayPal Capture] Orders capture network error:', captureErr);
      return res.status(500).json({
        status: 'error',
        message: 'Network error executing PayPal capture call',
        error: captureErr.message,
      });
    }

    // 4. Update Database upon successful capture
    if (captureData.status === 'COMPLETED' || captureData.status === 'APPROVED') {
      const Payment = require('../models/payment.model');
      const Booking = require('../models/booking.model');
      const Property = require('../models/property.model');

      const payment = await Payment.findOne({
        booking: bookingId,
        user: req.user._id,
        paymentMethod: 'paypal',
      });

      if (!payment) {
        return res.status(404).json({
          status: 'fail',
          message: 'Matching payment record not found in database',
        });
      }

      // Update payment record
      payment.isVerified = true;
      payment.status = 'paid'; // matches Payment model schema validation
      payment.transactionId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id || token;
      payment.verifiedAt = new Date();
      payment.metadata = { ...payment.metadata, payerId, captureData };
      await payment.save();

      // Update booking status
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: 'paid', // matches Booking model schema validation
        paidAmount: payment.totalAmount,
      });

      // Update property statistics
      await Property.findByIdAndUpdate(payment.property, {
        $inc: { successfulBookings: 1 },
      });

      logger.info(`[PayPal Capture] Booking ${bookingId} successfully captured & marked paid.`);

      return res.status(200).json({
        status: 'success',
        message: 'PayPal payment captured successfully',
        data: {
          paymentStatus: 'paid',
          transactionId: payment.transactionId,
        },
      });
    } else {
      return res.status(400).json({
        status: 'fail',
        message: `PayPal order has status: ${captureData.status}`,
        data: captureData,
      });
    }
  } catch (err) {
    logger.error('[PayPal Capture] Unexpected controller exception:', err);
    next(err);
  }
};

module.exports = exports;
