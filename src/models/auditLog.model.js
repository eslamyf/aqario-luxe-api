/**
 * auditLog.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Immutable audit trail for all sensitive administrative actions.
 * Records WHO did WHAT to WHICH resource, WHEN, and HOW it changed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');
const { Schema, Types: { ObjectId } } = mongoose;

const AUDIT_ACTIONS = [
  // Property
  'APPROVE_PROPERTY',
  'REJECT_PROPERTY',
  // Booking
  'APPROVE_BOOKING',
  'REJECT_BOOKING',
  'BULK_UPDATE_BOOKINGS',
  // User management
  'BAN_USER',
  'UNBAN_USER',
  'CHANGE_ROLE',
  'UPDATE_PERMISSIONS',
  // KYC
  'APPROVE_KYC',
  'REJECT_KYC',
  'REVERT_KYC',
  'RESET_KYC',
  // Content moderation
  'DELETE_REVIEW',
  // Auctions
  'APPROVE_AUCTION',
];

const auditLogSchema = new Schema(
  {
    /**
     * The admin/user who performed the action.
     */
    actor: {
      type: ObjectId,
      ref: 'User',
      required: [true, 'Audit log must have an actor'],
      index: true,
    },

    /**
     * The action that was performed.
     */
    action: {
      type: String,
      required: [true, 'Audit log must have an action'],
      enum: {
        values: AUDIT_ACTIONS,
        message: 'Unknown audit action: {VALUE}',
      },
      index: true,
    },

    /**
     * The type of resource that was affected.
     */
    targetType: {
      type: String,
      required: [true, 'Audit log must have a target type'],
      enum: ['Property', 'Booking', 'User', 'Review', 'Auction'],
      index: true,
    },

    /**
     * The ID of the affected resource.
     */
    targetId: {
      type: ObjectId,
      required: [true, 'Audit log must have a target ID'],
    },

    /**
     * Before/after state snapshot for diff visualization.
     * Example: { before: { isApproved: false }, after: { isApproved: true } }
     */
    changes: {
      type: Schema.Types.Mixed,
      default: {},
    },

    /**
     * Contextual metadata: IP address, user-agent, rejection reason, etc.
     */
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Audit logs are immutable
    versionKey: false,
    // Prevent accidental mutation of audit logs
    strict: true,
  }
);

// ── Compound Indexes for common query patterns ────────────────────────────────
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 }); // For time-range queries

// ── Static helpers ────────────────────────────────────────────────────────────
auditLogSchema.statics.ACTIONS = AUDIT_ACTIONS;

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
