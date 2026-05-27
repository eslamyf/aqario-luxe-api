/**
 * Webhook Tests — Paymob HMAC Signature Validation
 * ══════════════════════════════════════════════════
 * Covers:
 *  1. Valid HMAC signature → 200 processed
 *  2. Tampered payload (signature mismatch) → 403
 *  3. Missing merchant_order_id → 400
 *  4. Idempotency: already-verified payment → 200 duplicate:true
 *  5. No signature header (optional) → processes without signature
 *  6. Missing payment in DB → 404
 *
 * Strategy:
 *  - We mock PaymentService.verifyPayment to avoid full payment flow.
 *  - We create a real Payment document so the DB lookup succeeds.
 *  - Signatures are computed with the same secret as the server uses.
 */

const crypto   = require('crypto');
const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/server');
const Payment  = require('../src/models/payment.model');

// ── Helpers ────────────────────────────────────────────────────────────────────
const WEBHOOK_SECRET = 'test_paymob_webhook_secret_32chars!!';

/**
 * Compute a valid HMAC-SHA256 signature for a payload,
 * using the same algorithm as encryption.utils.verifyWebhookSignature.
 */
const signPayload = (payload, secret = WEBHOOK_SECRET) => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
};

// ── Shared state ───────────────────────────────────────────────────────────────
let paymentId;      // valid, unverified payment
let verifiedPayId;  // already-verified payment (idempotency test)

// ── Seed ───────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  process.env.PAYMOB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.ENCRYPTION_KEY        = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // We need an owner + property to satisfy Payment model refs.
  // Create minimal documents directly in DB.
  const User     = require('../src/models/user.model');
  const Property = require('../src/models/property.model');
  const Booking  = require('../src/models/booking.model');

  const owner = await User.create({
    name: 'WH Owner', email: 'wh.owner@test.com',
    password: 'Test@1234', role: 'owner', isVerified: true,
  });
  const prop = await Property.create({
    title: 'Webhook Test Prop', description: 'Webhook test property description',
    price: 500_000, type: 'apartment', listingType: 'sale',
    location: { city: 'Cairo', district: 'Maadi' },
    owner: owner._id, isApproved: true,
  });
  const buyer = await User.create({
    name: 'WH Buyer', email: 'wh.buyer@test.com',
    password: 'Test@1234', role: 'buyer', isVerified: true,
  });
  const booking = await Booking.create({
    user_id: buyer._id, property_id: prop._id,
    amount: 500_000, status: 'approved',
    start_date: new Date(Date.now() + 30 * 86_400_000),
    end_date:   new Date(Date.now() + 37 * 86_400_000),
  });

  // Unverified payment — used for happy-path test
  const p1 = await Payment.create({
    user:          buyer._id,
    property:      prop._id,
    booking:       booking._id,
    propertyPrice: 500_000,
    platformFee:   12_500,
    netAmount:     500_000,
    totalAmount:   512_500,
    currency:      'EGP',
    paymentMethod: 'paymob',
    status:        'pending',
    isVerified:    false,
    expiresAt:     new Date(Date.now() + 30 * 60_000),
  });
  paymentId = p1._id.toString();

  // Already-verified payment — for idempotency test
  const p2 = await Payment.create({
    user:          buyer._id,
    property:      prop._id,
    booking:       booking._id,
    propertyPrice: 500_000,
    platformFee:   12_500,
    netAmount:     500_000,
    totalAmount:   512_500,
    currency:      'EGP',
    paymentMethod: 'paymob',
    status:        'paid',
    isVerified:    true,
    expiresAt:     new Date(Date.now() + 30 * 60_000),
  });
  verifiedPayId = p2._id.toString();
});

afterAll(async () => {
  // Cleanup handled by setup.js MongoMemoryServer
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Valid HMAC — payment found and unverified
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paymob — Valid Signature', () => {
  it('should return 200 when HMAC is valid and payment exists', async () => {
    // Mock PaymentService so we don't need full provider setup
    const paymentService = require('../src/services/PaymentService');
    jest.spyOn(paymentService, 'verifyPayment').mockResolvedValueOnce({
      payment: { _id: paymentId, status: 'paid' },
    });

    const payload = {
      type: 'TRANSACTION',
      obj: {
        id:                  12345,
        success:             true,
        merchant_order_id:   paymentId,
        amount_cents:        51250000,
        currency:            'EGP',
      },
    };
    const signature = signPayload(payload);

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .set('x-paymob-signature', signature)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    jest.restoreAllMocks();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Tampered Payload — signature mismatch → 403
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paymob — Tampered Payload', () => {
  it('should return 403 when HMAC does not match', async () => {
    const originalPayload = {
      type: 'TRANSACTION',
      obj: {
        id:                12345,
        success:           true,
        merchant_order_id: paymentId,
        amount_cents:      51250000,
      },
    };
    // Sign original, then mutate payload (simulate attack)
    const signature = signPayload(originalPayload);

    const tamperedPayload = {
      ...originalPayload,
      obj: { ...originalPayload.obj, amount_cents: 1 }, // attacker changes amount
    };

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .set('x-paymob-signature', signature)
      .send(tamperedPayload);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/invalid signature/i);
  });

  it('should return 403 when signature is computed with a wrong secret', async () => {
    const payload = {
      type: 'TRANSACTION',
      obj: { id: 1, success: true, merchant_order_id: paymentId, amount_cents: 100 },
    };
    const wrongSignature = signPayload(payload, 'wrong_secret_entirely');

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .set('x-paymob-signature', wrongSignature)
      .send(payload);

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Missing merchant_order_id → 400
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paymob — Missing Payment ID', () => {
  it('should return 400 when merchant_order_id is absent', async () => {
    const payload = {
      type: 'TRANSACTION',
      obj: { id: 99, success: true, amount_cents: 100 }, // no merchant_order_id
    };
    const signature = signPayload(payload);

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .set('x-paymob-signature', signature)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing payment id/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Idempotency — already-verified payment → 200 with duplicate:true
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paymob — Idempotency Guard', () => {
  it('should return 200 with duplicate:true for an already-verified payment', async () => {
    const payload = {
      type: 'TRANSACTION',
      obj: {
        id:                99999,
        success:           true,
        merchant_order_id: verifiedPayId,
        amount_cents:      51250000,
      },
    };
    const signature = signPayload(payload);

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .set('x-paymob-signature', signature)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.message).toMatch(/already verified/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Payment not in DB → 404
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paymob — Payment Not Found', () => {
  it('should return 404 when merchant_order_id is a valid ObjectId but not in DB', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const payload = {
      type: 'TRANSACTION',
      obj: { id: 1, success: true, merchant_order_id: fakeId, amount_cents: 100 },
    };
    const signature = signPayload(payload);

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .set('x-paymob-signature', signature)
      .send(payload);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/payment not found/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. No signature header — webhook secret not configured
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/webhook/paymob — No Signature Header', () => {
  it('should return 403 when no signature header is sent', async () => {
    // We hardened this to ALWAYS require a signature
    const paymentService = require('../src/services/PaymentService');
    jest.spyOn(paymentService, 'verifyPayment').mockResolvedValueOnce({
      payment: { _id: paymentId, status: 'paid' },
    });

    const payload = {
      type: 'TRANSACTION',
      obj: { id: 1, success: true, merchant_order_id: paymentId, amount_cents: 100 },
    };

    const res = await request(app)
      .post('/api/v1/payments/webhook/paymob')
      .send(payload); // no signature header

    jest.restoreAllMocks();

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/missing webhook signature/i);
  });
});
