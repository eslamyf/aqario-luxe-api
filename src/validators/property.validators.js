const { body } = require('express-validator');

// Helper: deferred translation at validation-time
const t = (key) => (value, { req }) => req.t(key);

// ─── Create Property ──────────────────────────────────────────
exports.createPropertySchema = [
  body('title.en').notEmpty().withMessage(t('VALIDATION.TITLE_REQUIRED'))
    .isLength({ min: 10, max: 100 }).withMessage(t('VALIDATION.TITLE_LENGTH')),
  body('title.ar').notEmpty().withMessage(t('VALIDATION.TITLE_REQUIRED'))
    .isLength({ min: 10, max: 100 }).withMessage(t('VALIDATION.TITLE_LENGTH')),
  body('description.en').notEmpty().withMessage(t('VALIDATION.DESCRIPTION_REQUIRED'))
    .isLength({ min: 20 }).withMessage(t('VALIDATION.DESCRIPTION_MIN')),
  body('description.ar').notEmpty().withMessage(t('VALIDATION.DESCRIPTION_REQUIRED'))
    .isLength({ min: 20 }).withMessage(t('VALIDATION.DESCRIPTION_MIN')),
  body('price').notEmpty().withMessage(t('VALIDATION.PRICE_REQUIRED'))
    .isFloat({ min: 0 }).withMessage(t('VALIDATION.PRICE_MIN')),
  // FIX #5 — currency is now a schema field
  body('currency').optional()
    .isIn(['USD', 'GBP', 'EUR', 'AED', 'SAR', 'EGP']).withMessage(t('VALIDATION.CURRENCY_INVALID')),
  body('type').notEmpty().withMessage(t('VALIDATION.TYPE_REQUIRED'))
    .isIn(['apartment','villa','house','studio','office','shop','land','commercial']).withMessage(t('VALIDATION.TYPE_INVALID')),
  body('listingType').notEmpty().withMessage(t('VALIDATION.LISTING_TYPE_REQUIRED'))
    .isIn(['sale','rent']).withMessage(t('VALIDATION.LISTING_TYPE_INVALID')),
  body('location.city.en').notEmpty().withMessage(t('VALIDATION.CITY_REQUIRED')),
  body('location.city.ar').notEmpty().withMessage(t('VALIDATION.CITY_REQUIRED')),
  body('location.district.en').notEmpty().withMessage(t('VALIDATION.DISTRICT_REQUIRED')),
  body('location.district.ar').notEmpty().withMessage(t('VALIDATION.DISTRICT_REQUIRED')),
  body('area').optional().isFloat({ min: 0 }).withMessage(t('VALIDATION.AREA_MIN')),
  body('bedrooms').optional().isInt({ min: 0 }).withMessage(t('VALIDATION.BEDROOMS_MIN')),
  body('bathrooms').optional().isInt({ min: 0 }).withMessage(t('VALIDATION.BATHROOMS_MIN')),
  // FIX #5 — features is now a schema field
  body('features').optional().isArray().withMessage(t('VALIDATION.FEATURES_ARRAY')),
  body('features.*').optional().isString().withMessage(t('VALIDATION.FEATURES_STRING')),
];

// ─── Update Property ──────────────────────────────────────────
exports.updatePropertySchema = [
  body('title.en').optional().isLength({ min: 10, max: 100 }).withMessage(t('VALIDATION.TITLE_LENGTH')),
  body('title.ar').optional().isLength({ min: 10, max: 100 }).withMessage(t('VALIDATION.TITLE_LENGTH')),
  body('description.en').optional().isLength({ min: 20 }).withMessage(t('VALIDATION.DESCRIPTION_MIN')),
  body('description.ar').optional().isLength({ min: 20 }).withMessage(t('VALIDATION.DESCRIPTION_MIN')),
  body('price').optional().isFloat({ min: 0 }).withMessage(t('VALIDATION.PRICE_MIN')),
  // FIX #5 — currency
  body('currency').optional()
    .isIn(['USD', 'GBP', 'EUR', 'AED', 'SAR', 'EGP']).withMessage(t('VALIDATION.CURRENCY_INVALID')),
  body('type').optional().isIn(['apartment','villa','house','studio','office','shop','land','commercial']).withMessage(t('VALIDATION.TYPE_INVALID')),
  body('listingType').optional().isIn(['sale','rent']).withMessage(t('VALIDATION.LISTING_TYPE_INVALID')),
  body('location.city.en').optional().notEmpty().withMessage(t('VALIDATION.CITY_EMPTY')),
  body('location.city.ar').optional().notEmpty().withMessage(t('VALIDATION.CITY_EMPTY')),
  body('location.district.en').optional().notEmpty().withMessage(t('VALIDATION.DISTRICT_EMPTY')),
  body('location.district.ar').optional().notEmpty().withMessage(t('VALIDATION.DISTRICT_EMPTY')),
  body('area').optional().isFloat({ min: 0 }).withMessage(t('VALIDATION.AREA_MIN')),
  body('bedrooms').optional().isInt({ min: 0 }).withMessage(t('VALIDATION.BEDROOMS_MIN')),
  body('bathrooms').optional().isInt({ min: 0 }).withMessage(t('VALIDATION.BATHROOMS_MIN')),
  // FIX #5 — features
  body('features').optional().isArray().withMessage(t('VALIDATION.FEATURES_ARRAY')),
  body('features.*').optional().isString().withMessage(t('VALIDATION.FEATURES_STRING')),
];
