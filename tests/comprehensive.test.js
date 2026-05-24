/**
 * Comprehensive Test Suite — Real Estate Pro API
 * ════════════════════════════════════════════════
 * Covers: Auth · Properties · Bookings · Reviews · Auctions · Bids · Dashboard · Error Handling
 *
 * Key conventions:
 *  - All users are created via `createVerifiedUser` (from setup.js) so they
 *    pass the email-verification gate before login.
 *  - Login tokens live at res.body.token  (NOT res.body.data.token).
 *  - Bookings use field `propertyId`      (NOT property_id).
 *  - Reviews use field `propertyId`       (sent in body, POST /api/v1/reviews).
 *  - Auction bids use POST /api/v1/bids   { auctionId, amount }.
 *  - Auction startDate must be in the future.
 *  - Review creation requires an existing *approved* booking for that property.
 */

const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/server');
const User     = require('../src/models/user.model');
const Property = require('../src/models/property.model');
const Booking  = require('../src/models/booking.model');
const Auction  = require('../src/models/auction.model');
const Review   = require('../src/models/review.model');

// ─── Shared state across describes ───────────────────────────
let ownerToken, buyerToken;
let ownerId,    buyerId;
let propertyId, rentPropertyId, auctionId, bookingId, reviewId;

// ─── One-time seeding ─────────────────────────────────────────
beforeAll(async () => {
  // Owner
  const owner = await createVerifiedUser(request, app, {
    name: 'Test Owner', email: 'owner@test.com', password: 'Test@1234', role: 'owner',
  });
  ownerToken = owner.token;
  ownerId    = owner.user._id;

  // Buyer
  const buyer = await createVerifiedUser(request, app, {
    name: 'Test Buyer', email: 'buyer@test.com', password: 'Test@1234', role: 'buyer',
  });
  buyerToken = buyer.token;
  buyerId    = buyer.user._id;
});

// NOTE: No afterAll cleanup needed here.
// setup.js's afterAll (via setupFilesAfterEnv) runs first in FIFO order,
// disconnecting Mongoose and stopping the MongoMemoryServer — which wipes
// all data. Any manual deleteMany() here would hit a closed connection.

// ════════════════════════════════════════════════════════════
// AUTH TESTS
// ════════════════════════════════════════════════════════════
describe('Authentication', () => {
  it('should prevent duplicate email registration', async () => {
    // owner@test.com already exists from beforeAll
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Duplicate', email: 'owner@test.com', password: 'Test@1234' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
  });

  it('should login and return token at root level', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.com', password: 'Test@1234' });

    expect(res.status).toBe(200);
    // token is at res.body.token — NOT res.body.data.token
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.data.user).toHaveProperty('_id');
  });

  it('should reject invalid credentials with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.com', password: 'WrongPassword' });

    expect(res.status).toBe(401);
  });

  it('should return current user profile on GET /me', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('owner@test.com');
  });
});

// ════════════════════════════════════════════════════════════
// PROPERTY TESTS
// ════════════════════════════════════════════════════════════
describe('Property Management', () => {
  it('should create a sale property as owner (201)', async () => {
    const res = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title:       { en: 'Beautiful Apartment in Downtown', ar: 'شقة جميلة في وسط البلد' },
        description: { en: 'A spacious 3-bedroom apartment with modern amenities', ar: 'شقة واسعة من 3 غرف نوم مع وسائل الراحة الحديثة' },
        price:       250_000,
        type:        'apartment',
        listingType: 'sale',
        location:    {
          city: { en: 'Cairo', ar: 'القاهرة' },
          district: { en: 'Zamalek', ar: 'الزمالك' }
        },
        bedrooms:    3,
        bathrooms:   2,
        area:        150,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.property).toHaveProperty('_id');
    propertyId = res.body.data.property._id;
  });

  it('should retrieve property details by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.property.title.en).toBe('Beautiful Apartment in Downtown');
  });

  it('should allow owner to update their property price', async () => {
    const res = await request(app)
      .patch(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ price: 260_000 });

    expect(res.status).toBe(200);
    expect(res.body.data.property.price).toBe(260_000);
  });

  it('should list all properties (public endpoint)', async () => {
    const res = await request(app).get('/api/v1/properties');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.properties)).toBe(true);
  });

  it('should search properties by city and type', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .query({ city: 'Cairo', type: 'apartment' });

    expect(res.status).toBe(200);
    expect(res.body.data.properties).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════
// BOOKING TESTS
// ════════════════════════════════════════════════════════════
describe('Booking Management', () => {
  beforeAll(async () => {
    // Create a rent property directly in DB (skips admin-approval flow)
    const rentProp = await Property.create({
      title:       'Rental Test Property',
      description: 'A rental property for booking tests',
      price:       3_000,
      type:        'apartment',
      listingType: 'rent',
      status:      'available',
      location:    { city: 'Cairo', district: 'Maadi' },
      owner:       ownerId,
      isApproved:  true,
    });
    rentPropertyId = rentProp._id.toString();
  });

  it('should create a booking for an available rental property (201)', async () => {
    const start = new Date(Date.now() + 7  * 24 * 60 * 60 * 1000).toISOString();
    const end   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ propertyId: rentPropertyId, amount: 6_000, start_date: start, end_date: end });

    expect(res.status).toBe(201);
    expect(res.body.data.booking).toHaveProperty('_id');
    expect(res.body.data.booking.status).toBe('pending');
    bookingId = res.body.data.booking._id;
  });

  it('should reject booking with past dates (400)', async () => {
    const past1 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const past2 = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ propertyId: rentPropertyId, amount: 3_000, start_date: past1, end_date: past2 });

    expect(res.status).toBe(400);
  });

  it('should reject unauthenticated booking request (401)', async () => {
    const start = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    const end   = new Date(Date.now() + 27 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/bookings')
      .send({ propertyId: rentPropertyId, amount: 3_000, start_date: start, end_date: end });

    expect(res.status).toBe(401);
  });

  it('should allow owner to approve a booking (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/bookings/${bookingId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('approved');
  });

  it('should retrieve buyer bookings list from dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/buyer/bookings')
      .set('Authorization', `Bearer ${buyerToken}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════
// REVIEW TESTS
// ════════════════════════════════════════════════════════════
describe('Review Management', () => {
  let reviewPropertyId, reviewBookingId;

  beforeAll(async () => {
    // Create a dedicated rent property for reviews
    const prop = await Property.create({
      title:       'Review Test Property',
      description: 'Property used for review tests',
      price:       2_000,
      type:        'apartment',
      listingType: 'rent',
      status:      'available',
      location:    { city: 'Cairo', district: 'Heliopolis' },
      owner:       ownerId,
      isApproved:  true,
    });
    reviewPropertyId = prop._id.toString();

    // Create a *completed* booking — required to write a review
    const booking = await Booking.create({
      user_id:     buyerId,
      property_id: reviewPropertyId,
      amount:      2_000,
      start_date:  new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      end_date:    new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      status:      'completed',
    });
    reviewBookingId = booking._id;
  });

  it('should create a review after an approved booking (201)', async () => {
    const res = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ propertyId: reviewPropertyId, rating: 4.5, comment: 'Great property, excellent location!' });

    expect(res.status).toBe(201);
    expect(res.body.data.review).toHaveProperty('_id');
    reviewId = res.body.data.review._id;
  });

  it('should prevent a user from submitting a duplicate review (400 or 409)', async () => {
    const res = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ propertyId: reviewPropertyId, rating: 5, comment: 'Second review attempt' });

    expect([400, 409]).toContain(res.status);
  });

  it('should reflect avgRating on the property after review', async () => {
    const res = await request(app)
      .get(`/api/v1/properties/${reviewPropertyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.property.avgRating).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════
// AUCTION TESTS
// ════════════════════════════════════════════════════════════
describe('Auction Management', () => {
  let auctionPropertyId;

  beforeAll(async () => {
    // Create a property specifically for auction
    const prop = await Property.create({
      title:       'Auction Test Property',
      description: 'Property for auction testing',
      price:       200_000,
      type:        'villa',
      listingType: 'sale',
      status:      'available',
      location:    { city: 'Cairo', district: 'New Cairo' },
      owner:       ownerId,
      isApproved:  true,
    });
    auctionPropertyId = prop._id.toString();
  });

  it('should allow owner to create an auction (201)', async () => {
    const startDate = new Date(Date.now() + 2  * 24 * 60 * 60 * 1000); // +2 days
    const endDate   = new Date(Date.now() + 9  * 24 * 60 * 60 * 1000); // +9 days

    const res = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        property:      auctionPropertyId,
        startingPrice: 200_000,
        bidIncrement:  5_000,
        startDate,
        endDate,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.auction).toHaveProperty('_id');
    auctionId = res.body.data.auction._id;
  });

  it('should retrieve auction details by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/auctions/${auctionId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.auction).toHaveProperty('startingPrice', 200_000);
  });

  it('should allow buyer to place a bid on the auction (201)', async () => {
    // Make auction active manually before bidding
    await Auction.findByIdAndUpdate(auctionId, { status: 'active', startDate: new Date(Date.now() - 10000) });

    const res = await request(app)
      .post('/api/v1/bids')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ auctionId, amount: 210_000 });

    expect(res.status).toBe(201);
    expect(res.body.data.bid).toHaveProperty('amount', 210_000);
  });

  it('should reject a bid lower than current bid (400)', async () => {
    const res = await request(app)
      .post('/api/v1/bids')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ auctionId, amount: 100 }); // way below starting price

    expect(res.status).toBe(400);
  });

  it('should list all auctions (public)', async () => {
    const res = await request(app).get('/api/v1/auctions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.auctions)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// DASHBOARD & ANALYTICS
// ════════════════════════════════════════════════════════════
describe('Dashboard & Analytics', () => {
  it('should retrieve owner dashboard stats', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/owner/stats')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalProperties');
    expect(res.body.data).toHaveProperty('totalBookings');
  });

  it('should retrieve owner bookings list with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/owner/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toBeDefined();
  });

  it('should reject buyer access to owner dashboard (403)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/owner/stats')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════
// ERROR HANDLING
// ════════════════════════════════════════════════════════════
describe('Error Handling', () => {
  it('should return 404 for a non-existent property', async () => {
    const res = await request(app)
      .get('/api/v1/properties/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 401 for an unauthenticated request to protected route', async () => {
    const res = await request(app).get('/api/v1/dashboard/owner/stats');
    expect(res.status).toBe(401);
  });

  it('should return 403 when buyer tries to update a property', async () => {
    const res = await request(app)
      .patch(`/api/v1/properties/${propertyId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ price: 999 });

    expect(res.status).toBe(403);
  });

  it('should return 404 for completely unknown routes', async () => {
    const res = await request(app).get('/api/v1/route-does-not-exist');
    expect([404]).toContain(res.status);
  });
});
