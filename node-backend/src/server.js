require('dotenv').config();

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/database');
const { getRedisClient, disconnectRedis } = require('./config/redis');
const { initScheduler } = require('./services/scheduler.service');

let server;

/**
 * Start the HTTP server and connect to all external services.
 */
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Redis connection (eager connect)
    getRedisClient();

    // Start HTTP server
    server = app.listen(config.port, () => {
      logger.info(`Server running in ${config.env} mode on port ${config.port}`);
    });

    // Initialize the scheduler
    initScheduler();

    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use`);
      } else {
        logger.error('Server error:', err);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * Gracefully shut down the server and close all connections.
 */
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      await disconnectDB();
      await disconnectRedis();

      logger.info('All connections closed. Exiting.');
      process.exit(0);
    });

    // Force exit after 30 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

startServer();
