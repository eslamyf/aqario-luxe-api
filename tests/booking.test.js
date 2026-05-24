/**
 * Booking Tests
 * Covers: create booking, validation, auth guards.
 *
 * Properties created directly via Mongoose to skip approval workflow.
 * Booking requires:  propertyId, amount, start_date, end_date
 * Property must be:  listingType='rent', status='available', isApproved=true
 */

const request  = require('supertest');
const { app }  = require('../src/server');
const User     = require('../src/models/user.model');
const Property = require('../src/models/property.model');
const Booking  = require('../src/models/booking.model');
const mongoose = require('mongoose');
// global.createVerifiedUser is available automatically

let ownerToken, buyerToken, propertyId, bookingId;

beforeEach(async () => {
  // Clean DB before each test
  await Booking.deleteMany({});
  await Property.deleteMany({});
  await User.deleteMany({});

  // Create verified users
  const owner = await createVerifiedUser(request, app, {
    name: 'Owner', email: 'owner@test.com', password: 'Test@1234', role: 'owner',
  });
  const buyer = await createVerifiedUser(request, app, {
    name: 'Buyer', email: 'buyer@test.com', password: 'Test@1234', role: 'buyer',
  });

  ownerToken = owner.token;
  buyerToken = buyer.token;

  // Create rental property directly (bypasses admin approval)
  const prop = await Property.create({
    title:       'Distinctive rental apartment for testing',
    description: 'Wonderful apartment for rent',
    price:       5000,
    type:        'apartment',
    listingType: 'rent',
    status:      'available',
    location:    { city: 'Cairo', district: 'Nasr' },
    owner:       owner.user._id,
    isApproved:  true,
  });

  propertyId = prop._id.toString();

  // Create an approved viewing request for the buyer to bypass the viewing-gated booking constraint
  const ViewingRequest = require('../src/models/viewingRequest.model');
  await ViewingRequest.create({
    requester: buyer.user._id,
    property: prop._id,
    owner: owner.user._id,
    status: 'approved',
    preferredDate: new Date(),
    preferredTime: '10:00 AM'
  });
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Booking Routes', () => {

  // ── Create Booking ────────────────────────────────────────────
  describe('POST /api/v1/bookings', () => {

    it('should create a booking for an available rental property (201)', async () => {
      const start = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const end   = new Date(Date.now() + 14*24*60*60*1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ propertyId, amount: 10000, start_date: start, end_date: end });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.booking.status).toBe('pending');
      bookingId = res.body.data.booking._id;
    });

    it('should reject booking for a non-existent property (404)', async () => {
      const start = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const end   = new Date(Date.now() + 14*24*60*60*1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ propertyId: '64f1a2b3c4d5e6f7a8b9c0d1', amount: 5000, start_date: start, end_date: end });

      expect(res.status).toBe(404);
    });

    it('should reject booking with past dates (400)', async () => {
      const pastStart = new Date(Date.now() - 14*24*60*60*1000).toISOString();
      const pastEnd   = new Date(Date.now() - 7*24*60*60*1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ propertyId, amount: 5000, start_date: pastStart, end_date: pastEnd });

      expect(res.status).toBe(400);
    });

    it('should reject booking when start_date >= end_date (400)', async () => {
      const sameDate = new Date(Date.now() + 7*24*60*60*1000).toISOString();

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ propertyId, amount: 5000, start_date: sameDate, end_date: sameDate });

      expect(res.status).toBe(400);
    });

    it('should require authentication — reject unauthenticated request (401)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({ propertyId, amount: 5000 });

      expect(res.status).toBe(401);
    });

    it('should detect date conflicts for already-booked property (409)', async () => {
      const start = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const end   = new Date(Date.now() + 14*24*60*60*1000).toISOString();

      // First booking
      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ propertyId, amount: 10000, start_date: start, end_date: end });

      // Second booking overlaps the first
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ propertyId, amount: 10000, start_date: start, end_date: end });

      expect(res.status).toBe(409);
    });
  });

});