const IdempotencyKey = require('../models/idempotency.model');
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Idempotency Middleware
 * Prevents double-clicks and retries from duplicating sensitive mutations.
 * Implements "Smart Rollout": If the header is missing, it logs a warning but proceeds.
 */
exports.idempotencyMiddleware = asyncHandler(async (req, res, next) => {
  const key = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

  if (!key) {
    // Smart Rollout: Warn but allow to proceed if missing (so we don't break existing frontends)
    logger.warn(`[IDEMPOTENCY] Missing Idempotency-Key header on ${req.method} ${req.originalUrl} for user ${req.user?._id || 'unknown'}`);
    return next();
  }

  // Check if key already exists for this user
  const existingRecord = await IdempotencyKey.findOne({ key, userId: req.user._id });
  
  if (existingRecord) {
    logger.warn(`[IDEMPOTENCY] Duplicate request blocked for key: ${key}`);
    
    if (existingRecord.responseStatus) {
      // Return cached response if it already finished processing
      return res.status(existingRecord.responseStatus).json(existingRecord.responseBody);
    } else {
      // Currently processing (race condition / double click)
      return res.status(409).json({
        status: 'fail',
        message: 'Request already being processed (Idempotency Conflict).',
      });
    }
  }

  // Create a pending record to lock the key
  const newRecord = await IdempotencyKey.create({
    key,
    requestPath: req.originalUrl,
    userId: req.user._id,
  });

  // Intercept the res.json to save the response body once the controller finishes
  const originalJson = res.json;
  
  res.json = function (body) {
    // Save response asynchronously so we don't block the request from returning
    IdempotencyKey.findByIdAndUpdate(newRecord._id, {
      responseBody: body,
      responseStatus: res.statusCode,
    }).catch(err => logger.error(`[IDEMPOTENCY] Failed to save response for key ${key}: ${err.message}`));

    // Call original json method
    return originalJson.call(this, body);
  };

  next();
});
