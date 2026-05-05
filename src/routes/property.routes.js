const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/property/property.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireKYC } = require('../middlewares/kyc.middleware');
const { requireActiveSubscription } = require('../middlewares/subscription.middleware');
const { isOwner } = require('../middlewares/isOwner.middleware');
const { uploadPropertyImages } = require('../middlewares/upload.middleware');
const validate = require('../middlewares/validation.middleware');
const { createPropertySchema, updatePropertySchema } = require('../validators/property.validators');
const { cacheMiddleware, clearCache } = require('../middlewares/cache.middleware');
const restrictTo = require('../middlewares/restrictTo.middleware');
const trackView = require('../middlewares/trackView.middleware');
const { uploadLimiter } = require('../middlewares/advancedRateLimit.middleware');

/**
 * @swagger
 * /properties/my:
 *   get:
 *     tags: [🏠 Properties]
 *     summary: Get my listed properties
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: My properties list
 *       401: { $ref: '#/components/responses/401' }
 */
router.get('/my', protect, propertyController.getMyProperties);

/**
 * @swagger
 * /properties:
 *   get:
 *     tags: [🏠 Properties]
 *     summary: Get all properties
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [apartment, villa, house, studio, office, shop, land, commercial] }
 *       - in: query
 *         name: listingType
 *         schema: { type: string, enum: [sale, rent] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: bedrooms
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of properties
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         properties:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Property' }
 */
router.get('/', cacheMiddleware(60), propertyController.getAllProperties);

/**
 * @swagger
 * /properties/{id}:
 *   get:
 *     tags: [🏠 Properties]
 *     summary: Get property details
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Property details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:   { type: object, properties: { property: { $ref: '#/components/schemas/Property' } } }
 *       404: { $ref: '#/components/responses/404' }
 */
router.get('/:id', cacheMiddleware(60), trackView, propertyController.getProperty);

/**
 * @swagger
 * /properties:
 *   post:
 *     tags: [🏠 Properties]
 *     summary: Create a new property listing
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, price, type, listingType, city]
 *             properties:
 *               title:       { type: string, example: شقة فاخرة في القاهرة الجديدة }
 *               description: { type: string }
 *               price:       { type: number, example: 1500000 }
 *               type:        { type: string, enum: [apartment, villa, house, studio, office, shop, land, commercial] }
 *               listingType: { type: string, enum: [sale, rent] }
 *               city:        { type: string, example: Cairo }
 *               district:    { type: string, example: New Cairo }
 *               area:        { type: number, example: 150 }
 *               bedrooms:    { type: integer, example: 3 }
 *               bathrooms:   { type: integer, example: 2 }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Property created
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.post('/',
  protect,
  requireKYC,
  restrictTo('owner', 'agent', 'admin'),
  requireActiveSubscription,
  uploadLimiter,
  uploadPropertyImages,
  validate(createPropertySchema),
  (req, res, next) => { clearCache('/api/v1/properties'); next(); },
  propertyController.createProperty
);

/**
 * @swagger
 * /properties/{id}:
 *   patch:
 *     tags: [🏠 Properties]
 *     summary: Update a property
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:       { type: string }
 *               description: { type: string }
 *               price:       { type: number }
 *               area:        { type: number }
 *               bedrooms:    { type: integer }
 *               bathrooms:   { type: integer }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Property updated
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.patch('/:id',
  protect, isOwner,
  uploadLimiter, uploadPropertyImages,
  validate(updatePropertySchema),
  (req, res, next) => { clearCache('/api/v1/properties'); next(); },
  propertyController.updateProperty
);

/**
 * @swagger
 * /properties/{id}/status:
 *   patch:
 *     tags: [🏠 Properties]
 *     summary: Toggle property status (available/reserved/sold)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [available, reserved, sold] }
 *     responses:
 *       200:
 *         description: Status updated
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 */
router.patch('/:id/status', protect, isOwner, propertyController.togglePropertyStatus);

/**
 * @swagger
 * /properties/{id}/images:
 *   delete:
 *     tags: [🏠 Properties]
 *     summary: Delete a property image
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl]
 *             properties:
 *               imageUrl: { type: string }
 *     responses:
 *       200:
 *         description: Image deleted
 *       401: { $ref: '#/components/responses/401' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.delete('/:id/images', protect, isOwner, propertyController.deletePropertyImage);

/**
 * @swagger
 * /properties/{id}:
 *   delete:
 *     tags: [🏠 Properties]
 *     summary: Delete a property
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Property deleted
 *       401: { $ref: '#/components/responses/401' }
 *       403: { $ref: '#/components/responses/403' }
 *       404: { $ref: '#/components/responses/404' }
 */
router.delete('/:id', protect, isOwner, (req, res, next) => { clearCache('/api/v1/properties'); next(); }, propertyController.deleteProperty);

module.exports = router;
