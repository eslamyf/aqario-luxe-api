// ──────────────────────────────────────────────────────────
// Migration: Promote KYC-Approved Buyers → Owner
// ──────────────────────────────────────────────────────────
// Run ONCE: node src/scripts/migrate-buyers-to-owners.js
//
// Finds all users where:
//   role === 'buyer' AND kycStatus === 'approved'
// Sets:
//   role → 'owner'
// Logs every affected user.
// ──────────────────────────────────────────────────────────

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User     = require('../models/user.model');
const logger   = require('../utils/logger');

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) {
    logger.error('[Migration] No connection string found in .env (MONGO_URI)');
    process.exit(1);
  }
  await mongoose.connect(uri);
  logger.info('[Migration] Connected to MongoDB');

  // Find buyers with approved KYC
  const affected = await User.find({
    role:      'buyer',
    kycStatus: 'approved',
  }).select('_id name email kycStatus role');

  if (!affected.length) {
    logger.info('[Migration] ✅ No buyers with approved KYC found. Nothing to migrate.');
    process.exit(0);
  }

  logger.info(`[Migration] Found ${affected.length} buyer(s) with approved KYC → promoting to owner...`);

  let promoted = 0;
  let failed   = 0;

  for (const user of affected) {
    try {
      await User.findByIdAndUpdate(user._id, { role: 'owner' });
      logger.info(`[Migration]   ✅ ${user.name} (${user.email}) → role: buyer → owner`);
      promoted++;
    } catch (err) {
      logger.error(`[Migration]   ❌ Failed for ${user.email}: ${err.message}`);
      failed++;
    }
  }

  logger.info(`[Migration] ─────────────────────────────`);
  logger.info(`[Migration] ✅ Promoted : ${promoted}`);
  logger.info(`[Migration] ❌ Failed   : ${failed}`);
  logger.info(`[Migration] ─────────────────────────────`);

  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(err => {
  logger.error('[Migration] Fatal error:', err.message);
  logger.error(err.stack);
  process.exit(1);
});
