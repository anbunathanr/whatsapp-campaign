const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Create and return a Redis client instance (singleton).
 */
const getRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  const redisOptions = {
    retryStrategy: (times) => {
      const delay = Math.min(times * 500, 5000);
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };

  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, redisOptions);
  } else {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ...redisOptions,
    });
  }

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', err.message);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis client reconnecting...');
  });

  return redisClient;
};

/**
 * Gracefully close the Redis connection.
 */
const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

module.exports = { getRedisClient, disconnectRedis };
