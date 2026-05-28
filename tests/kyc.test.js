/**
 * KYC (Know Your Customer) Tests
 * ═══════════════════════════════
 * Covers: submit documents, get status, get my KYC,
 *         admin list pending, admin approve, admin reject,
 *         admin reset, requireKYC middleware enforcement.
 *
 * Routes base: /api/v1/kyc
 * Admin routes mounted under the same router after restrictTo('admin').
 */

const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/server');
const User     = require('../src/models/user.model');

// ─── Shared state ─────────────────────────────────────────────────────────────
let buyerToken, buyerId;
let adminToken, adminId;
let ownerToken, ownerId;

// ─── One-time seed ────────────────────────────────────────────────────────────
beforeAll(async () => {
  const buyer = await createVerifiedUser(request, app, {
    name: 'KYC Buyer', email: 'kyc.buyer@test.com', password: 'Test@1234', role: 'buyer', kycStatus: 'not_submitted',
  });
  buyerToken = buyer.token;
  buyerId    = buyer.user._id;

  const admin = await createVerifiedUser(request, app, {
    name: 'KYC Admin', email: 'kyc.admin@test.com', password: 'Test@1234', role: 'admin', kycStatus: 'not_submitted',
  });
  adminToken = admin.token;
  adminId    = admin.user._id;

  const owner = await createVerifiedUser(request, app, {
    name: 'KYC Owner', email: 'kyc.owner@test.com', password: 'Test@1234', role: 'owner', kycStatus: 'not_submitted',
  });
  ownerToken = owner.token;
  ownerId    = owner.user._id;
});

// NOTE: No afterAll cleanup — setup.js's afterAll disconnects Mongoose first
// (FIFO order). MongoMemoryServer teardown wipes all data automatically.

// ════════════════════════════════════════════════════════════════════════════════
// 1. Submit KYC Documents
// ════════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/kyc — Submit KYC Documents', () => {
  it('should submit national_id documents successfully (200)', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        documentType: 'national_id',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/front.jpg',
        backImage:    'https://res.cloudinary.com/test/image/upload/v1/back.jpg',
        nationality:  'Egyptian',
        phoneNumber:  '+201234567890',
        livePhoto:    'https://res.cloudinary.com/test/image/upload/v1/selfie.jpg',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.kycStatus).toBe('pending');
    expect(res.body.data.submitted).toBe(true);
  });

  it('should submit passport documents (no backImage required) (200)', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        documentType: 'passport',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/passport.jpg',
        nationality:  'French',
        phoneNumber:  '+33612345678',
        livePhoto:    'https://res.cloudinary.com/test/image/upload/v1/selfie.jpg',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.documentType).toBe('passport');
  });

  it('should reject missing nationality with 400', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        documentType: 'national_id',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/front.jpg',
        phoneNumber:  '+201234567890',
        livePhoto:    'https://res.cloudinary.com/test/image/upload/v1/selfie.jpg',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nationality/i);
  });

  it('should reject missing phoneNumber with 400', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        documentType: 'national_id',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/front.jpg',
        nationality:  'Egyptian',
        livePhoto:    'https://res.cloudinary.com/test/image/upload/v1/selfie.jpg',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('should reject missing livePhoto with 400', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        documentType: 'national_id',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/front.jpg',
        nationality:  'Egyptian',
        phoneNumber:  '+201234567890',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/live/i);
  });

  it('should reject invalid documentType with 400', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        documentType: 'selfie',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/front.jpg',
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.message).toMatch(/KYC\.INVALID_DOC_TYPE/i);
  });

  it('should reject missing frontImage with 400', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ documentType: 'national_id' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/KYC\.FRONT_IMAGE_REQUIRED/i);
  });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/v1/kyc')
      .send({
        documentType: 'national_id',
        frontImage:   'https://res.cloudinary.com/test/image/upload/v1/front.jpg',
      });

    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. Get KYC Status
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/kyc/status — Get KYC Status', () => {
  it('should return kycStatus for authenticated user (200)', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/status')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('kycStatus');
    expect(['not_submitted', 'pending', 'approved', 'rejected'])
      .toContain(res.body.data.kycStatus);
  });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/kyc/status');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. Get My KYC (detailed)
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/kyc/me — Get My Detailed KYC', () => {
  it('should return detailed KYC info for authenticated user (200)', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/me')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('kycInfo');
    expect(res.body.data.kycInfo).toHaveProperty('status');
    // Sensitive image URLs must NOT be exposed
    const docs = res.body.data.kycInfo.documents || [];
    docs.forEach(doc => {
      expect(doc).not.toHaveProperty('frontImage');
      expect(doc).not.toHaveProperty('backImage');
    });
  });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/v1/kyc/me');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. Admin — List Pending KYC
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/kyc/pending — Admin: List Pending KYC', () => {
  it('should return paginated list of pending KYC submissions for admin (200)', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('pages');
  });

  it('should reject non-admin access with 403', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/pending')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated access with 401', async () => {
    const res = await request(app).get('/api/v1/kyc/pending');
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. Admin — Approve KYC
// ════════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/kyc/:userId/approve — Admin: Approve KYC', () => {
  // Buyer already submitted docs in test group 1 → status is 'pending'
  it('should approve KYC for a pending user (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${buyerId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.kycStatus).toBe('approved');
    expect(res.body.data.user).toHaveProperty('kycApprovedAt');
  });

  it('should return 400 when approving an already-approved KYC', async () => {
    // Buyer is now 'approved' from the test above
    const res = await request(app)
      .patch(`/api/v1/kyc/${buyerId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already approved/i);
  });

  it('should return 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .patch(`/api/v1/kyc/${fakeId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('should reject non-admin access with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${buyerId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 6. Admin — Reject KYC
// ════════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/kyc/:userId/reject — Admin: Reject KYC', () => {
  // Owner submitted docs in test group 1 → status is 'pending'
  it('should reject KYC with a valid reason (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Document image is blurry and unreadable' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.kycStatus).toBe('rejected');
    expect(res.body.data.user.rejectionReason).toBeDefined();
  });

  it('should return 400 when reason is missing', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/reason/i);
  });

  it('should return 400 when reason exceeds 500 characters', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'x'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('should reject non-admin access with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reject`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ reason: 'Should not work' });

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. Admin — Reset KYC
// ════════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/kyc/:userId/reset — Admin: Reset KYC', () => {
  // Owner is now 'rejected' from test group 6
  it('should reset KYC status to not_submitted (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.kycStatus).toBe('not_submitted');
  });

  it('should return 400 when KYC is already not_submitted', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reset`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already not_submitted/i);
  });

  it('should reject non-admin access with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/kyc/${ownerId}/reset`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 8. KYC Summary
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/kyc/summary — Admin: KYC Statistics', () => {
  it('should return KYC stats with completionRate (200)', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kycStats).toHaveProperty('approved');
    expect(res.body.data.kycStats).toHaveProperty('pending');
    expect(res.body.data.kycStats).toHaveProperty('rejected');
    expect(res.body.data.kycStats).toHaveProperty('completionRate');
  });

  it('should reject non-admin access with 403', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/summary')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 9. Ownership Document Forced Download
// ════════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/kyc/ownership/download/:userId/:docId — Secure Download', () => {
  let docId;
  const https = require('https');

  beforeAll(async () => {
    const user = await User.findById(ownerId);
    user.isVerified = true; // Re-verify email as previous reset/reject tests set it to false
    user.ownershipDocuments.push({
      fileUrl: 'https://res.cloudinary.com/test/image/upload/v1/contract.pdf',
      fileName: 'contract.pdf',
      fileType: 'pdf',
      isTemporary: false
    });
    await user.save({ validateBeforeSave: false });
    docId = user.ownershipDocuments[0]._id.toString();
  });

  it('should allow the owner to download their own document (200)', async () => {
    const stream = new (require('stream').PassThrough)();
    stream.write('dummy file content');
    stream.end();
    stream.statusCode = 200;
    stream.headers = {};

    const spy = jest.spyOn(https, 'get').mockImplementation((url, cb) => {
      cb(stream);
      return { on: () => {} };
    });

    const res = await request(app)
      .get(`/api/v1/kyc/ownership/download/${ownerId}/${docId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="document.pdf"');
    expect(res.body.toString()).toBe('dummy file content');

    spy.mockRestore();
  });

  it('should allow an admin to download a user\'s document (200)', async () => {
    const stream = new (require('stream').PassThrough)();
    stream.write('admin downloaded content');
    stream.end();
    stream.statusCode = 200;
    stream.headers = {};

    const spy = jest.spyOn(https, 'get').mockImplementation((url, cb) => {
      cb(stream);
      return { on: () => {} };
    });

    const res = await request(app)
      .get(`/api/v1/kyc/ownership/download/${ownerId}/${docId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('admin downloaded content');

    spy.mockRestore();
  });

  it('should deny unauthorized users with 403', async () => {
    const res = await request(app)
      .get(`/api/v1/kyc/ownership/download/${ownerId}/${docId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  it('should return 404 for invalid document ID', async () => {
    const fakeDocId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/v1/kyc/ownership/download/${ownerId}/${fakeDocId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});
