/**
 * Global Test Setup
 * Uses MongoMemoryServer for isolated, in-memory MongoDB testing.
 * Provides a global helper for creating pre-verified users.
 */

const mongoose              = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.setTimeout(600000);

let mongod;

// ─── Global Setup ──────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [
      {
        launchTimeout: 60000,
      },
    ],
  });
  const uri = mongod.getUri();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(uri);

  process.env.JWT_SECRET         = 'test_secret_key_at_least_32_chars_long_for_test';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_different_key_for_test_env';
  process.env.JWT_EXPIRES_IN     = '1d';
  process.env.NODE_ENV           = 'test';
  process.env.MONGO_URI          = uri;
  process.env.CLIENT_URL         = 'http://localhost:3000';
  process.env.REDIS_URL          = '';   // disable Redis in tests
}, 600000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// NOTE: Global afterEach cleanup is intentionally removed.
// Each test file manages its own cleanup (afterEach or afterAll).
// Cross-file contamination is impossible — every file gets a fresh
// MongoMemoryServer from the beforeAll above.

/**
 * Helper: register + verify + login a user in one step.
 * Returns { token, refreshToken, user }
 */
global.createVerifiedUser = async (request, app, { name, email, password, role = 'buyer', kycStatus = 'approved' } = {}) => {
  const User = require('../src/models/user.model');

  // 1. Register
  const regRes = await request(app).post('/api/v1/auth/register').send({ name, email, password });
  if (regRes.status !== 201) {
    throw new Error(`Register failed for ${email}: ${JSON.stringify(regRes.body)}`);
  }

  // 2. Mark as verified, set role, and set KYC status directly in DB
  const user = await User.findOneAndUpdate({ email }, { isVerified: true, role, kycStatus }, { new: true });

  if (role === 'owner' || role === 'agent') {
    const Subscription = require('../src/models/subscription.model');
    const sub = await Subscription.create({
      user: user._id,
      plan: 'enterprise',
      status: 'active',
      maxListings: -1,
      price: 999,
      currency: 'USD',
      startDate: new Date(),
      endDate: new Date(Date.now() + 3000000000) // far future
    });
    user.activeSubscription = sub._id;
    user.subscriptionStatus = 'active';
    await user.save({ validateBeforeSave: false });
  }

  // 3. Login
  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (loginRes.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(loginRes.body)}`);
  }

  return {
    token:        loginRes.body.token,
    refreshToken: loginRes.body.refreshToken,
    user:         loginRes.body.data.user,
  };
};
