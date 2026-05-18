/**
 * Twilio Error Mapper Utility
 *
 * Maps TwilioServiceError codes to appropriate HTTP status codes.
 * Allows controllers and middleware to use a single source of truth
 * for error code → HTTP status mapping without duplicating logic.
 *
 * Requirements: 5.7, 10.3
 */

/**
 * Map a TwilioServiceError code to an HTTP status code.
 *
 * @param {string} errorCode - The TwilioServiceError code (e.g. 'RATE_LIMITED')
 * @returns {number} HTTP status code
 */
const twilioErrorToHttpStatus = (errorCode) => {
  switch (errorCode) {
    case 'TWILIO_NOT_CONFIGURED':
      return 503; // Service Unavailable
    case 'INVALID_PHONE_NUMBER':
      return 400; // Bad Request
    case 'INVALID_MESSAGE_BODY':
      return 400; // Bad Request
    case 'PERMISSION_DENIED':
      return 403; // Forbidden
    case 'RATE_LIMITED':
      return 429; // Too Many Requests
    case 'NETWORK_ERROR':
      return 502; // Bad Gateway
    case 'AUTH_ERROR':
      return 502; // Bad Gateway (Twilio auth issue, not user auth)
    case 'SEND_FAILED':
      return 502; // Bad Gateway
    default:
      return 500; // Internal Server Error
  }
};

module.exports = { twilioErrorToHttpStatus };
