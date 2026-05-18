/**
 * Central configuration object built from environment variables.
 * All env access should go through this module.
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp_campaign_platform',
    poolSize: parseInt(process.env.MONGODB_POOL_SIZE, 10) || 10,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change_this_secret_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change_this_refresh_secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
  },

  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'change_this_webhook_secret',
  },

  n8n: {
    baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
    apiKey: process.env.N8N_API_KEY,
  },

  mlService: {
    url: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  cors: {
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173'
    ).split(','),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs',
  },
};

module.exports = config;
