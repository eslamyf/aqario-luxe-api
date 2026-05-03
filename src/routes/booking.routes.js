const express = require('express');
const router  = express.Router();
const bookingController = require('../controllers/booking/booking.controller');
const { protect }       = require('../middlewares/auth.middleware');
const { requireKYC }    = require('../middlewares/kyc.middleware');
const restrictTo        = require('../middlewares/restrictTo.middleware');
const validate          = require('../middlewares/validation.middleware');
const { createBookingSchema } = require('../validators/booking.validators');

router.use(protect);

/**
 * @swagger
 * /bookings:
 *   post:
 *     tags: [📅 Bookings]
 *     summary: Create a new booking
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [property_id, start_date, end_date]
 *             properties:
 *               property_id: { type: string, example: 64f1a2b3c4d5e6f7a8b9c0d1 }
 *               start_date:  { type: string, format: date, example: '2025-06-01' }
 *               end_date:    { type: string, format: date, example: '2025-06-30' }
 *               notes:       { type: string, example: 'Please clean before arrival' }
 *     responses:
 *       201:
 *         description: Booking created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:   { type: object, properties: { booking: { $ref: '#/components/schemas/Booking' } } }
 *       400:
 *         description: Property not available for the selected dates
 *       401: { $ref: '#/components/responses/401' }
 */
router.post('/', requireKYC, validate(createBookingSchema), bookingController.createBooking);

/**
 * @swagger
 * /bookings:
 *   get:
 *     tags: [📅 Bookings]
 *     summary: Get my bookings (as buyer)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, cancelled] }
 *     responses:
 *       200:
 *         description: List of my bookings
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/', bookingController.getUserBookings);

/**
 * @swagger
 * /bookings/owner:
 *   get:
 *     tags: [📅 Bookings]
 *     summary: Get bookings for my properties (as owner/agent)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, cancelled] }
 *     responses:
 *       200:
 *         description: Bookings on my properties
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/owner', bookingController.getOwnerBookings);

/**
 * @swagger
 * /bookings/{id}:
 *   get:
 *     tags: [📅 Bookings]
 *     summary: Get booking details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:   { type: object, properties: { booking: { $ref: '#/components/schemas/Booking' } } }
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.get('/:id', bookingController.getBooking);

/**
 * @swagger
 * /bookings/{id}/cancel:
 *   patch:
 *     tags: [📅 Bookings]
 *     summary: Cancel a booking
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking cancelled
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/cancel', bookingController.cancelBooking);

/**
 * @swagger
 * /bookings/{id}/approve:
 *   patch:
 *     tags: [📅 Bookings]
 *     summary: Approve a booking (owner/agent/admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking approved
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/approve', restrictTo('owner','agent','admin'), bookingController.approveBooking);

/**
 * @swagger
 * /bookings/{id}/reject:
 *   patch:
 *     tags: [📅 Bookings]
 *     summary: Reject a booking (owner/agent/admin only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking rejected
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id/reject', restrictTo('owner','agent','admin'), bookingController.rejectBooking);
router.patch('/admin/bulk-status', restrictTo('admin'), bookingController.bulkUpdateStatus);
router.get('/admin/export', restrictTo('admin'), bookingController.exportBookings);

module.exports = router;
