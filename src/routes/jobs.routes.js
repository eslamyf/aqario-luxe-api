const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

const { runBookingJob } = require('../jobs/booking.job');
const { cleanOrphanOwnershipDocs } = require('../jobs/kyc-cleanup.job');
const { runPaymentExpiryJob } = require('../jobs/payment-expiry.job');
const { runSavedSearchJob } = require('../jobs/savedSearch.job');
const { expireSubscriptions, resetMonthlyUsage } = require('../jobs/subscription-expiry.job');

// ─── Verify Cron Secret Middleware ──────────────────────────────
const verifyCronSecret = (req, res, next) => {
  // Bypassed in test environment to make integration testing easy
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === 'production' || cronSecret) {
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      logger.warn(`[Cron Router] Unauthorized attempt to trigger job: ${req.path}`);
      return res.status(401).json({
        status: 'fail',
        message: 'Unauthorized: Invalid or missing Cron Secret'
      });
    }
  }
  next();
};

router.use(verifyCronSecret);

// ─── Endpoint definitions (GET requests for Vercel Crons compatibility) ───
router.get('/booking-completion', async (req, res, next) => {
  try {
    logger.info('[Vercel Cron] Triggered booking completion...');
    const result = await runBookingJob(req.io);
    res.status(200).json({ status: 'success', message: `Marked ${result} booking(s) as completed` });
  } catch (err) {
    next(err);
  }
});

router.get('/kyc-cleanup', async (req, res, next) => {
  try {
    logger.info('[Vercel Cron] Triggered KYC orphan cleanup...');
    await cleanOrphanOwnershipDocs();
    res.status(200).json({ status: 'success', message: 'KYC orphan cleanup completed successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/payment-expiry', async (req, res, next) => {
  try {
    logger.info('[Vercel Cron] Triggered payment expiry cleanup...');
    const result = await runPaymentExpiryJob();
    res.status(200).json({ status: 'success', message: `Marked ${result} payment(s) as expired` });
  } catch (err) {
    next(err);
  }
});

router.get('/saved-search', async (req, res, next) => {
  try {
    logger.info('[Vercel Cron] Triggered saved search check...');
    const result = await runSavedSearchJob(req.io);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/subscription-expiry', async (req, res, next) => {
  try {
    logger.info('[Vercel Cron] Triggered subscription expiry check...');
    await expireSubscriptions();
    res.status(200).json({ status: 'success', message: 'Subscription expiry check completed successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/subscription-reset', async (req, res, next) => {
  try {
    logger.info('[Vercel Cron] Triggered subscription usage reset...');
    await resetMonthlyUsage();
    res.status(200).json({ status: 'success', message: 'Subscription usage reset completed successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
