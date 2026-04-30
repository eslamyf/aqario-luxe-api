const rateLimit = require('express-rate-limit');

const createLimiter = (options) => rateLimit({
  skip: (req, res) => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res) => {
    res.status(429).json({
      status:  'fail',
      message: options.message || 'Too many requests, please try again later',
      retryAfter: Math.ceil(options.windowMs / 1000 / 60) + ' minutes',
    });
  },
  ...options,
});

module.exports = {
  globalLimiter: createLimiter({ windowMs: 1 * 60 * 1000, max: 1000 }),
  authLimiter:   createLimiter({ windowMs: 1 * 60 * 1000, max: 1000, message: 'Too many attempts' }),
  uploadLimiter: createLimiter({ windowMs: 60 * 60 * 1000, max: 30, message: 'You have exceeded the file upload limit per hour' }),
  bidLimiter:    createLimiter({ windowMs:      60 * 1000, max: 10, message: 'You cannot submit more than 10 bids per minute' }),
  searchLimiter: createLimiter({ windowMs:      60 * 1000, max: 60 }),
};
