const Booking  = require('../../models/booking.model');
const Property = require('../../models/property.model');
const { sendBookingConfirmationEmail } = require('../../services/email.service');
const { createNotification } = require('../../utils/notificationHelper');
const logger = require('../../utils/logger');

// ─── Create Booking ──────────────────────────────────────────
exports.createBooking = async (req, res, next) => {
  try {
    const { propertyId, amount, start_date, end_date } = req.body;

    const parsedStart = new Date(start_date);
    const parsedEnd   = new Date(end_date);

    if (parsedStart >= parsedEnd) {
      return res.status(400).json({ status: 'fail', message: req.t('BOOKING.START_BEFORE_END') });
    }
    if (parsedStart < new Date()) {
      return res.status(400).json({ status: 'fail', message: req.t('BOOKING.START_NOT_PAST') });
    }

    // FIX #6 — Check property existence and status before creating booking
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ status: 'fail', message: req.t('PROPERTY.NOT_FOUND') });
    }
    if (property.status !== 'available') {
      return res.status(400).json({ status: 'fail', message: req.t('PROPERTY.NOT_AVAILABLE') });
    }
    if (property.listingType !== 'rent') {
      return res.status(400).json({ status: 'fail', message: req.t('PROPERTY.FOR_SALE_ONLY') });
    }

    // التحقق من عدم وجود تعارض في التواريخ
    const conflict = await Booking.findOne({
      property_id: propertyId,
      status:      { $in: ['pending', 'approved'] },
      start_date:  { $lt: parsedEnd },
      end_date:    { $gt: parsedStart },
    });
    if (conflict) {
      return res.status(409).json({ status: 'fail', message: req.t('BOOKING.DATE_CONFLICT') });
    }

    const booking = await Booking.create({
      user_id:     req.user._id,
      property_id: propertyId,
      amount,
      start_date:  parsedStart,
      end_date:    parsedEnd,
    });

    // Notify property owner
    await createNotification(req.io, property.owner, {
      type:    'booking',
      title:   req.t('NOTIFICATION.NEW_BOOKING', { name: req.user.name, property: property.title }),
      message: req.t('NOTIFICATION.NEW_BOOKING', { name: req.user.name, property: property.title }),
      link:    `/bookings/${booking._id}`,
    });

    res.status(201).json({ status: 'success', message: req.t('BOOKING.CREATED'), data: { booking } });
  } catch (err) {
    next(err);
  }
};

// ─── Get User Bookings ───────────────────────────────────────
exports.getUserBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user_id: req.user._id })
      .populate('property_id', 'title price location images')
      .sort({ start_date: 1 });
    res.status(200).json({ status: 'success', count: bookings.length, data: { bookings } });
  } catch (err) {
    next(err);
  }
};

// ─── Cancel Booking ──────────────────────────────────────────
exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!booking) {
      return res.status(404).json({ status: 'fail', message: req.t('BOOKING.NOT_FOUND') });
    }
    // FIX — استخدام status بدل applied
    if (booking.status === 'approved') {
      return res.status(400).json({ status: 'fail', message: req.t('BOOKING.CANNOT_CANCEL_APPROVED') });
    }
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      return res.status(400).json({ status: 'fail', message: req.t('BOOKING.ALREADY_PROCESSED') });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.status(200).json({ status: 'success', message: req.t('BOOKING.CANCELLED'), data: { booking } });
  } catch (err) {
    next(err);
  }
};

// ─── Get Owner Bookings ──────────────────────────────────────
exports.getOwnerBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // FIX — Use corrected booking service with pagination support
    const { getOwnerBookingsService } = require('../../services/booking.service');
    const result = await getOwnerBookingsService(req.user._id, skip, Number(limit));

    res.status(200).json({
      status: 'success',
      total:  result.total,
      page:   Number(page),
      pages:  result.pages,
      count:  result.bookings.length,
      data:   { bookings: result.bookings }
    });
  } catch (err) {
    next(err);
  }
};

// ─── Approve Booking ─────────────────────────────────────────
exports.approveBooking = async (req, res, next) => {
  try {
    const { approveBookingService } = require('../../services/booking.service');
    // FIX — Pass userId and role to service
    const booking = await approveBookingService(req.params.id, req.user._id, req.user.role);

    // Send email to user
    try {
      const populated = await booking.populate([
        { path: 'user_id',     select: 'email name' },
        { path: 'property_id', select: 'title' },
      ]);
      await sendBookingConfirmationEmail(populated.user_id.email, {
        propertyTitle: populated.property_id.title,
        startDate:     booking.start_date,
        endDate:       booking.end_date,
        amount:        booking.amount,
      });

      // إشعار المستخدم
      await createNotification(req.io, booking.user_id._id || booking.user_id, {
        type:    'booking',
        title:   req.t('NOTIFICATION.BOOKING_APPROVED'),
        message: req.t('NOTIFICATION.BOOKING_APPROVED_MSG', { property: populated.property_id.title }),
        link:    `/bookings/${booking._id}`,
      });
    } catch (e) {
      // Log notification error but don't fail the request
      console.error('Notification/Email Error:', e);
    }

    res.status(200).json({ status: 'success', message: req.t('BOOKING.APPROVED'), data: { booking } });
  } catch (err) {
    next(err);
  }
};

// ─── Reject Booking ──────────────────────────────────────────
exports.rejectBooking = async (req, res, next) => {
  try {
    const { rejectBookingService } = require('../../services/booking.service');
    const booking = await rejectBookingService(req.params.id, req.user._id, req.user.role);

    // إشعار المستخدم
    try {
      await createNotification(req.io, booking.user_id, {
        type:    'booking',
        title:   req.t('NOTIFICATION.BOOKING_REJECTED'),
        message: req.t('NOTIFICATION.BOOKING_REJECTED_MSG'),
        link:    '/properties',
      });
    } catch (e) {}

    res.status(200).json({ status: 'success', message: req.t('BOOKING.REJECTED'), data: { booking } });
  } catch (err) {
    next(err);
  }
};
// ─── Get Single Booking ──────────────────────────────────────
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).lean()
      .populate('property_id', 'title price location images owner')
      .populate('user_id',     'name email phone');

    if (!booking) {
      return res.status(404).json({ status: 'fail', message: req.t('BOOKING.NOT_FOUND') });
    }

    const isUser  = booking.user_id._id.toString() === req.user._id.toString();
    const isOwner = booking.property_id?.owner?.toString() === req.user._id.toString();
    if (!isUser && !isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }

    res.status(200).json({ status: 'success', data: { booking } });
  } catch (err) {
    next(err);
  }
};

// ─── Bulk Update Status ──────────────────────────────────────
exports.bulkUpdateStatus = async (req, res, next) => {
  try {
    const { bookingIds, status } = req.body;
    if (!bookingIds || !Array.isArray(bookingIds) || !status) {
      return res.status(400).json({ status: 'fail', message: 'Booking IDs array and status are required' });
    }

    const { bulkUpdateStatusService } = require('../../services/booking.service');
    const updated = await bulkUpdateStatusService(bookingIds, status, req.user._id);

    res.status(200).json({
      status: 'success',
      message: `Successfully updated ${updated.length} bookings to ${status}`,
      count: updated.length
    });
  } catch (err) {
    next(err);
  }
};

// ─── Export Bookings to CSV ──────────────────────────────────
exports.exportBookings = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const User = require('../../models/user.model');
      const Property = require('../../models/property.model');
      
      const [users, properties] = await Promise.all([
        User.find({ $or: [{ name: searchRegex }, { email: searchRegex }] }).select('_id'),
        Property.find({ title: searchRegex }).select('_id')
      ]);
      filter.$or = [
        { user_id: { $in: users.map(u => u._id) } },
        { property_id: { $in: properties.map(p => p._id) } }
      ];
    }

    const bookings = await Booking.find(filter)
      .populate('user_id', 'name email')
      .populate('property_id', 'title price')
      .sort('-created_at')
      .lean();

    let csv = 'Booking ID,Client,Email,Property,Amount,Status,Date\n';
    bookings.forEach(b => {
      csv += `${b._id},${b.user_id?.name || 'N/A'},${b.user_id?.email || 'N/A'},${b.property_id?.title || 'N/A'},${b.amount},${b.status},${b.created_at?.toISOString() || 'N/A'}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=bookings-export-${Date.now()}.csv`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
};
