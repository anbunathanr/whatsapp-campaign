const logger = require('../utils/logger');
const { sendError } = require('../utils/apiResponse');
const { twilioErrorToHttpStatus } = require('../utils/twilioErrorMapper');

/**
 * Central error handling middleware.
 * Must be registered LAST in the Express middleware chain.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  // Log the error
  logger.error(`${err.name || 'Error'}: ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return sendError(res, 'Validation failed', 400, errors);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return sendError(res, `Duplicate value for ${field}`, 409);
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return sendError(res, `Invalid ${err.path}: ${err.value}`, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired', 401);
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 'File size exceeds the allowed limit', 413);
  }

  // TwilioServiceError — map error code to appropriate HTTP status
  if (err.name === 'TwilioServiceError') {
    const statusCode = twilioErrorToHttpStatus(err.code);
    return sendError(res, err.message, statusCode);
  }

  // Custom application errors with a statusCode
  if (err.statusCode) {
    return sendError(res, err.message, err.statusCode);
  }

  // Default: 500 Internal Server Error
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  return sendError(res, message, 500);
};

/**
 * 404 Not Found handler — register before errorHandler.
 */
const notFoundHandler = (req, res) => {
  return sendError(res, `Route ${req.originalUrl} not found`, 404);
};

module.exports = { errorHandler, notFoundHandler };
