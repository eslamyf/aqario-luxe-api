const Booking  = require('../models/booking.model');
const Property = require('../models/property.model');
const AppError = require('../utils/AppError');
const { logAction } = require('./audit.service');

// Helper to push to history
const pushStatusHistory = (booking, status, userId, reason = '') => {
  booking.statusHistory.push({
    status,
    changedBy: userId,
    changedAt: new Date(),
    reason
  });
  booking.lastActionBy = userId;
  booking.lastActionAt = new Date();
};

const approveBookingService = async (bookingId, userId, role) => {
  const mongoose = require('mongoose');
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const booking = await Booking.findById(bookingId).populate('property_id').session(session);
    if (!booking) {
      if (session) await session.abortTransaction();
      throw new AppError('BOOKING.NOT_FOUND', 404);
    }

    if (booking.status !== 'pending') {
      if (session) await session.abortTransaction();
      throw new AppError(`BOOKING.ALREADY_PROCESSED_BY_OTHERS`, 409);
    }

    const isOwner = booking.property_id?.owner?.toString() === userId?.toString();

    if (role !== 'admin' && !isOwner) {
      if (session) await session.abortTransaction();
      throw new AppError('COMMON.NOT_AUTHORIZED', 403);
    }

    // Conflict of Interest: admin cannot approve booking on their own property
    if (role === 'admin' && isOwner) {
      if (session) await session.abortTransaction();
      throw new AppError('CONFLICT_OF_INTEREST: Cannot approve a booking for a property you own.', 403);
    }

    const prevStatus = booking.status;
    booking.status = 'approved';
    pushStatusHistory(booking, 'approved', userId, 'Administrative approval');
    await booking.save({ session });

    await logAction(
      userId, 'APPROVE_BOOKING', 'Booking', booking._id,
      { before: { status: prevStatus }, after: { status: 'approved' } },
      { propertyId: booking.property_id?._id, session }
    );

    if (session) await session.commitTransaction();
    return booking;
  } catch (err) {
    if (session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
};

const rejectBookingService = async (bookingId, userId, role, reason = 'Administrative rejection') => {
  const mongoose = require('mongoose');
  const useTransaction = process.env.NODE_ENV === 'production';
  const session = useTransaction ? await mongoose.startSession() : null;
  if (session) session.startTransaction();

  try {
    const booking = await Booking.findById(bookingId).populate('property_id').session(session);
    if (!booking) {
      if (session) await session.abortTransaction();
      throw new AppError('BOOKING.NOT_FOUND', 404);
    }

    if (booking.status !== 'pending') {
      if (session) await session.abortTransaction();
      throw new AppError(`BOOKING.ALREADY_PROCESSED_BY_OTHERS`, 409);
    }

    const isOwner = booking.property_id?.owner?.toString() === userId?.toString();

    if (role !== 'admin' && !isOwner) {
      if (session) await session.abortTransaction();
      throw new AppError('COMMON.NOT_AUTHORIZED', 403);
    }

    // Conflict of Interest: admin cannot reject booking on their own property
    if (role === 'admin' && isOwner) {
      if (session) await session.abortTransaction();
      throw new AppError('CONFLICT_OF_INTEREST: Cannot reject a booking for a property you own.', 403);
    }

    const prevStatus = booking.status;
    booking.status = 'rejected';
    pushStatusHistory(booking, 'rejected', userId, reason);
    await booking.save({ session });

    await logAction(
      userId, 'REJECT_BOOKING', 'Booking', booking._id,
      { before: { status: prevStatus }, after: { status: 'rejected' } },
      { propertyId: booking.property_id?._id, reason, session }
    );

    if (session) await session.commitTransaction();
    return booking;
  } catch (err) {
    if (session) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
};

const bulkUpdateStatusService = async (bookingIds, status, userId) => {
  // We iterate to ensure each booking gets its history entry (Mongoose way)
  const bookings = await Booking.find({ _id: { $in: bookingIds } });
  
  // Use Promise.allSettled for safe bulk operation handling
  const results = await Promise.allSettled(bookings.map(async (booking) => {
    booking.status = status;
    pushStatusHistory(booking, status, userId, 'Bulk administrative action');
    return booking.save();
  }));

  const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value._id);
  const failed = results.filter(r => r.status === 'rejected').map(r => r.reason.message);

  return {
    success: true,
    total: bookings.length,
    processed: successful.length,
    failed: failed.length,
    successfulIds: successful,
    errors: failed
  };
};

const getOwnerBookingsService = async (ownerId, skip = 0, limit = 20) => {
  const properties = await Property.find({ owner: ownerId }).select('_id');
  const propertyIds = properties.map((p) => p._id);

  const [bookings, total] = await Promise.all([
    Booking.find({ property_id: { $in: propertyIds } })
      .populate('property_id', 'title price location images')
      .populate('user_id',     'name email phone')
      .sort('-created_at')
      .skip(skip)
      .limit(limit),
    Booking.countDocuments({ property_id: { $in: propertyIds } }),
  ]);

  return {
    bookings,
    total,
    skip,
    limit,
    pages: Math.ceil(total / limit),
  };
};

module.exports = { 
  approveBookingService, 
  rejectBookingService, 
  getOwnerBookingsService,
  bulkUpdateStatusService 
};
