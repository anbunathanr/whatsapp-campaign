const xss = require('xss');

/**
 * Input sanitization utilities.
 * Strips XSS patterns and normalizes user-supplied strings.
 */

/**
 * Sanitize a string value against XSS.
 * @param {string} value
 * @returns {string}
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return xss(value.trim());
};

/**
 * Recursively sanitize all string values in an object.
 * @param {object} obj
 * @returns {object}
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Express middleware that sanitizes req.body, req.query, and req.params.
 */
const sanitizeMiddleware = (req, _res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

module.exports = { sanitizeString, sanitizeObject, sanitizeMiddleware };
