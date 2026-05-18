/**
 * Standardized API response helpers.
 * All controllers should use these to ensure consistent response shapes.
 */

/**
 * Send a successful response.
 * @param {object} res - Express response object
 * @param {*} data - Response payload
 * @param {string} message - Human-readable success message
 * @param {number} statusCode - HTTP status code (default 200)
 */
const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null && data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a created (201) response.
 */
const sendCreated = (res, data = null, message = 'Resource created successfully') => {
  return sendSuccess(res, data, message, 201);
};

/**
 * Send a paginated list response.
 */
const sendPaginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNextPage: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrevPage: pagination.page > 1,
    },
  });
};

/**
 * Send an error response.
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default 500)
 * @param {*} errors - Validation errors or additional details
 */
const sendError = (res, message = 'Internal server error', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

module.exports = { sendSuccess, sendCreated, sendPaginated, sendError };
