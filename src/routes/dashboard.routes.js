const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard/dashboard.controller');
const { protect } = require('../middlewares/auth.middleware');
const restrictTo = require('../middlewares/restrictTo.middleware');
const ownershipGuard = require('../middlewares/ownershipGuard.middleware');
const checkPermission = require('../middlewares/checkPermission.middleware');
const { idempotencyMiddleware } = require('../middlewares/idempotency.middleware');
const paginate = require('../middlewares/paginate');
const User = require('../models/user.model');
const Booking = require('../models/booking.model');
const Payment = require('../models/payment.model');
const Property = require('../models/property.model');
const Favorite = require('../models/favorite.model');

router.use(protect);

// ─── Admin ────────────────────────────────────────────────────

/**
 * @swagger
 * /dashboard/admin/stats:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get admin overview statistics
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Admin stats
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/admin/stats', restrictTo('admin'), dashboardController.adminStats);

/**
 * @swagger
 * /dashboard/admin/activity:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get global system activity feed (admin only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Activity feed stream
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/admin/activity', restrictTo('admin'), dashboardController.adminActivity);

/**
 * @swagger
 * /dashboard/admin/users:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get recently registered users (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Recent users list
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/admin/users', restrictTo('admin'), paginate(User), dashboardController.recentUsers);

/**
 * @swagger
 * /dashboard/admin/bookings:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get recent bookings (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Recent bookings
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/admin/bookings', restrictTo('admin'), paginate(Booking), dashboardController.recentBookings);

/**
 * @swagger
 * /dashboard/admin/payments:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get recent payments (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Recent payments
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/admin/payments', restrictTo('admin'), paginate(Payment), dashboardController.recentPayments);
router.get('/admin/properties', restrictTo('admin'), paginate(Property), dashboardController.recentProperties);

/**
 * @swagger
 * /dashboard/admin/users/{id}/role:
 *   patch:
 *     tags: [📊 Dashboard]
 *     summary: Change a user's role (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [buyer, owner, agent, admin] }
 *     responses:
 *       200:
 *         description: Role updated
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.patch('/admin/users/:id/role',
  restrictTo('admin'),
  checkPermission('change_role'),
  idempotencyMiddleware,
  dashboardController.changeUserRole
);

/**
 * @swagger
 * /dashboard/admin/users/{id}/ban:
 *   patch:
 *     tags: [📊 Dashboard]
 *     summary: Ban or unban a user (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User ban status toggled
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.patch('/admin/users/:id/ban',
  restrictTo('admin'),
  checkPermission('ban_user'),
  idempotencyMiddleware,
  dashboardController.toggleBanUser
);
router.patch('/admin/users/:id/toggle-ban',
  restrictTo('admin'),
  checkPermission('ban_user'),
  idempotencyMiddleware,
  dashboardController.toggleBanUser
);

// Granular permissions management (Phase 3.3)
router.patch('/admin/users/:id/permissions',
  restrictTo('admin'),
  checkPermission('update_permissions'),
  idempotencyMiddleware,
  dashboardController.updateUserPermissions
);

/**
 * @swagger
 * /dashboard/admin/properties/{id}/approve:
 *   patch:
 *     tags: [📊 Dashboard]
 *     summary: Approve a property listing (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Property approved
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.patch('/admin/properties/:id/approve',
  restrictTo('admin'),
  checkPermission('approve_property'),
  ownershipGuard({ model: 'Property', ownerField: 'owner', idParam: 'id' }),
  idempotencyMiddleware,
  dashboardController.approveProperty
);

/**
 * @swagger
 * /dashboard/admin/properties/{id}/reject:
 *   patch:
 *     tags: [📊 Dashboard]
 *     summary: Reject a property listing (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Property rejected
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.patch('/admin/properties/:id/reject',
  restrictTo('admin'),
  checkPermission('reject_property'),
  ownershipGuard({ model: 'Property', ownerField: 'owner', idParam: 'id' }),
  idempotencyMiddleware,
  dashboardController.rejectProperty
);

/**
 * @swagger
 * /dashboard/admin/auctions/{id}/approve:
 *   patch:
 *     tags: [📊 Dashboard]
 *     summary: Approve an auction (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Auction approved
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.patch('/admin/auctions/:id/approve',
  restrictTo('admin'),
  checkPermission('manage_auctions'),
  ownershipGuard({ model: 'Auction', ownerField: 'seller', idParam: 'id' }),
  idempotencyMiddleware,
  dashboardController.approveAuction
);

/**
 * @swagger
 * /dashboard/admin/reports/revenue:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get revenue report (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [week, month, quarter, year], default: month }
 *     responses:
 *       200:
 *         description: Revenue report data
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/admin/reports/revenue', restrictTo('admin'), dashboardController.revenueReport);

/**
 * @swagger
 * /dashboard/admin/reviews/{id}:
 *   delete:
 *     tags: [📊 Dashboard]
 *     summary: Delete any review (admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Review deleted
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.delete('/admin/reviews/:id',
  restrictTo('admin'),
  checkPermission('delete_review'),
  idempotencyMiddleware,
  dashboardController.deleteReview
);

// Audit Logs (Phase 3.2)
router.get('/admin/audit-logs',
  restrictTo('admin'),
  checkPermission('view_audit_logs'),
  dashboardController.getAuditLogs
);

// ─── Owner ────────────────────────────────────────────────────

/**
 * @swagger
 * /dashboard/owner/stats:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get owner/agent dashboard statistics
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Owner stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalProperties: { type: integer }
 *                     activeListings:  { type: integer }
 *                     pendingBookings: { type: integer }
 *                     totalRevenue:    { type: number }
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/owner/stats', restrictTo('owner', 'agent', 'admin'), dashboardController.ownerStats);

/**
 * @swagger
 * /dashboard/owner/properties:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get my properties with stats (owner/agent)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Owner properties list
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/owner/properties', restrictTo('owner', 'agent', 'admin'), paginate(Property), dashboardController.ownerProperties);

/**
 * @swagger
 * /dashboard/owner/bookings:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get bookings on my properties (owner/agent)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Owner bookings
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/owner/bookings', restrictTo('owner', 'agent', 'admin'), paginate(Booking), dashboardController.ownerBookings);

// ─── Buyer ────────────────────────────────────────────────────

/**
 * @swagger
 * /dashboard/me/stats:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get my personal dashboard statistics
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Personal stats
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/me/stats', dashboardController.buyerStats);

/**
 * @swagger
 * /dashboard/me/bookings:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get my personal bookings
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Personal bookings
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/me/bookings', paginate(Booking), dashboardController.buyerBookings);

/**
 * @swagger
 * /dashboard/me/payments:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get my personal payments
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Personal payments
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/me/payments', paginate(Payment), dashboardController.buyerPayments);

/**
 * @swagger
 * /dashboard/me/favorites:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get my personal favorites
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Personal favorites
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/me/favorites', paginate(Favorite), dashboardController.buyerFavorites);

// ─── Shared ───────────────────────────────────────────────────

/**
 * @swagger
 * /dashboard/activity:
 *   get:
 *     tags: [📊 Dashboard]
 *     summary: Get my recent activity feed
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Activity feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     activities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:      { type: string }
 *                           message:   { type: string }
 *                           createdAt: { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/activity', dashboardController.activityFeed);

module.exports = router;
