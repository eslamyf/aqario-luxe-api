const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Attach requestId for traceability
  const requestId = req.requestId || 'N/A';

  // Safely access req.t — fallback to raw message if i18n is not available
  const t = typeof req.t === 'function' ? req.t.bind(req) : (key) => key;

  // Log all errors
  logger.error(`[${requestId}] ${err.message} | ${req.method} ${req.originalUrl} | ${err.stack || ''}`);
  if (process.env.NODE_ENV !== 'production') console.error('Full error:', err);

  // Operational errors
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({ status: err.status || 'fail', message: err.message, requestId });
  }

  // Mongoose CastError
  if (err.name === 'CastError') {
    return res.status(400).json({ status: 'fail', message: 'ERRORS.CAST_ERROR', path: err.path, requestId });
  }

  // Mongo duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(400).json({ status: 'fail', message: 'ERRORS.DUPLICATE_KEY', field, requestId });
  }

  // Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ status: 'fail', message: 'COMMON.VALIDATION_FAILED', errors, requestId });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ status: 'fail', message: 'COMMON.INVALID_TOKEN', requestId });
  if (err.name === 'TokenExpiredError') return res.status(401).json({ status: 'fail', message: 'COMMON.TOKEN_EXPIRED', requestId });

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ status: 'fail', message: 'ERRORS.FILE_TOO_LARGE', requestId });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ status: 'fail', message: 'ERRORS.TOO_MANY_FILES', requestId });

  // Fallback for unhandled errors
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    status: 'error',
    message: isDev ? err.message : 'COMMON.INTERNAL_ERROR',
    requestId,
    ...(isDev && { stack: err.stack }),
  });
};