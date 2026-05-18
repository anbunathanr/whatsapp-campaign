'use strict';

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 30000;

/**
 * Determine whether a connection error is fatal (should not be retried).
 *
 * Fatal errors include:
 *  - Authentication failures ('Authentication failed', 'bad auth')
 *  - DNS resolution failures for non-localhost hosts ('ENOTFOUND')
 *  - Invalid connection URI scheme ('Invalid scheme')
 *
 * @param {Error} error
 * @returns {boolean}
 */
const isFatalConnectionError = (error) => {
  if (!error || !error.message) {return false;}

  const msg = error.message;

  if (msg.includes('Authentication failed') || msg.includes('bad auth')) {
    return true;
  }

  if (msg.includes('Invalid scheme')) {
    return true;
  }

  // DNS failure is only fatal when the host is not localhost/127.0.0.1
  if (msg.includes('ENOTFOUND')) {
    const uri = config.mongodb.uri || '';
    const isLocalhost = uri.includes('localhost') || uri.includes('127.0.0.1');
    if (!isLocalhost) {
      return true;
    }
  }

  return false;
};

/**
 * Ensure all model indexes are synced with MongoDB.
 * Called once after a successful connection.
 */
const ensureIndexes = async () => {
  // Require models here to avoid circular-dependency issues at module load time
  const models = [
    require('../models/User'),
    require('../models/Contact'),
    require('../models/Campaign'),
    require('../models/Message'),
    require('../models/MessageTemplate'),
    require('../models/Segment'),
    require('../models/WebhookEvent'),
    require('../models/Workflow'),
    require('../models/AuditLog'),
  ];

  await Promise.all(models.map((Model) => Model.syncIndexes()));
  logger.info('MongoDB indexes ensured for all models');
};

/**
 * Connect to MongoDB with exponential-backoff retry logic and connection pooling.
 * @param {number} retryCount - Current retry attempt (0-based).
 */
const connectDB = async (retryCount = 0) => {
  try {
    const options = {
      maxPoolSize: config.mongodb.poolSize,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      waitQueueTimeoutMS: 5000,
      family: 4, // Force IPv4
    };

    await mongoose.connect(config.mongodb.uri, options);
    logger.info('MongoDB connected successfully');

    // Sync indexes for all registered models
    await ensureIndexes();

    // ── Connection lifecycle events ──────────────────────────────────────────
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
  } catch (error) {
    logger.error(
      `MongoDB connection failed (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`
    );

    // Do not retry fatal errors (auth failures, bad URI, DNS failures for remote hosts)
    if (isFatalConnectionError(error)) {
      logger.error(`Fatal connection error detected. Not retrying: ${error.message}`);
      process.exit(1);
    }

    if (retryCount < MAX_RETRIES - 1) {
      // Exponential backoff with jitter
      const baseDelay = Math.min(RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
      const delay = baseDelay + Math.random() * 1000;
      logger.info(`Retrying in ${(delay / 1000).toFixed(2)} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return connectDB(retryCount + 1);
    }

    logger.error('Max MongoDB connection retries reached. Exiting.');
    process.exit(1);
  }
};

/**
 * Gracefully close the MongoDB connection.
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error.message);
  }
};

/**
 * Return a snapshot of the current connection state.
 * Useful for health-check endpoints.
 *
 * readyState values:
 *   0 = disconnected
 *   1 = connected
 *   2 = connecting
 *   3 = disconnecting
 *
 * @returns {{ isConnected: boolean, readyState: number, host: string|null, name: string|null }}
 */
const getConnectionStatus = () => {
  const { readyState, host, name } = mongoose.connection;
  return {
    isConnected: readyState === 1,
    readyState,
    host: host || null,
    name: name || null,
  };
};

module.exports = {
  connectDB,
  disconnectDB,
  ensureIndexes,
  getConnectionStatus,
  isFatalConnectionError,
};
