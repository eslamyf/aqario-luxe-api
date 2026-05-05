const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

// ── Public / User Endpoints ──────────────────────────────────────────────

// Anyone authenticated can see plans
router.get('/plans', protect, subscriptionController.getPlans);

// User endpoints (Owner / Agent / Admin)
router.use(protect);

router.get('/my', subscriptionController.getMySubscription);
router.get('/history', subscriptionController.getMySubscriptionHistory);

// Only owners and agents can subscribe/cancel
router.use(restrictTo('owner', 'agent'));

router.post('/subscribe', subscriptionController.subscribe);
router.post('/cancel', subscriptionController.cancelSubscription);

// ── Admin Endpoints ──────────────────────────────────────────────────────
router.use(restrictTo('admin'));

router.get('/admin/list', subscriptionController.adminListSubscriptions);
router.get('/admin/revenue', subscriptionController.adminSubscriptionRevenue);
router.patch('/admin/:id/activate', subscriptionController.adminActivateSubscription);

module.exports = router;
