const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Assigns a unique request ID to every request for traceability
const requestLogger = (req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader('X-Request-Id', req.requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn' : 'debug';

    logger[level]({
      requestId: req.requestId,
      method:    req.method,
      url:       req.originalUrl,
      status:    res.statusCode,
      duration:  `${duration}ms`,
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
      userId:    req.user?._id || 'guest',
    });
  });

  next();
};

module.exports = requestLogger;
