const { body } = require('express-validator');

const t = (key) => key;

exports.sendInquirySchema = [
  body('propertyId').notEmpty().withMessage(t('VALIDATION.PROPERTY_ID_REQUIRED')).isMongoId().withMessage(t('VALIDATION.PROPERTY_ID_INVALID')),
  body('message').notEmpty().withMessage(t('VALIDATION.MESSAGE_REQUIRED')).isLength({ min: 5, max: 1000 }).withMessage(t('VALIDATION.MESSAGE_LENGTH')),
];
