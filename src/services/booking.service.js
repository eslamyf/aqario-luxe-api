const Booking  = require('../models/booking.model');
const Property = require('../models/property.model');
const AppError = require('../utils/AppError');

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
  const booking = await Booking.findById(bookingId).populate('property_id');
  if (!booking) throw new AppError('BOOKING.NOT_FOUND', 404);
  
  // CONCURRENCY CHECK: If status is not pending, someone else processed it
  if (booking.status !== 'pending') {
    throw new AppError(`BOOKING.ALREADY_PROCESSED_BY_OTHERS`, 409); // 409 Conflict
  }

  const isOwner = booking.property_id?.owner?.toString() === userId?.toString();
  if (role !== 'admin' && !isOwner) {
    throw new AppError('COMMON.NOT_AUTHORIZED', 403);
  }

  booking.status = 'approved';
  pushStatusHistory(booking, 'approved', userId, 'Administrative approval');
  await booking.save();
  return booking;
};

const rejectBookingService = async (bookingId, userId, role, reason = 'Administrative rejection') => {
  const booking = await Booking.findById(bookingId).populate('property_id');
  if (!booking) throw new AppError('BOOKING.NOT_FOUND', 404);
  
  // CONCURRENCY CHECK
  if (booking.status !== 'pending') {
    throw new AppError(`BOOKING.ALREADY_PROCESSED_BY_OTHERS`, 409);
  }

  const isOwner = booking.property_id?.owner?.toString() === userId?.toString();
  if (role !== 'admin' && !isOwner) {
    throw new AppError('COMMON.NOT_AUTHORIZED', 403);
  }

  booking.status = 'rejected';
  pushStatusHistory(booking, 'rejected', userId, reason);
  await booking.save();
  return booking;
};

const bulkUpdateStatusService = async (bookingIds, status, userId) => {
  // We iterate to ensure each booking gets its history entry (Mongoose way)
  // For massive scale, updateMany is faster but history logic is harder to push via aggregation
  const bookings = await Booking.find({ _id: { $in: bookingIds } });
  
  const updatedBookings = await Promise.all(bookings.map(async (booking) => {
    booking.status = status;
    pushStatusHistory(booking, status, userId, 'Bulk administrative action');
    return booking.save();
  }));

  return updatedBookings;
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
