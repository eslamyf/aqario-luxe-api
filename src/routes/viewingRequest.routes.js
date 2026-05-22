const express = require('express');
const router  = express.Router();
const viewingController = require('../controllers/viewingRequest/viewingRequest.controller');
const { protect }       = require('../middlewares/auth.middleware');
const validate          = require('../middlewares/validation.middleware');
const { createViewingRequestSchema, updateViewingStatusSchema } = require('../validators/validators');

router.use(protect);

/**
 * @swagger
 * /viewing-requests:
 *   post:
 *     tags: [👁️ ViewingRequests]
 *     summary: Request a property viewing appointment
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, preferredDate, preferredTime]
 *             properties:
 *               propertyId:    { type: string, example: 64f1a2b3c4d5e6f7a8b9c0d1 }
 *               preferredDate: { type: string, format: date, example: '2025-06-15' }
 *               preferredTime: { type: string, example: '10:00' }
 *               message:       { type: string, example: 'Prefer morning visits' }
 *     responses:
 *       201:
 *         description: Viewing request created
 *       401: { $ref: '#/components/responses/401' }
 *       409:
 *         description: Duplicate pending request exists
 */
router.post('/', validate(createViewingRequestSchema), viewingController.createViewingRequest);

/**
 * @swagger
 * /viewing-requests/my:
 *   get:
 *     tags: [👁️ ViewingRequests]
 *     summary: Get my viewing requests (as buyer)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: My viewing requests
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/my', viewingController.getMyViewingRequests);

/**
 * @swagger
 * /viewing-requests/owner:
 *   get:
 *     tags: [👁️ ViewingRequests]
 *     summary: Get viewing requests for my properties (as owner/agent)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Viewing requests on my properties
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/owner', viewingController.getOwnerViewingRequests);

/**
 * @swagger
 * /viewing-requests/check-status/{propertyId}:
 *   get:
 *     tags: [👁️ ViewingRequests]
 *     summary: Check if current user is eligible to book a property (has approved/completed viewing)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *         description: Property ID to check viewing eligibility for
 *     responses:
 *       200:
 *         description: Eligibility check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     eligible:      { type: boolean }
 *                     viewingStatus: { type: string, enum: [null, pending, approved, completed, rejected, cancelled] }
 *                     viewingId:     { type: string, nullable: true }
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/check-status/:propertyId', viewingController.checkViewingStatus);

/**
 * @swagger
 * /viewing-requests/{id}/status:
 *   patch:
 *     tags: [👁️ ViewingRequests]
 *     summary: Update viewing request status (owner/admin only)
 *     description: |
 *       Owner can transition: pending → approved | rejected | completed
 *       Admin can do the same.
 *       Setting status to 'approved' or 'completed' triggers booking eligibility
 *       notifications and email to the requester.
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [approved, rejected, completed] }
 *     responses:
 *       200:
 *         description: Status updated, notifications fired
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/status', validate(updateViewingStatusSchema), viewingController.updateStatus);

/**
 * @swagger
 * /viewing-requests/{id}/cancel:
 *   patch:
 *     tags: [👁️ ViewingRequests]
 *     summary: Cancel a viewing request (requester only, must be pending)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Viewing request cancelled
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/cancel', viewingController.cancelViewingRequest);

module.exports = router;
