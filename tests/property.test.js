/**
 * Property & Search Tests
 * Covers: CRUD for properties, search, filtering.
 *
 * Owners need role='owner' + isVerified=true (handled by createVerifiedUser helper).
 */

const request  = require('supertest');
const { app }  = require('../src/server');

let ownerToken, buyerToken, propertyId;

beforeEach(async () => {
  const owner = await createVerifiedUser(request, app, {
    name: 'Owner User', email: 'owner@test.com', password: 'Test@1234', role: 'owner',
  });
  const buyer = await createVerifiedUser(request, app, {
    name: 'Buyer User', email: 'buyer@test.com', password: 'Test@1234', role: 'buyer',
  });

  ownerToken = owner.token;
  buyerToken = buyer.token;
});

afterEach(async () => {
  const mongoose = require('mongoose');
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.deleteMany({});
    }
  }
});

describe('Property Routes', () => {

  // ── List Properties ───────────────────────────────────────────
  describe('GET /api/v1/properties', () => {
    it('should return a list (array) of properties', async () => {
      const res = await request(app).get('/api/v1/properties');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.properties)).toBe(true);
    });

    it('should support pagination via page & limit query params', async () => {
      const res = await request(app).get('/api/v1/properties?page=1&limit=5');
      expect(res.status).toBe(200);
    });
  });

  // ── Create Property ───────────────────────────────────────────
  describe('POST /api/v1/properties', () => {
    it('should allow an owner to create a property (201)', async () => {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title:       { en: 'Luxury apartment for sale in New Cairo', ar: 'شقة فاخرة للبيع في القاهرة الجديدة' },
          description: { en: 'Distinctive apartment with an excellent strategic location', ar: 'شقة مميزة بموقع استراتيجي ممتاز' },
          price:       1_500_000,
          type:        'apartment',
          listingType: 'sale',
          location:    {
            city: { en: 'Cairo', ar: 'القاهرة' },
            district: { en: 'Nasr City', ar: 'مدينة نصر' }
          },
          bedrooms:    3,
          bathrooms:   2,
          area:        150,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.property).toHaveProperty('_id');
      propertyId = res.body.data.property._id;
    });

    it('should reject unauthenticated property creation with 401', async () => {
      const res = await request(app)
        .post('/api/v1/properties')
        .send({
          title: { en: 'No Auth English', ar: 'لا يوجد صلاحية عربي' },
          price: 1000,
          type: 'apartment',
          listingType: 'sale'
        });

      expect(res.status).toBe(401);
    });

    it('should reject property creation by a buyer (403)', async () => {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          title:       { en: 'Buyer Property English', ar: 'عقار المشتري باللغة العربية' },
          description: { en: 'Test description for buyer property validation', ar: 'وصف تجريبي لعقار المشتري للتأكد' },
          price:       1000,
          type:        'apartment',
          listingType: 'sale',
          location:    {
            city: { en: 'Cairo', ar: 'القاهرة' },
            district: { en: 'Nasr', ar: 'نصر' }
          },
        });

      expect(res.status).toBe(403);
    });
  });

  // ── Get / Update / Delete ─────────────────────────────────────
  describe('Property CRUD (owner-specific)', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title:       { en: 'CRUD Test Property', ar: 'عقار تجريبي للعمليات الأساسية' },
          description: { en: 'For testing CRUD operations in English', ar: 'وصف تجريبي للعمليات الأساسية بالعربي' },
          price:       500_000,
          type:        'villa',
          listingType: 'sale',
          location:    {
            city: { en: 'Alexandria', ar: 'الإسكندرية' },
            district: { en: 'Smouha', ar: 'سموحة' }
          },
          bedrooms:    4,
          bathrooms:   3,
          area:        300,
        });
      propertyId = res.body.data.property._id;
    });

    it('should return property details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.property.title.en).toBe('CRUD Test Property');
    });

    it('should allow owner to update their property', async () => {
      const res = await request(app)
        .patch(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ price: 550_000 });

      expect(res.status).toBe(200);
      expect(res.body.data.property.price).toBe(550_000);
    });

    it('should return 404 for non-existent property ID', async () => {
      const res = await request(app)
        .get('/api/v1/properties/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject update by a non-owner (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ price: 1 });

      expect(res.status).toBe(403);
    });
  });

  // ── Search ────────────────────────────────────────────────────
  describe('GET /api/v1/search', () => {
    it('should return properties array (even when empty)', async () => {
      const res = await request(app).get('/api/v1/search?city=Cairo');
      expect(res.status).toBe(200);
      expect(res.body.data.properties).toBeDefined();
      expect(Array.isArray(res.body.data.properties)).toBe(true);
    });

    it('should support price range filter (minPrice / maxPrice)', async () => {
      const res = await request(app)
        .get('/api/v1/search?minPrice=100000&maxPrice=2000000');

      expect(res.status).toBe(200);
    });

    it('should support type filter', async () => {
      const res = await request(app).get('/api/v1/search?type=apartment');
      expect(res.status).toBe(200);
    });
  });

});
