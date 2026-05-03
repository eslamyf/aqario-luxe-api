// ──────────────────────────────────────────────────────────
// KYC Orphan Cleanup Job
// Removes temporary ownership documents older than 24 hours
// that were never finalized (user abandoned the KYC form)
// ──────────────────────────────────────────────────────────

const cron = require('node-cron');
const User = require('../models/user.model');
const logger = require('../utils/logger');

const TEMP_TTL_HOURS = 24; // hours before an orphan doc is deleted

/**
 * Remove temporary ownership documents older than TEMP_TTL_HOURS
 */
const cleanOrphanOwnershipDocs = async () => {
  try {
    const cutoff = new Date(Date.now() - TEMP_TTL_HOURS * 60 * 60 * 1000);

    // Find all users who have at least one temporary doc older than the cutoff
    const users = await User.find({
      'ownershipDocuments': {
        $elemMatch: {
          isTemporary: true,
          uploadedAt: { $lt: cutoff },
        },
      },
    }).select('ownershipDocuments');

    if (!users.length) return;

    let totalRemoved = 0;

    for (const user of users) {
      const before = user.ownershipDocuments.length;

      // Keep permanent docs OR recent temporary docs
      user.ownershipDocuments = user.ownershipDocuments.filter(doc => {
        if (!doc.isTemporary) return true;               // keep permanent
        if (doc.uploadedAt > cutoff) return true;        // keep recent temp
        return false;                                     // remove old orphan
      });

      const removed = before - user.ownershipDocuments.length;
      if (removed > 0) {
        await user.save({ validateBeforeSave: false });
        totalRemoved += removed;
        logger.info(`[KYC Cleanup] Removed ${removed} orphan doc(s) for user ${user._id}`);
      }
    }

    if (totalRemoved > 0) {
      logger.info(`[KYC Cleanup] ✅ Total orphan documents removed: ${totalRemoved}`);
    }
  } catch (err) {
    logger.error(`[KYC Cleanup] ❌ Error during orphan cleanup: ${err.message}`);
  }
};

/**
 * Initialize the KYC cleanup cron job
 * Runs every day at 03:00 AM
 */
const initKycCleanupJob = () => {
  cron.schedule('0 3 * * *', async () => {
    logger.info('[KYC Cleanup] 🧹 Running orphan ownership document cleanup...');
    await cleanOrphanOwnershipDocs();
  });

  logger.info('[KYC Cleanup] ✅ Orphan cleanup job scheduled → runs daily at 03:00 AM');
};

module.exports = { initKycCleanupJob, cleanOrphanOwnershipDocs };
