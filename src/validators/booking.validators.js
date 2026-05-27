const { body } = require('express-validator');

const t = (key) => key;

exports.createBookingSchema = [
  body('propertyId').notEmpty().withMessage(t('VALIDATION.PROPERTY_ID_REQUIRED'))
    .isMongoId().withMessage(t('VALIDATION.PROPERTY_ID_INVALID')),
  body('start_date').notEmpty().withMessage(t('VALIDATION.START_DATE_REQUIRED'))
    .isISO8601().withMessage(t('VALIDATION.START_DATE_INVALID'))
    .custom((val, { req }) => {
      if (new Date(val) < new Date()) throw new Error('VALIDATION.START_DATE_PAST');
      return true;
    }),
  body('end_date').notEmpty().withMessage(t('VALIDATION.END_DATE_REQUIRED'))
    .isISO8601().withMessage(t('VALIDATION.END_DATE_INVALID'))
    .custom((end, { req }) => {
      if (new Date(end) <= new Date(req.body.start_date)) throw new Error('VALIDATION.END_DATE_AFTER_START');
      return true;
    }),
  body('amount').notEmpty().withMessage(t('VALIDATION.AMOUNT_REQUIRED'))
    .isFloat({ min: 0 }).withMessage(t('VALIDATION.AMOUNT_MIN')),
];
