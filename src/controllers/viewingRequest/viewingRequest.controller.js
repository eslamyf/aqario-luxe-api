const ViewingRequest = require('../../models/viewingRequest.model');
const Property       = require('../../models/property.model');
const { createNotification } = require('../../utils/notificationHelper');
const { checkViewingEligibility, applyStatusUpdate } = require('../../services/viewing.service');
const logger = require('../../utils/logger');

// ─── Create Viewing Request ───────────────────────────────────
exports.createViewingRequest = async (req, res, next) => {
  try {
    const { propertyId, preferredDate, preferredTime, message } = req.body;

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ status: 'fail', message: req.t('PROPERTY.NOT_FOUND') });
    if (property.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ status: 'fail', message: req.t('VIEWING.OWN_PROPERTY') });
    }

    // Prevent duplication: pending request already exists
    const existing = await ViewingRequest.findOne({
      property:  propertyId,
      requester: req.user._id,
      status:    'pending',
    });
    if (existing) {
      return res.status(409).json({ status: 'fail', message: req.t('VIEWING.DUPLICATE') });
    }

    const viewingRequest = await ViewingRequest.create({
      property: propertyId, requester: req.user._id, owner: property.owner,
      preferredDate, preferredTime, message,
    });

    await viewingRequest.populate([
      { path: 'property',  select: 'title location images' },
      { path: 'owner',     select: 'name email phone' },
    ]);

    // Notify property owner
    await createNotification(req.io, property.owner, {
      type:    'viewing',
      title:   req.t('NOTIFICATION.NEW_VIEWING'),
      message: req.t('NOTIFICATION.NEW_VIEWING_MSG', { name: req.user.name, property: property.title }),
      link:    `/properties/${property._id}`,
    }).catch(() => {});

    res.status(201).json({ status: 'success', message: req.t('VIEWING.SENT'), data: { viewingRequest } });
  } catch (err) {
    next(err);
  }
};

// ─── Get My Viewing Requests (as buyer) ──────────────────────
exports.getMyViewingRequests = async (req, res, next) => {
  try {
    const requests = await ViewingRequest.find({ requester: req.user._id })
      .populate('property', 'title location images price').populate('owner', 'name email phone').sort('-createdAt');
    res.status(200).json({ status: 'success', results: requests.length, data: { requests } });
  } catch (err) {
    next(err);
  }
};

// ─── Get Owner Viewing Requests ───────────────────────────────
exports.getOwnerViewingRequests = async (req, res, next) => {
  try {
    const requests = await ViewingRequest.find({ owner: req.user._id })
      .populate('property', 'title location images price').populate('requester', 'name email phone').sort('-createdAt');
    res.status(200).json({ status: 'success', results: requests.length, data: { requests } });
  } catch (err) {
    next(err);
  }
};

// ─── Check Viewing Status for Property (booking eligibility) ─
exports.checkViewingStatus = async (req, res, next) => {
  try {
    const { propertyId } = req.params;
    const result = await checkViewingEligibility(req.user._id, propertyId);

    res.status(200).json({
      status: 'success',
      data: {
        eligible:  result.eligible,
        viewingStatus: result.status,      // null | 'pending' | 'approved' | 'completed'
        viewingId: result.viewingId,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Update Viewing Request Status ───────────────────────────
// Allowed: owner/admin → approved | rejected | completed
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ status: 'fail', message: req.t('VIEWING.STATUS_INVALID') });
    }

    const viewingRequest = await ViewingRequest.findById(req.params.id)
      .populate('requester', 'email name').populate('property', 'title _id');
    if (!viewingRequest) return res.status(404).json({ status: 'fail', message: req.t('VIEWING.NOT_FOUND') });

    // Authorization: only the owner of the property or an admin can update
    const isOwner = viewingRequest.owner.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }

    // Apply update + fire notifications/emails via viewing service
    await applyStatusUpdate(req.io, viewingRequest, status);

    let successMessage;
    if (status === 'approved')  successMessage = req.t('VIEWING.APPROVED');
    else if (status === 'completed') successMessage = 'Viewing marked as completed. Client can now book.';
    else successMessage = req.t('VIEWING.REJECTED');

    res.status(200).json({
      status: 'success',
      message: successMessage,
      data: { viewingRequest },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Cancel Viewing Request (requester only) ──────────────────
exports.cancelViewingRequest = async (req, res, next) => {
  try {
    const viewingRequest = await ViewingRequest.findById(req.params.id);
    if (!viewingRequest) return res.status(404).json({ status: 'fail', message: req.t('VIEWING.NOT_FOUND') });
    if (viewingRequest.requester.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'fail', message: req.t('COMMON.NOT_AUTHORIZED') });
    }
    if (viewingRequest.status !== 'pending') {
      return res.status(400).json({ status: 'fail', message: req.t('VIEWING.CANNOT_CANCEL_PROCESSED') });
    }
    viewingRequest.status = 'cancelled';
    await viewingRequest.save();
    res.status(200).json({ status: 'success', message: req.t('VIEWING.CANCELLED'), data: { viewingRequest } });
  } catch (err) {
    next(err);
  }
};
