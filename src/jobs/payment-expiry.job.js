const cron = require('node-cron');
const Payment = require('../models/payment.model');
const logger = require('../utils/logger');

// ─── Payment Expiry logic ───────────────────────────────
const runPaymentExpiryJob = async () => {
  try {
    const now = new Date();

    const result = await Payment.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: now },
        isVerified: false,
      },
      {
        status: 'expired',
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(
        `[Cron] Payment expiry: ${result.modifiedCount} payments marked as expired`
      );
    }
    return result.modifiedCount;
  } catch (err) {
    logger.error('[Cron] Payment expiry job error:', err);
    throw err;
  }
};

const initPaymentExpiryJob = () => {
  logger.info('[Cron] Starting payment expiry cleanup job...');

  // Run every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    await runPaymentExpiryJob();
  });

  logger.info('[Cron] Payment expiry job scheduled (every 10 minutes)');
};

module.exports = initPaymentExpiryJob;
module.exports.runPaymentExpiryJob = runPaymentExpiryJob;
