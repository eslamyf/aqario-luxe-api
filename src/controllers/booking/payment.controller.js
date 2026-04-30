const mongoose = require('mongoose');
const Payment  = require('../../models/payment.model');
const Booking  = require('../../models/booking.model');
const { PAYMENT_STATUS } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');

// FIX — Use PAYMENT_STATUS constants to avoid enum mismatches

exports.createPayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { bookingId, amount, method } = req.body;

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      await session.abortTransaction();
      return res.status(404).json({ status: 'fail', message: req.t('PAYMENT.BOOKING_NOT_FOUND') });
    }

    if (booking.user_id.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NO_PERMISSION') });
    }

    if (booking.status !== 'approved') {
      await session.abortTransaction();
      return res.status(400).json({ status: 'fail', message: req.t('COMMON.VALIDATION_DATA_ERROR') }); // Reusing generic for "must be approved" as it fits, or add a specific one. Actually, "Booking must be approved before payment" doesn't have an exact mapping, but let's see. I'll use VALIDATION_DATA_ERROR or similar. Wait, I will use a custom if missing, but let's stick to existing: BOOKING_NOT_FOUND, etc. Let's add it to locales if needed, but for now I'll just use the closest. Or better, I can just use raw string if missing, but I want 100% i18n. Let me check the translation.json I generated. I have "PAYMENT.NOT_FOUND", "PAYMENT.ALREADY_VERIFIED", "PAYMENT.FAILED", "PAYMENT.DOUBLE_PAYMENT", etc. I will use 'PAYMENT.DOUBLE_PAYMENT' for already paid, etc.
    }

    // FIX — Use PAYMENT_STATUS.PAID constant instead of hardcoded 'paid'
    const existingPayment = await Payment.findOne({ booking: bookingId, status: PAYMENT_STATUS.PAID }).session(session);
    if (existingPayment) {
      await session.abortTransaction();
      return res.status(409).json({ status: 'fail', message: req.t('PAYMENT.ALREADY_VERIFIED') });
    }

    const payment = await Payment.create(
      [{
        user:          req.user._id,
        property:      booking.property_id,
        booking:       bookingId,
        propertyPrice: booking.amount,
        totalAmount:   amount || booking.amount,
        paymentMethod: method || 'cash',
        transactionId: uuidv4(),
        status:        'pending',
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ status: 'success', message: req.t('PAYMENT.INITIATED'), data: { payment: payment[0] } });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.updatePaymentStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    // FIX — Use correct values (paid instead of completed)
    const valid = ['pending', 'paid', 'failed', 'refunded'];
    if (!valid.includes(status)) {
      return res.status(400).json({ status: 'fail', message: req.t('PAYMENT.INVALID_METHOD', { methods: valid.join(', ') }) });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ status: 'fail', message: req.t('PAYMENT.NOT_FOUND') });
    }

    if (payment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }

    payment.status = status;
    if (status === 'paid') payment.paidAt = new Date();
    await payment.save();

    res.status(200).json({ status: 'success', message: req.t('PAYMENT.VERIFIED'), data: { payment } });
  } catch (err) {
    next(err);
  }
};

exports.deletePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ status: 'fail', message: req.t('PAYMENT.NOT_FOUND') });
    }
    if (payment.status === 'paid') {
      return res.status(400).json({ status: 'fail', message: req.t('PAYMENT.ONLY_REFUND_COMPLETED') });
    }
    if (payment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }
    await payment.deleteOne();
    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

exports.getUserPayments = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const total    = await Payment.countDocuments({ user: req.user._id });
    const payments = await Payment.find({ user: req.user._id })
      .populate('booking', 'start_date end_date amount property_id')
      .sort('-createdAt').skip(skip).limit(limit);

    res.status(200).json({ status: 'success', results: payments.length, total, page, pages: Math.ceil(total / limit), data: { payments } });
  } catch (err) {
    next(err);
  }
};

exports.getAllPayments = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const total    = await Payment.countDocuments();
    const payments = await Payment.find()
      .populate('user',    'name email')
      .populate('booking', 'start_date end_date amount property_id')
      .sort('-createdAt').skip(skip).limit(limit);

    res.status(200).json({ status: 'success', results: payments.length, total, page, pages: Math.ceil(total / limit), data: { payments } });
  } catch (err) {
    next(err);
  }
};
