const { body } = require('express-validator');

const t = (key) => key;

exports.createReviewSchema = [
  body('propertyId').notEmpty().withMessage(t('VALIDATION.PROPERTY_ID_REQUIRED')).isMongoId().withMessage(t('VALIDATION.PROPERTY_ID_INVALID')),
  body('rating').notEmpty().withMessage(t('VALIDATION.RATING_REQUIRED')).isFloat({ min: 1, max: 5 }).withMessage(t('VALIDATION.RATING_RANGE')),
  body('comment').optional().isLength({ max: 500 }).withMessage(t('VALIDATION.COMMENT_MAX')),
];
exports.updateReviewSchema = [
  body('rating').optional().isFloat({ min: 1, max: 5 }).withMessage(t('VALIDATION.RATING_RANGE')),
  body('comment').optional().isLength({ max: 500 }).withMessage(t('VALIDATION.COMMENT_MAX')),
];
