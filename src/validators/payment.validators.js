const { body } = require('express-validator');

const t = (key) => key;

exports.createPaymentSchema = [
  body('bookingId')
    .notEmpty().withMessage(t('VALIDATION.BOOKING_ID_REQUIRED'))
    .isMongoId().withMessage(t('VALIDATION.BOOKING_ID_INVALID')),
  // FIX — Standardize values with model: remove 'online', add 'debit_card' and 'paypal'
  body('method')
    .notEmpty().withMessage(t('VALIDATION.PAYMENT_METHOD_REQUIRED'))
    .isIn(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'paypal'])
    .withMessage(t('VALIDATION.PAYMENT_METHOD_INVALID')),
];

exports.updatePaymentStatusSchema = [
  body('status')
    .notEmpty().withMessage(t('VALIDATION.PAYMENT_STATUS_REQUIRED'))
    // FIX — 'paid' instead of 'completed'
    .isIn(['pending', 'paid', 'failed', 'refunded'])
    .withMessage(t('VALIDATION.PAYMENT_STATUS_INVALID')),
];
