const request = require('supertest');
const { app } = require('../src/server');

describe('Jobs Vercel Cron Endpoints', () => {
  it('GET /api/v1/jobs/booking-completion — should execute successfully', async () => {
    const res = await request(app).get('/api/v1/jobs/booking-completion');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain('booking(s) as completed');
  });

  it('GET /api/v1/jobs/kyc-cleanup — should execute successfully', async () => {
    const res = await request(app).get('/api/v1/jobs/kyc-cleanup');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toBe('KYC orphan cleanup completed successfully');
  });

  it('GET /api/v1/jobs/payment-expiry — should execute successfully', async () => {
    const res = await request(app).get('/api/v1/jobs/payment-expiry');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain('payment(s) as expired');
  });

  it('GET /api/v1/jobs/saved-search — should execute successfully', async () => {
    const res = await request(app).get('/api/v1/jobs/saved-search');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
  });

  it('GET /api/v1/jobs/subscription-expiry — should execute successfully', async () => {
    const res = await request(app).get('/api/v1/jobs/subscription-expiry');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toBe('Subscription expiry check completed successfully');
  });

  it('GET /api/v1/jobs/subscription-reset — should execute successfully', async () => {
    const res = await request(app).get('/api/v1/jobs/subscription-reset');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toBe('Subscription usage reset completed successfully');
  });
});
