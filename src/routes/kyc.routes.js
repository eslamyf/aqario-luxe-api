const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kyc/kyc.controller');
const { protect } = require('../middlewares/auth.middleware');
const restrictTo = require('../middlewares/restrictTo.middleware');
const validate = require('../middlewares/validation.middleware');
const { uploadKYCImage } = require('../middlewares/upload.middleware');

// Apply authentication to all routes
router.use(protect);

/**
 * @swagger
 * /kyc:
 *   post:
 *     tags: [🆔 KYC]
 *     summary: Upload KYC documents
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documentType, frontImage]
 *             properties:
 *               documentType: { type: string, enum: [national_id, passport, drivers_license] }
 *               frontImage:   { type: string, description: "Cloudinary URL of front image" }
 *               backImage:    { type: string, description: "Cloudinary URL of back image (optional)" }
 *     responses:
 *       200:
 *         description: Documents submitted successfully
 *       400:
 *         description: Invalid document type or missing images
 *       401:
 *         description: Unauthorized
 */
router.post('/', kycController.uploadKYCDocuments);

/**
 * @swagger
 * /kyc/upload:
 *   post:
 *     tags: [🆔 KYC]
 *     summary: Upload a single KYC image to Cloudinary
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: Invalid image file
 */
router.post('/upload', uploadKYCImage, kycController.uploadKYCImageSingle);

/**
 * @swagger
 * /kyc/status:
 *   get:
 *     tags: [🆔 KYC]
 *     summary: Get KYC verification status
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current KYC status
 *       401:
 *         description: Unauthorized
 */
router.get('/status', kycController.getKYCStatus);

/**
 * @swagger
 * /kyc/me:
 *   get:
 *     tags: [🆔 KYC]
 *     summary: Get detailed KYC information
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Detailed KYC information
 *       401:
 *         description: Unauthorized
 */
router.get('/me', kycController.getMyKYC);

// ─── ADMIN ROUTES ──────────────────────────────────────────
router.use(restrictTo('admin'));

/**
 * @swagger
 * /admin/kyc/pending:
 *   get:
 *     tags: [🆔 KYC - Admin]
 *     summary: Get pending KYC submissions
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
 *         description: List of pending KYC submissions
 *       403:
 *         description: Admin access required
 */
router.get('/pending', kycController.getPendingKYC);

/**
 * @swagger
 * /admin/kyc/summary:
 *   get:
 *     tags: [🆔 KYC - Admin]
 *     summary: Get KYC statistics
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: KYC statistics and completion rate
 *       403:
 *         description: Admin access required
 */
router.get('/summary', kycController.getKYCSummary);

/**
 * @swagger
 * /admin/kyc/{userId}/approve:
 *   patch:
 *     tags: [🆔 KYC - Admin]
 *     summary: Approve KYC submission
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KYC approved
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.patch('/:userId/approve', kycController.approveKYC);

/**
 * @swagger
 * /admin/kyc/{userId}/reject:
 *   patch:
 *     tags: [🆔 KYC - Admin]
 *     summary: Reject KYC submission
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, maxLength: 500 }
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KYC rejected
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.patch('/:userId/reject', kycController.rejectKYC);

/**
 * @swagger
 * /admin/kyc/{userId}/reset:
 *   patch:
 *     tags: [🆔 KYC - Admin]
 *     summary: Reset KYC status for resubmission
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KYC reset successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.patch('/:userId/reset', kycController.resetKYC);

module.exports = router;
