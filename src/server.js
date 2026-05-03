require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http        = require('http');
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const cookieParser = require('cookie-parser');
const path        = require('path');
const mongoose    = require('mongoose');
const compression = require('compression');

// ── Security middlewares ───────────────────────────────────
let mongoSanitize, hpp;
try { mongoSanitize = require('./utils/mongoSanitize'); } catch { try { mongoSanitize = require('express-mongo-sanitize'); } catch {} }
try { hpp = require('hpp'); } catch {}

// Custom XSS sanitizer compatible with Express v5
const xssClean = (() => {
  const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  };
  const sanitize = (val) => {
    if (typeof val === 'string') return escapeHtml(val);
    if (Array.isArray(val)) return val.map(sanitize);
    if (val && typeof val === 'object') {
      const out = {};
      for (const k of Object.keys(val)) out[k] = sanitize(val[k]);
      return out;
    }
    return val;
  };
  return () => (req, _res, next) => {
    if (req.body) req.body = sanitize(req.body);
    if (req.params) req.params = sanitize(req.params);
    if (req.query) {
      for (const k of Object.keys(req.query)) {
        try { req.query[k] = sanitize(req.query[k]); } catch (_) {}
      }
    }
    next();
  };
})();

// ── Core utils ─────────────────────────────────────────────
const logger        = require('./utils/logger');
const connectDB     = require('./config/db');
const initSocket    = require('./config/socket');
const { connectRedis } = require('./config/redis');
const { setupSwagger } = require('./docs/swagger');
const errorMiddleware = require('./middlewares/error.middleware');
const requestLogger   = require('./middlewares/requestLogger.middleware');
const { globalLimiter, authLimiter } = require('./middlewares/advancedRateLimit.middleware');
const { i18next, i18nMiddleware } = require('./config/i18n');

// ── Jobs ────────────────────────────────────────────────────
const { initAuctionJob }     = require('./jobs/auction.job');
const { initSavedSearchJob } = require('./jobs/savedSearch.job');
const { initBookingJob }     = require('./jobs/booking.job');
const initPaymentExpiryJob   = require('./jobs/payment-expiry.job');
const { initKycCleanupJob }  = require('./jobs/kyc-cleanup.job');
// ── Routes ──────────────────────────────────────────────────
const authRoutes           = require('./routes/auth.routes');
const userRoutes           = require('./routes/user.routes');
const propertyRoutes       = require('./routes/property.routes');
const reviewRoutes         = require('./routes/review.routes');
const favoriteRoutes       = require('./routes/favorite.routes');
const bookingRoutes        = require('./routes/booking.routes');
const paymentRoutes        = require('./routes/payment.routes');
const inquiryRoutes        = require('./routes/inquiry.routes');
const viewingRequestRoutes = require('./routes/viewingRequest.routes');
const dashboardRoutes      = require('./routes/dashboard.routes');
const auctionRoutes        = require('./routes/auction.routes');
const bidRoutes            = require('./routes/bid.routes');
const notificationRoutes   = require('./routes/notification.routes');
const searchRoutes         = require('./routes/search.routes');
const reportRoutes         = require('./routes/report.routes');
const healthRoutes         = require('./routes/health.routes');
const kycRoutes            = require('./routes/kyc.routes');
const CLIENT_URL = process.env.CLIENT_URL;

if (!CLIENT_URL) {
  throw new Error('CLIENT_URL is required in .env');
}

// ── App Setup ──────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = initSocket(server);

// ── CORS FIRST — Before all other middleware ──────────────────
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
}));

// ── Middlewares ────────────────────────────────────────────
app.use(requestLogger);
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'blob:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", CLIENT_URL],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (mongoSanitize) app.use(mongoSanitize());
if (xssClean) app.use(xssClean());
if (hpp) app.use(hpp({ whitelist: ['price','bedrooms','bathrooms','area'] }));

// i18n — language detection via Accept-Language header
app.use(i18nMiddleware.handle(i18next));

// Rate limiting (disabled in tests to allow fast test execution without lockouts)
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', globalLimiter);
  // app.use('/api/v1/auth', authLimiter); // Temporarily disabled for Google login testing
}

// Cookie parsing (must be before routes that use cookies)
app.use(cookieParser());

// Attach io to requests
app.use((req, _res, next) => { req.io = io; next(); });

// Static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Swagger docs
if (process.env.NODE_ENV !== 'production') setupSwagger(app);

// ── API Routes ─────────────────────────────────────────────
const API = '/api/v1';
app.use('/api/health', healthRoutes);
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/kyc`, kycRoutes);
app.use(`${API}/properties`, propertyRoutes);
app.use(`${API}/search`, searchRoutes);
app.use(`${API}/reviews`, reviewRoutes);
app.use(`${API}/favorites`, favoriteRoutes);
app.use(`${API}/bookings`, bookingRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/inquiries`, inquiryRoutes);
app.use(`${API}/viewing-requests`, viewingRequestRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
app.use(`${API}/auctions`, auctionRoutes);
app.use(`${API}/bids`, bidRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/reports`, reportRoutes);

// Root
app.get('/', (req, res) => res.json({
  status: 'success',
  message: ' Real Estate Pro API',
  version: '4.0.0',
  docs: `${req.protocol}://${req.get('host')}/api/docs`,
  health: `${req.protocol}://${req.get('host')}/api/health`,
}));

// 404
app.use((req, res) => {
  res.status(404).json({
    status: 'fail',
    message: req.t('COMMON.PATH_NOT_FOUND', { path: req.originalUrl }),
  });
});
// Global Error Handler
app.use(errorMiddleware);

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} — graceful shutdown...`);
  server.close(async () => {
    await mongoose.connection.close(false);
    logger.info('MongoDB connection closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};
['SIGTERM','SIGINT', 'SIGUSR2'].forEach(sig => process.on(sig, () => shutdown(sig)));
process.on('unhandledRejection', (err) => { logger.error('Unhandled Rejection:', err.message); logger.error(err.stack); shutdown('unhandledRejection'); });
process.on('uncaughtException', (err) => { logger.error('Uncaught Exception:', err.message); logger.error(err.stack); shutdown('uncaughtException'); });

// Start Server
const PORT = process.env.PORT || 3000;
const startServer = async () => {
  await connectDB();
  await connectRedis();
  server.listen(PORT, () => {
    logger.info(` Server running on port ${PORT}`);
    logger.info(` API: http://localhost:${PORT}${API}`);
    logger.info(` Docs: http://localhost:${PORT}/api/docs`);
    logger.info(`  Health: http://localhost:${PORT}/api/health`);
    initAuctionJob(io);
    initSavedSearchJob(io);
    initBookingJob();
    initPaymentExpiryJob();  // ← Payment expiry cleanup job
    initKycCleanupJob();     // ← KYC orphan doc cleanup (daily 03:00 AM)
  });
};
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    logger.error('Startup failed:', err.message);
    logger.error(err.stack);
    process.exit(1);
  });
}

module.exports = { app, io, startServer };
