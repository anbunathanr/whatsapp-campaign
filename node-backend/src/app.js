require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const { getConnectionStatus } = require('./config/database');
const { sanitizeMiddleware } = require('./utils/sanitizer');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// ─── Trust Proxy (AWS ALB / ELB) ─────────────────────────────────────────────
// Ensures Express reads the real client IP from X-Forwarded-For instead of
// the ALB's internal IP. Required for rate limiting to work correctly on AWS.
app.set('trust proxy', 1);

// ─── Production Env-Var Validation ───────────────────────────────────────────
// Crash early in production if any critical variable is missing.
if (config.env === 'production') {
  const REQUIRED_ENV_VARS = [
    'MONGODB_URI',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ALLOWED_ORIGINS',
  ];
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[FATAL] Missing required environment variables in production: ${missing.join(', ')}\n` +
        'Set them in your ECS task definition or Elastic Beanstalk configuration.'
    );
    process.exit(1);
  }
}

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }
      if (config.cors.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Request Parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Response Compression ────────────────────────────────────────────────────
app.use(compression());

// ─── HTTP Request Logging ────────────────────────────────────────────────────
if (config.env !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
}

// ─── Input Sanitization ──────────────────────────────────────────────────────
app.use(sanitizeMiddleware);

// ─── Static Files (uploaded media) ───────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', config.upload.dir)));

// ─── Health Check (no auth, no rate limit) ───────────────────────────────────
app.get('/api/health', (_req, res) => {
  const dbStatus = getConnectionStatus();
  const healthy = dbStatus.isConnected;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: config.env,
    services: {
      database: {
        status: healthy ? 'connected' : 'disconnected',
        readyState: dbStatus.readyState,
      },
    },
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api', apiLimiter, routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use(notFoundHandler);

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
