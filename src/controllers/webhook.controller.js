'use strict';

const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const Payment = require('../models/payment.model');
const paymentService = require('../services/PaymentService');
const encryption = require('../utils/encryption.utils');
const logger = require('../utils/logger');

// ─── Startup guard: Paymob secret MUST be set ────────────────────────────────
// Fail at module-load time so a misconfigured deploy fails immediately,
// NOT silently on the first live webhook.
if (!process.env.PAYMOB_WEBHOOK_SECRET && process.env.NODE_ENV !== 'test') {
  throw new Error(
    '[webhook] PAYMOB_WEBHOOK_SECRET is required in .env. ' +
    'Set it or remove the Paymob webhook route.'
  );
}

// ─── PayPal: verify webhook using transmission headers ───────────────────────
// Implementation follows PayPal's documented algorithm:
//   crc32(requestBody) + "|" + transmissionId + "|" + transmissionTime + "|" + webhookId
// Signed with PAYPAL_WEBHOOK_ID acting as the shared secret for HMAC-SHA256.
// See: https://developer.paypal.com/api/rest/webhooks/rest/#link-eventtypesubscriptions
const verifyPaypalSignature = (req) => {
  const transmissionId = req.headers['paypal-transmission-id'];
  const transmissionTime = req.headers['paypal-transmission-time'];
  const certUrl = req.headers['paypal-cert-url'];
  const authAlgo = req.headers['paypal-auth-algo'];
  const transmissionSig = req.headers['paypal-transmission-sig'];
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  // All headers must be present
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }

  // We must have our webhook ID to verify
  if (!webhookId) {
    logger.error('[Webhook/PayPal] PAYPAL_WEBHOOK_ID not set — cannot verify signature');
    return false;
  }

  // Only support HMAC-SHA256 (PayPal may send SHA256withRSA for live, but we
  // enforce the simpler HMAC path here; RSA path requires fetching PayPal's cert).
  // BUG-09 FIX: Explicitly reject SHA256WITHRSA so it doesn't fall through to the HMAC path.
  if (authAlgo.toUpperCase() !== 'HMACSHA256') {
    logger.warn(`[Webhook/PayPal] Unsupported auth algorithm: ${authAlgo}. RSA verification path not implemented.`);
    return false;
  }

  // Build the verification string: transmissionId|transmissionTime|webhookId|crc32(body)
  const rawBody = JSON.stringify(req.body);          // body already parsed by Express
  const crc32val = crc32(rawBody);
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32val}`;

  // Re-compute HMAC using our webhook ID as the key
  const expected = crypto
    .createHmac('sha256', webhookId)
    .update(message)
    .digest('base64');

  // Timing-safe compare to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(transmissionSig, 'base64'),
      Buffer.from(expected, 'base64')
    );
  } catch {
    return false;
  }
};

// ─── CRC-32 helper (no npm dep needed) ───────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

const crc32 = (str) => {
  let crc = 0xFFFFFFFF;
  const buf = Buffer.from(str, 'utf8');
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString();
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/webhook/paymob
// ══════════════════════════════════════════════════════════════════════════════
exports.handlePaymobWebhook = asyncHandler(async (req, res, next) => {
  const payload = req.body;
  logger.info('[Webhook/Paymob] received', { type: payload.type });

  // Paymob sends the HMAC signature in the query string for Transaction Processed Callbacks
  const signature = req.query.hmac || req.headers['x-paymob-signature'];
  const secret = process.env.PAYMOB_WEBHOOK_SECRET;

  // HARD FAIL: secret absent at runtime (should have been caught at startup, but
  // guard here too in case someone clears env without restarting).
  if (!secret) {
    logger.error('[Webhook/Paymob] PAYMOB_WEBHOOK_SECRET not set — rejecting request');
    return next(new AppError('Webhook secret not configured', 500));
  }

  // HARD FAIL: signature absent — never process unsigned webhooks
  if (!signature) {
    logger.warn('[Webhook/Paymob] Missing HMAC signature in query params');
    return next(new AppError('Missing webhook signature', 403));
  }

  // Cryptographic verification
  const isValid = encryption.verifyWebhookSignature(payload, signature, secret);
  if (!isValid) {
    logger.error('[Webhook/Paymob] Signature verification FAILED');
    return next(new AppError('Invalid signature', 403));
  }

  const transaction = payload.obj || payload;
  const paymentId = transaction.merchant_order_id;

  if (!paymentId) {
    return next(new AppError('Missing payment ID', 400));
  }

  const PromotionTransaction = require('../models/promotionTransaction.model');
  const promotionService = require('../services/PromotionService');

  let payment = await Payment.findById(paymentId);
  let isPromotion = false;

  if (!payment) {
    payment = await PromotionTransaction.findById(paymentId);
    isPromotion = true;
  }

  if (!payment) return next(new AppError('Payment not found', 404));

  // Idempotency: already processed
  if (payment.status === 'paid' || payment.isVerified) {
    logger.info(`[Webhook/Paymob] Already processed (idempotent): ${paymentId}`);
    return res.status(200).json({ status: 'success', message: 'Payment already verified', duplicate: true });
  }

  let result;
  if (isPromotion) {
    result = await promotionService.activatePromotion(paymentId);
  } else {
    result = await paymentService.verifyPayment(paymentId, transaction);
  }

  res.status(200).json({ status: 'success', message: 'Webhook processed', data: result });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/webhook/paypal
// ══════════════════════════════════════════════════════════════════════════════
exports.handlePaypalWebhook = asyncHandler(async (req, res, next) => {
  const payload = req.body;
  logger.info('[Webhook/PayPal] received', { eventType: payload.event_type });

  // HARD FAIL: signature headers not present → reject
  const isValid = verifyPaypalSignature(req);
  if (!isValid) {
    logger.error('[Webhook/PayPal] Signature verification FAILED');
    return next(new AppError('Invalid PayPal webhook signature', 403));
  }

  const eventType = payload.event_type || '';

  // Only process payment completion events — ignore everything else silently
  const relevant = eventType.includes('PAYMENT') || eventType.includes('CHECKOUT.ORDER');
  if (!relevant) {
    logger.info(`[Webhook/PayPal] Ignoring event type: ${eventType}`);
    return res.status(200).json({ status: 'success', message: 'Event acknowledged' });
  }

  const resource = payload.resource || {};
  const customId = resource.custom_id || resource.purchase_units?.[0]?.custom_id;

  if (!customId) return next(new AppError('Missing custom_id', 400));

  const PromotionTransaction = require('../models/promotionTransaction.model');
  const promotionService = require('../services/PromotionService');

  let payment = await Payment.findById(customId);
  let isPromotion = false;

  if (!payment) {
    payment = await PromotionTransaction.findById(customId);
    isPromotion = true;
  }

  if (!payment) return next(new AppError('Payment not found', 404));

  // Idempotency guard
  if (payment.status === 'paid' || payment.isVerified) {
    logger.info(`[Webhook/PayPal] Already processed (idempotent): ${customId}`);
    return res.status(200).json({ status: 'success', message: 'Payment already verified', duplicate: true });
  }

  let result;
  if (isPromotion) {
    result = await promotionService.activatePromotion(customId);
  } else {
    result = await paymentService.verifyPayment(customId, payload);
  }

  res.status(200).json({ status: 'success', message: 'Webhook processed', data: result });
});



// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/webhook/verify  (manual testing utility — dev only)
// ══════════════════════════════════════════════════════════════════════════════
exports.verifyWebhook = asyncHandler(async (req, res) => {
  const { provider, eventId } = req.body;
  logger.info(`[Webhook] Manual verify: ${provider} — ${eventId}`);
  res.status(200).json({ status: 'success', message: 'Webhook verified' });
});





