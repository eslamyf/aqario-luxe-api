/**
 * PayPal Webhook Tests
 * ═════════════════════
 * Covers:
 *  1. Valid signature → 200 processed
 *  2. Invalid signature → 403
 *  3. Replay attack (idempotency) → 200 duplicate:true
 *
 * Strategy:
 *  - We mock PaymentService.verifyPayment to avoid full payment flow.
 *  - We create a real Payment document so the DB lookup succeeds.
 *  - Signatures are computed using the crc32 + HMAC-SHA256 algorithm.
 */

const crypto   = require('crypto');
const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/server');
const Payment  = require('../src/models/payment.model');

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAYPAL_WEBHOOK_ID = 'TEST_WEBHOOK_ID_123';

const crc32 = (str) => {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  let crc = 0xFFFFFFFF;
  const buf = Buffer.from(str, 'utf8');
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString();
};

const signPaypal = (body, transmissionId, transmissionTime, webhookId) => {
  const crc32val = crc32(JSON.stringify(body));
  const message  = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32val}`;
  return crypto.createHmac('sha256', webhookId).update(message).digest('base64');
};

// ── Shared state ───────────────────────────────────────────────────────────────
let paymentId;
let verifiedPaymentId;

// ── Seed ───────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  process.env.PAYPAL_WEBHOOK_ID = PAYPAL_WEBHOOK_ID;

  // We need owner + property to satisfy Payment model refs.
  const User     = require('../src/models/user.model');
  const Property = require('../src/models/property.model');
  const Booking  = require('../src/models/booking.model');

  const owner = await User.create({
    name: 'PP Owner', email: 'pp.owner@test.com',
    password: 'Test@1234', role: 'owner', isVerified: true,
  });
  const prop = await Property.create({
    title: 'PP Test Prop', description: 'PayPal test property',
    price: 500_000, type: 'apartment', listingType: 'sale',
    location: { city: 'Cairo', district: 'Maadi' },
    owner: owner._id, isApproved: true,
  });
  const buyer = await User.create({
    name: 'PP Buyer', email: 'pp.buyer@test.com',
    password: 'Test@1234', role: 'buyer', isVerified: true,
  });
  const booking = await Booking.create({
    user_id: buyer._id, property_id: prop._id,
    amount: 500_000, status: 'approved',
    start_date: new Date(Date.now() + 30 * 86_400_000),
    end_date:   new Date(Date.now() + 37 * 86_400_000),
  });

  const p1 = await Payment.create({
    user:          buyer._id,
    property:      prop._id,
    booking:       booking._id,
    propertyPrice: 500_000,
    platformFee:   12_500,
    netAmount:     500_000,
    totalAmount:   512_500,
    currency:      'USD',
    paymentMethod: 'paypal',
    status:        'pending',
    isVerified:    false,
    expiresAt:     new Date(Date.now() + 30 * 60_000),
  });
  paymentId = p1._id.toString();

  const p2 = await Payment.create({
    user:          buyer._id,
    property:      prop._id,
    booking:       booking._id,
    propertyPrice: 500_000,
    platformFee:   12_500,
    netAmount:     500_000,
    totalAmount:   512_500,
    currency:      'USD',
    paymentMethod: 'paypal',
    status:        'paid',
    isVerified:    true,
    expiresAt:     new Date(Date.now() + 30 * 60_000),
  });
  verifiedPaymentId = p2._id.toString();
});

afterAll(async () => {
  // Handled by setup.js MongoMemoryServer
});

// ══════════════════════════════════════════════════════════════════════════════
// PayPal Webhook Suite
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paypal', () => {
  it('should accept valid signature and process payment', async () => {
    const paymentService = require('../src/services/PaymentService');
    jest.spyOn(paymentService, 'verifyPayment').mockResolvedValueOnce({ status: 'paid' });

    const payload = { event_type: 'PAYMENT.SALE.COMPLETED', resource: { custom_id: paymentId } };
    const tId     = 'TEST_TRANS_ID';
    const tTime   = new Date().toISOString();
    const sig     = signPaypal(payload, tId, tTime, PAYPAL_WEBHOOK_ID);

    const res = await request(app)
      .post('/api/v1/payments/webhook/paypal')
      .set('paypal-transmission-id', tId)
      .set('paypal-transmission-time', tTime)
      .set('paypal-cert-url', 'https://cert')
      .set('paypal-auth-algo', 'HMACSHA256')
      .set('paypal-transmission-sig', sig)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    jest.restoreAllMocks();
  });

  it('should reject invalid signature', async () => {
    const payload = { event_type: 'PAYMENT.SALE.COMPLETED', resource: { custom_id: paymentId } };
    
    const res = await request(app)
      .post('/api/v1/payments/webhook/paypal')
      .set('paypal-transmission-id', 'T_123')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://cert')
      .set('paypal-auth-algo', 'HMACSHA256')
      .set('paypal-transmission-sig', 'invalidsignaturebase64=')
      .send(payload);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid.*signature/i);
  });

  it('should protect against replay attack (idempotency guard)', async () => {
    const payload = { event_type: 'PAYMENT.SALE.COMPLETED', resource: { custom_id: verifiedPaymentId } };
    const tId     = 'TEST_TRANS_ID_2';
    const tTime   = new Date().toISOString();
    const sig     = signPaypal(payload, tId, tTime, PAYPAL_WEBHOOK_ID);

    const res = await request(app)
      .post('/api/v1/payments/webhook/paypal')
      .set('paypal-transmission-id', tId)
      .set('paypal-transmission-time', tTime)
      .set('paypal-cert-url', 'https://cert')
      .set('paypal-auth-algo', 'HMACSHA256')
      .set('paypal-transmission-sig', sig)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.message).toMatch(/already verified/i);
  });
});
