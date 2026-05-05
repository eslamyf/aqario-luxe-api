/**
 * ownershipGuard.middleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic Conflict-of-Interest Guard.
 *
 * Prevents ANY user (including admins) from executing administrative mutations
 * on a resource they own. This middleware resolves a critical trust gap where
 * admins could approve/reject their own listings, bookings, or KYC.
 *
 * Usage:
 *   ownershipGuard({ model: 'Property', ownerField: 'owner', idParam: 'id' })
 *   ownershipGuard({ model: 'Auction', ownerField: 'seller', idParam: 'id' })
 *
 * For KYC (self-check), pass isSelfCheck: true and idParam pointing to userId param.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');

const SUPPORTED_MODELS = {
  Property: () => require('../models/property.model'),
  Auction:  () => require('../models/auction.model'),
  Booking:  () => require('../models/booking.model'),
  User:     () => require('../models/user.model'),
};

/**
 * @param {Object} options
 * @param {string} options.model      - Model name key (must be in SUPPORTED_MODELS)
 * @param {string} options.ownerField - Field path on the document that holds the owner ObjectId
 * @param {string} options.idParam    - req.params key for the resource ID (default: 'id')
 * @param {boolean} [options.isSelfCheck] - If true, compares req.user._id against req.params[idParam] directly
 */
const ownershipGuard = ({ model, ownerField, idParam = 'id', isSelfCheck = false }) => {
  return async (req, res, next) => {
    try {
      const actorId = req.user?._id?.toString();

      if (!actorId) {
        return res.status(401).json({ status: 'fail', message: 'Authentication required.' });
      }

      // ── Self-check mode (used for KYC where the resource IS the user) ────────
      if (isSelfCheck) {
        const targetId = req.params[idParam]?.toString();
        if (actorId === targetId) {
          return res.status(403).json({
            status: 'fail',
            code: 'CONFLICT_OF_INTEREST',
            message: 'Conflict of interest: you cannot perform this action on your own account.',
          });
        }
        return next();
      }

      // ── Standard resource ownership check ────────────────────────────────────
      const ModelFactory = SUPPORTED_MODELS[model];
      if (!ModelFactory) {
        return res.status(500).json({ status: 'error', message: `ownershipGuard: unsupported model "${model}"` });
      }

      const Model = ModelFactory();
      const resourceId = req.params[idParam];

      if (!mongoose.Types.ObjectId.isValid(resourceId)) {
        return res.status(400).json({ status: 'fail', message: 'Invalid resource ID.' });
      }

      const resource = await Model.findById(resourceId).lean();
      if (!resource) {
        return res.status(404).json({ status: 'fail', message: `${model} not found.` });
      }

      // Resolve nested ownerField (e.g. 'property_id.owner')
      const ownerId = ownerField.split('.').reduce((obj, key) => obj?.[key], resource)?.toString();

      if (ownerId && ownerId === actorId) {
        return res.status(403).json({
          status: 'fail',
          code: 'CONFLICT_OF_INTEREST',
          message: `Conflict of interest: you cannot perform administrative actions on your own ${model.toLowerCase()}.`,
        });
      }

      // Attach resource to request so downstream handlers don't re-fetch
      req.guardedResource = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = ownershipGuard;
