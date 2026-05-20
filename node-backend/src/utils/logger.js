const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('../config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(winston.format.colorize(), logFormat),
});

// In production (AWS ECS / containerised environments), stdout is forwarded to
// CloudWatch Logs — file transports are unreliable on ephemeral container disks.
// Use file transports only in non-production environments.
const transports = [consoleTransport];

if (config.env !== 'production') {
  try {
    const logDir = path.resolve(config.logging.dir);
    fs.mkdirSync(logDir, { recursive: true });

    transports.push(
      new DailyRotateFile({
        filename: path.join(logDir, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat,
      }),
      new DailyRotateFile({
        filename: path.join(logDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: '20m',
        maxFiles: '30d',
        format: logFormat,
      })
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[logger] Could not create log directory "${config.logging.dir}": ${err.message}. File logging disabled.`);
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

module.exports = logger;
