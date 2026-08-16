const { body } = require('express-validator');

const t = (key) => key;

exports.sendInquirySchema = [
  body('propertyId').optional({ nullable: true }).isMongoId().withMessage(t('VALIDATION.PROPERTY_ID_INVALID')),
  body('message').optional({ nullable: true }).isLength({ min: 1, max: 1000 }).withMessage(t('VALIDATION.MESSAGE_LENGTH')),
];
