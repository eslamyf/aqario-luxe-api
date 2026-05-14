const cron = require('node-cron');
const Booking = require('../models/booking.model');
const logger = require('../utils/logger');

// ─── Auto-complete Bookings ───────────────────────────────
// FIX #19 — Automatically convert completed bookings to 'completed' status
// So users can write reviews for properties they actually used

const initBookingJob = (io) => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();

      // Find all approved bookings where end_date has passed
      const bookings = await Booking.find({
        status: 'approved',
        end_date: { $lt: now },
      }).populate('property_id');

      if (bookings.length === 0) return;

      const { createNotification } = require('../utils/notificationHelper');

      for (const booking of bookings) {
        booking.status = 'completed';
        await booking.save();

        if (io) {
          // Notify user to leave a review
          await createNotification(io, booking.user_id, {
            type: 'review_reminder',
            title: 'How was your stay?',
            message: `Please leave a review for ${booking.property_id?.title || 'your recent stay'}.`,
            link: `/properties/${booking.property_id?._id}`
          });
        }
      }

      logger.info(`[BookingJob] Marked ${bookings.length} booking(s) as completed`);
    } catch (err) {
      logger.error(`[BookingJob] Error: ${err.message}`);
    }
  });

  logger.info('⏰ Booking scheduler started — auto-completing expired bookings');
};

module.exports = { initBookingJob };
