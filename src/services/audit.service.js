/**
 * audit.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized Audit Trail Service.
 *
 * Provides a simple `logAction()` helper used throughout the app to record
 * administrative events. Failures are swallowed (non-blocking) to prevent
 * audit logging from disrupting critical business operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AuditLog = require('../models/auditLog.model');
const logger   = require('../utils/logger');

/**
 * Record an administrative action in the audit trail.
 *
 * @param {string|ObjectId} actor       - The user performing the action
 * @param {string}          action      - Action constant (e.g. 'APPROVE_PROPERTY')
 * @param {string}          targetType  - Resource type ('Property', 'User', etc.)
 * @param {string|ObjectId} targetId    - ID of the affected resource
 * @param {Object}          [changes]   - { before: {}, after: {} } state snapshot
 * @param {Object}          [metadata]  - { ip, userAgent, reason, ... }
 * @returns {Promise<AuditLog|null>}
 */
const logAction = async (actor, action, targetType, targetId, changes = {}, metadata = {}) => {
  try {
    const entryData = {
      actor,
      action,
      targetType,
      targetId,
      changes,
      metadata,
    };

    let entry;
    if (metadata && metadata.session) {
      // Remove session from metadata before saving
      const { session, ...restMetadata } = metadata;
      entryData.metadata = restMetadata;
      
      // Mongoose create with session requires an array
      const created = await AuditLog.create([entryData], { session });
      entry = created[0];
    } else {
      entry = await AuditLog.create(entryData);
    }

    logger.info(`[AUDIT] ${action} | actor=${actor} | ${targetType}=${targetId}`);
    return entry;
  } catch (err) {
    logger.error(`[AUDIT] Failed to log action "${action}": ${err.message}`);
    // If part of a transaction, a failure here MUST abort the transaction
    if (metadata && metadata.session) {
      throw err;
    }
    return null;
  }
};

/**
 * Retrieve paginated, filtered audit logs.
 *
 * @param {Object} filters
 * @param {string}  [filters.action]     - Filter by action type
 * @param {string}  [filters.actor]      - Filter by actor ID
 * @param {string}  [filters.targetType] - Filter by resource type
 * @param {string}  [filters.targetId]   - Filter by resource ID
 * @param {string}  [filters.dateFrom]   - ISO date string (start)
 * @param {string}  [filters.dateTo]     - ISO date string (end)
 * @param {number}  [filters.page]       - Page number (default: 1)
 * @param {number}  [filters.limit]      - Results per page (default: 20)
 * @returns {Promise<{logs, total, page, pages}>}
 */
const getAuditLogs = async (filters = {}) => {
  const { action, actor, targetType, targetId, dateFrom, dateTo } = filters;
  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(100, parseInt(filters.limit) || 20);
  const skip  = (page - 1) * limit;

  const query = {};

  if (action)     query.action     = action;
  if (actor)      query.actor      = actor;
  if (targetType) query.targetType = targetType;
  if (targetId)   query.targetId   = targetId;

  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo)   query.createdAt.$lte = new Date(dateTo);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'name email role photo')
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return { logs, total, page, pages: Math.ceil(total / limit) };
};

module.exports = { logAction, getAuditLogs };
