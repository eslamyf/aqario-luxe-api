const express = require('express');
const router  = express.Router();
const inquiryController = require('../controllers/inquiry/inquiry.controller');
const { protect }       = require('../middlewares/auth.middleware');
const validate          = require('../middlewares/validation.middleware');
const { sendInquirySchema } = require('../validators/inquiry.validators');

router.use(protect);

/**
 * @swagger
 * /inquiries:
 *   post:
 *     tags: [💬 Inquiries]
 *     summary: Send an inquiry about a property
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [property_id, message]
 *             properties:
 *               property_id: { type: string, example: 64f1a2b3c4d5e6f7a8b9c0d1 }
 *               message:     { type: string, example: 'Is the apartment available for rent from June?' }
 *     responses:
 *       201:
 *         description: Inquiry sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     inquiry:
 *                       type: object
 *                       properties:
 *                         _id:         { type: string }
 *                         property_id: { type: string }
 *                         sender_id:   { type: string }
 *                         message:     { type: string }
 *                         isRead:      { type: boolean }
 *                         createdAt:   { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/401' }
 */
router.post('/', validate(sendInquirySchema), inquiryController.sendInquiry);

/**
 * @swagger
 * /inquiries/inbox:
 *   get:
 *     tags: [💬 Inquiries]
 *     summary: Get my received inquiries (inbox)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Inbox inquiries
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/inbox', inquiryController.getMyInbox);

/**
 * @swagger
 * /inquiries/sent:
 *   get:
 *     tags: [💬 Inquiries]
 *     summary: Get my sent inquiries
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Sent inquiries
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/sent', inquiryController.getMySentInquiries);
router.get('/owner', inquiryController.getOwnerInquiries);

/**
 * @swagger
 * /inquiries/property/{propertyId}:
 *   get:
 *     tags: [💬 Inquiries]
 *     summary: Get all inquiries for a specific property
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: propertyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Inquiries for the property
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.get('/property/:propertyId', inquiryController.getInquiriesByProperty);

/**
 * @swagger
 * /inquiries/{id}/read:
 *   patch:
 *     tags: [💬 Inquiries]
 *     summary: Mark an inquiry as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Inquiry marked as read
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/read', inquiryController.markAsRead);

/**
 * @swagger
 * /inquiries/{id}/reply:
 *   post:
 *     tags: [💬 Inquiries]
 *     summary: Reply to an inquiry
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
 *             required: [message]
 *             properties:
 *               message: { type: string, example: 'Yes, the apartment is available from June' }
 *     responses:
 *       201:
 *         description: Reply sent
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.post('/:id/reply', inquiryController.replyToInquiry);

/**
 * @swagger
 * /inquiries/{id}:
 *   delete:
 *     tags: [💬 Inquiries]
 *     summary: Delete an inquiry
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Inquiry deleted
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.delete('/:id', inquiryController.deleteInquiry);

module.exports = router;
