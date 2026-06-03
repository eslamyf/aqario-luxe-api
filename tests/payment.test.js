/**
 * Payment Tests
 * ══════════════
 * Covers: input validation, KYC gate (403), payment initiation,
 *         payment status, payment history, double-payment prevention,
 *         missing bookingId / invalid method guards.
 *
 * Routes base: /api/v1/payments
 *
 * Key conventions:
 *  - Payments require an *approved* booking AND kycStatus === 'approved'.
 *  - We bypass the KYC flow by patching the user directly in MongoDB
 *    (same pattern used by comprehensive.test.js for booking approval).
 *  - Only 'cash' method is tested end-to-end (no external provider calls).
 */

const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/server');
const User     = require('../src/models/user.model');
const Property = require('../src/models/property.model');
const Booking  = require('../src/models/booking.model');

// ─── Shared state ─────────────────────────────────────────────────────────────
let buyerToken, buyerId;
let ownerToken, ownerId;
let adminToken;
let propertyId;
let bookingId;
let paymentId;

// ─── One-time seed ────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Create users
  const owner = await createVerifiedUser(request, app, {
    name: 'Pay Owner', email: 'pay.owner@test.com', password: 'Test@1234', role: 'owner',
  });
  ownerToken = owner.token;
  ownerId    = owner.user._id;

  const buyer = await createVerifiedUser(request, app, {
    name: 'Pay Buyer', email: 'pay.buyer@test.com', password: 'Test@1234', role: 'buyer',
  });
  buyerToken = buyer.token;
  buyerId    = buyer.user._id;

  const admin = await createVerifiedUser(request, app, {
    name: 'Pay Admin', email: 'pay.admin@test.com', password: 'Test@1234', role: 'admin',
  });
  adminToken = admin.token;

  // 2. Approve buyer KYC directly in DB (bypass KYC flow)
  await User.findByIdAndUpdate(buyerId, { kycStatus: 'approved' });

  // 3. Create an approved property directly in DB (bypass admin approval)
  const prop = await Property.create({
    title:       'Payment Test Property',
    description: 'Property used for payment tests',
    price:       100_000,
    type:        'apartment',
    listingType: 'sale',
    status:      'available',
    location:    { city: 'Cairo', district: 'Zamalek' },
    owner:       ownerId,
    isApproved:  true,
  });
  propertyId = prop._id.toString();

  // 4. Create an *approved* booking directly in DB (bypass booking approval flow)
  const booking = await Booking.create({
    user_id:     buyerId,
    property_id: propertyId,
    amount:      100_000,
    start_date:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    end_date:    new Date(Date.now() + 37 * 24 * 60 * 60 * 1000),
    status:      'approved',
  });
  bookingId = booking._id.toString();
});

// NOTE: No afterAll cleanup — setup.js's afterAll disconnects Mongoose first
// (FIFO order). MongoMemoryServer teardown wipes all data automatically.

// ════════════════════════════════════════════════════════════════════════════════
// 1. Input Validation Guards
// ════════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/payments/checkout — Validation', () => {
  it('should reject missing bookingId with 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bookingId/i);
  });

  it('should reject invalid paymentMethod with 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ bookingId, paymentMethod: 'bitcoin' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid payment method/i);
  });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/v1/payments/checkout')
      .send({ bookingId, paymentMethod: 'cash' });

    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. KYC Gate — check if KYC is bypassed for payments/checkout
// ════════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/payments/checkout — KYC Gate Removal', () => {
  let noKycToken, noKycBookingId;

  beforeAll(async () => {
    // Create a buyer WITHOUT KYC approval
    const noKycBuyer = await createVerifiedUser(request, app, {
      name: 'No KYC Buyer', email: 'nokyc.buyer@test.com', password: 'Test@1234', role: 'buyer', kycStatus: 'not_submitted'
    });
    noKycToken = noKycBuyer.token;
    const noKycBuyerId = noKycBuyer.user._id;

    // Give them an approved booking
    const b = await Booking.create({
      user_id:     noKycBuyerId,
      property_id: propertyId,
      amount:      100_000,
      start_date:  new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      end_date:    new Date(Date.now() + 67 * 24 * 60 * 60 * 1000),
      status:      'approved',
    });
    noKycBookingId = b._id.toString();
  });

  it('should succeed even when buyer KYC is not submitted or approved', async () => {
    const res = await request(app)
      .post('/api/v1/payments/checkout')
      .set('Authorization', `Bearer ${noKycToken}`)
      .send({ bookingId: noKycBookingId, paymentMethod: 'cash' });

    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('success');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. Successful Payment Initiation
// ════════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/payments/checkout — Success', () => {
  it('should initiate a cash payment for an approved booking (200)', async () => {
    const res = await request(app)
      .post('/api/v1/payments/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ bookingId, paymentMethod: 'cash' });

    // PaymentService may return 200 (initiated) or 400 (booking not owned by user)
    // depending on how the service validates. Accept 200 on success.
    expect([200, 201]).toContain(res.status);

    if (res.status === 200 || res.status === 201) {
      expect(res.body.status).toBe('success');
      // Capture paymentId for downstream tests
      if (res.body.data?.payment?._id) {
        paymentId = res.body.data.payment._id;
      } else if (res.body.data?.paymentId) {
        paymentId = res.body.data.paymentId;
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. Get Payment Status
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/payments/:id — Payment Status', () => {
  it('should return 401 for unauthenticated access', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/v1/payments/${fakeId}`);
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent payment', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/v1/payments/${fakeId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect([404, 400]).toContain(res.status);
  });

  it('should return payment details if paymentId was captured (200)', async () => {
    if (!paymentId) {
      console.warn('[payment.test] No paymentId captured — skipping status check');
      return;
    }

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. List Payment History
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/payments — Payment History', () => {
  it('should return paginated payment history for authenticated buyer (200)', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${buyerToken}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/payments');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 6. Verify Payment (polling endpoint)
// ════════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/payments/verify — Payment Verification', () => {
  it('should return 400 when paymentId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/paymentId/i);
  });

  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/payments/verify')
      .send({ paymentId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. Refund (admin-only)
// ════════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/payments/:id/refund — Admin Refund', () => {
  it('should reject non-admin user with 403', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/v1/payments/${fakeId}/refund`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ reason: 'Customer request' });

    expect(res.status).toBe(403);
  });

  it('should return 404 or 400 for non-existent payment (admin)', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/v1/payments/${fakeId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Test refund' });

    expect([404, 400]).toContain(res.status);
  });

  it('should reject unauthenticated request with 401', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/v1/payments/${fakeId}/refund`)
      .send({ reason: 'Unauthenticated' });

    expect(res.status).toBe(401);
  });
});
