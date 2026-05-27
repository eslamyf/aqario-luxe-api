const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireKYC } = require('../middlewares/kyc.middleware');
const restrictTo = require('../middlewares/restrictTo.middleware');
const { idempotencyMiddleware } = require('../middlewares/idempotency.middleware');

// ─────────────────────────────────────────────────────────────────
// USER ENDPOINTS (protected + KYC required)
// ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /payments/checkout:
 *   post:
 *     tags: [💳 Payments]
 *     summary: Initiate payment after booking is approved
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId, paymentMethod]
 *             properties:
 *               bookingId: { type: string, description: "Booking ID (must be approved)" }
 *               paymentMethod: { type: string, enum: [cash, bank_transfer, paypal, paymob] }
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *       400:
 *         description: Invalid booking or already paid
 *       403:
 *         description: KYC not approved
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/checkout',
  protect,
  requireKYC,
  idempotencyMiddleware,
  paymentController.initiatePayment
);

router.post(
  '/promotion-checkout',
  protect,
  requireKYC,
  paymentController.initiatePromotion
);

// Helper for local development: Redirect Paymob response to local frontend
// Must be BEFORE /:id route to avoid being caught by it!
router.get('/success', (req, res) => {
  const queryString = new URLSearchParams(req.query).toString();
  const targetUrl = `${process.env.CLIENT_URL || 'http://localhost:4200'}/payment/success?${queryString}`;
  res.redirect(targetUrl);
});

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     tags: [💳 Payments]
 *     summary: Get payment status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment details
 *       404:
 *         description: Payment not found
 */
// BUG-07 FIX: GET /verify/:bookingId — MUST be registered BEFORE /:id wildcard
// Angular's payment-success.component.ts polls this endpoint to confirm payment status.
// Previously missing — caused permanent "Confirming Payment..." spinner (404 loop).
router.get('/verify/:bookingId', protect, paymentController.verifyByBooking);

// BUG-06 FIX: Moved WEBHOOK ENDPOINTS above /:id wildcard to prevent routing conflicts

// ─────────────────────────────────────────────────────────────────
// WEBHOOK ENDPOINTS (no auth required, signature-verified)
// ─────────────────────────────────────────────────────────────────
router.post('/webhook/paymob', webhookController.handlePaymobWebhook);
router.get('/webhook/paymob', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Paymob Webhook endpoint is active and listening for POST requests!'
  });
});
router.post('/webhook/paypal', webhookController.handlePaypalWebhook);

// ─────────────────────────────────────────────────────────────────
// DYNAMIC ROUTES (must be after specific routes)
// ─────────────────────────────────────────────────────────────────
router.get('/:id', protect, paymentController.getPaymentStatus);

/**
 * @swagger
 * /payments:
 *   get:
 *     tags: [💳 Payments]
 *     summary: Get payment history
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: List of user payments
 */
router.get('/', protect, paymentController.listPayments);

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     tags: [💳 Payments]
 *     summary: Manual payment verification (polling)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentId]
 *             properties:
 *               paymentId: { type: string }
 *     responses:
 *       200:
 *         description: Payment verified
 */
router.post('/verify', protect, paymentController.verifyPayment);

// ─────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS (protected + admin only)
// ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /payments/{id}/refund:
 *   post:
 *     tags: [💳 Payments - Admin]
 *     summary: Refund a completed payment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Payment refunded
 *       403:
 *         description: Admin access required
 */
router.post(
  '/:id/refund',
  protect,
  restrictTo('admin'),
  paymentController.refundPayment
);

module.exports = router;
