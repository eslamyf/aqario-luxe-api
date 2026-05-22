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
    status: { $in: ['approved', 'completed'] },
  }).select('_id status').lean();

  if (!viewing) {
    // Also check if there is a pending request so the caller can provide context
    const pending = await ViewingRequest.findOne({
      requester: userId,
      property: propertyId,
      status: 'pending',
    }).select('_id status').lean();

    if (pending) {
      return { eligible: false, status: 'pending', viewingId: pending._id.toString() };
    }

    return { eligible: false, status: null, viewingId: null };
  }

  return { eligible: true, status: viewing.status, viewingId: viewing._id.toString() };
};

/**
 * Update viewing request status with notification and email side effects.
 * Allowed transitions by actor:
 *   owner/admin  → approved | rejected | completed
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

  // ── In-app notification to requester ───────────────────────────────────────
  let notifTitle, notifMsg;
  if (isApproved || isCompleted) {
    notifTitle = isApproved
      ? 'Viewing Request Approved'
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
    if (isApproved || isCompleted) {
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
