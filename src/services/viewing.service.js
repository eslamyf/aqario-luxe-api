const ViewingRequest = require('../models/viewingRequest.model');
const { createNotification } = require('../utils/notificationHelper');
const { sendViewingResponseEmail, sendViewingApprovedBookingEmail } = require('./email.service');
const logger = require('../utils/logger');

/**
 * Check if a user is eligible to book a property.
 * Eligibility requires an approved or completed viewing request.
 *
 * @param {string} userId
 * @param {string} propertyId
 * @returns {{ eligible: boolean, status: string|null, viewingId: string|null }}
 */
const checkViewingEligibility = async (userId, propertyId) => {
  const viewing = await ViewingRequest.findOne({
    requester: userId,
    property: propertyId,
    status: 'APPROVED_FOR_BOOKING',
  }).select('_id status').lean();

  if (!viewing) {
    // Check if there is any request to return its status for context
    const existing = await ViewingRequest.findOne({
      requester: userId,
      property: propertyId,
    }).sort({ updatedAt: -1 }).select('_id status').lean();

    if (existing) {
      return { eligible: false, status: existing.status, viewingId: existing._id.toString() };
    }

    return { eligible: false, status: null, viewingId: null };
  }

  return { eligible: true, status: viewing.status, viewingId: viewing._id.toString() };
};

/**
 * Update viewing request status with notification and email side effects.
 * Allowed transitions by actor:
 *   owner/admin  → approved | rejected | completed | APPROVED_FOR_BOOKING
 *   requester    → cancelled  (handled separately in cancelViewingRequest)
 *
 * @param {object} io - Socket.IO instance
 * @param {object} viewingRequest - Mongoose document (populated with requester, property)
 * @param {string} newStatus
 */
const applyStatusUpdate = async (io, viewingRequest, newStatus) => {
  viewingRequest.status = newStatus;
  await viewingRequest.save();

  const isApproved  = newStatus === 'approved';
  const isCompleted = newStatus === 'completed';
  const isRejected  = newStatus === 'rejected';
  const isApprovedForBooking = newStatus === 'APPROVED_FOR_BOOKING';

  // ── In-app notification to requester ───────────────────────────────────────
  let notifTitle, notifMsg;
  if (isApproved || isCompleted || isApprovedForBooking) {
    notifTitle = isApproved
      ? 'Viewing Request Approved'
      : isApprovedForBooking
      ? 'Approved for Booking — You Can Now Book'
      : 'Viewing Completed — You Can Now Book';
    notifMsg = `You can now reserve "${viewingRequest.property?.title}". Click to proceed to booking.`;
  } else if (isRejected) {
    notifTitle = 'Viewing Request Rejected';
    notifMsg   = `Your viewing request for "${viewingRequest.property?.title}" was not approved.`;
  }

  if (notifTitle) {
    await createNotification(io, viewingRequest.requester._id, {
      type:    'viewing',
      title:   notifTitle,
      message: notifMsg,
      link:    `/properties/${viewingRequest.property?._id}`,
    }).catch(() => {});
  }

  // ── Email to requester ──────────────────────────────────────────────────────
  if (viewingRequest.requester?.email) {
    if (isApproved || isCompleted || isApprovedForBooking) {
      await sendViewingApprovedBookingEmail(viewingRequest.requester.email, {
        propertyTitle: viewingRequest.property?.title,
        preferredDate: viewingRequest.preferredDate,
        preferredTime: viewingRequest.preferredTime,
        status: newStatus,
      }).catch((e) => logger.warn(`[ViewingService] Booking-eligible email error: ${e.message}`));
    } else {
      await sendViewingResponseEmail(viewingRequest.requester.email, {
        status:        newStatus,
        propertyTitle: viewingRequest.property?.title,
        preferredDate: viewingRequest.preferredDate,
        preferredTime: viewingRequest.preferredTime,
      }).catch((e) => logger.warn(`[ViewingService] Response email error: ${e.message}`));
    }
  }
};

module.exports = { checkViewingEligibility, applyStatusUpdate };
