'use strict';

/**
 * Extract and sanitize pagination parameters from query string
 * 
 * @param {Object} query - req.query object
 * @param {number} defaultLimit - default limit if not specified
 * @param {number} maxLimit - max limit allowed to prevent resource exhaustion
 * @returns {Object} { page, limit, skip }
 */
exports.getPaginationParams = (query = {}, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};
