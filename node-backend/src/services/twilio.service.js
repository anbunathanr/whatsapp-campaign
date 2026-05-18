/**
 * Twilio WhatsApp Service
 *
 * Wraps the Twilio SDK to send WhatsApp messages via the Twilio API.
 * Initialises the client lazily — only when credentials are present.
 *
 * Requirements: 5.6, 5.7, 5.9, 10.3
 */

const config = require('../config');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Structured error class
// ---------------------------------------------------------------------------

/**
 * Represents a structured error from the Twilio service layer.
 *
 * @property {string}  code        - Internal error code (e.g. 'TWILIO_NOT_CONFIGURED')
 * @property {string}  message     - Human-readable description
 * @property {number|undefined} twilioCode - Twilio REST API error code when available
 */
class TwilioServiceError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [twilioCode]
   */
  constructor(code, message, twilioCode) {
    super(message);
    this.name = 'TwilioServiceError';
    this.code = code;
    if (twilioCode !== undefined) {
      this.twilioCode = twilioCode;
    }
  }
}

// ---------------------------------------------------------------------------
// Credential validation
// ---------------------------------------------------------------------------

const { accountSid, authToken, whatsappFrom } = config.twilio;

const _credentialsPresent =
  typeof accountSid === 'string' &&
  accountSid.trim().length > 0 &&
  typeof authToken === 'string' &&
  authToken.trim().length > 0;

if (!_credentialsPresent) {
  logger.warn(
    'twilio.service: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing. ' +
      'WhatsApp message sending will be unavailable until credentials are configured.'
  );
}

// ---------------------------------------------------------------------------
// Lazy client initialisation
// ---------------------------------------------------------------------------

let _client = null;

/**
 * Returns the Twilio client, initialising it on first call.
 * Throws TwilioServiceError if credentials are not configured.
 *
 * @returns {import('twilio').Twilio}
 */
const _getClient = () => {
  if (!_credentialsPresent) {
    throw new TwilioServiceError(
      'TWILIO_NOT_CONFIGURED',
      'Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
    );
  }
  if (!_client) {
    // eslint-disable-next-line global-require
    _client = require('twilio')(accountSid, authToken);
    logger.info('twilio.service: Twilio client initialised');
  }
  return _client;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensures a phone number string is prefixed with "whatsapp:".
 *
 * @param {string} number
 * @returns {string}
 */
const _ensureWhatsAppPrefix = (number) => {
  if (typeof number !== 'string' || number.trim().length === 0) {
    throw new TwilioServiceError('INVALID_PHONE_NUMBER', 'Phone number must be a non-empty string.');
  }
  return number.startsWith('whatsapp:') ? number : `whatsapp:${number}`;
};

/**
 * Validates and formats a phone number for Twilio / WhatsApp.
 * Ensures the number is in E.164 format.
 *
 * @param {string} phoneNumber
 * @returns {string} The validated, formatted E.164 number (without whatsapp: prefix)
 * @throws {TwilioServiceError} If number is completely invalid
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new TwilioServiceError('INVALID_PHONE_NUMBER', 'Phone number must be provided.');
  }

  // Remove all non-numeric characters except leading '+'
  let cleaned = phoneNumber.replace(/(?!^\+)[^\d]/g, '');
  
  // Ensure it starts with '+'
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  // Basic validation for length (E.164 can be up to 15 digits)
  if (cleaned.length < 10 || cleaned.length > 16) {
    throw new TwilioServiceError('INVALID_PHONE_NUMBER', `Invalid phone number length: ${cleaned}`);
  }

  return cleaned;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Whether the service is configured with valid credentials.
 * Callers can check this before attempting to send messages.
 *
 * @type {boolean}
 */
const isConfigured = _credentialsPresent;

/**
 * Send a WhatsApp message via the Twilio API.
 *
 * Requirement 5.6 — Send messages through WhatsApp API using configured credentials.
 * Requirement 10.3 — Validate and sanitize inputs.
 *
 * @param {string}  to       - Recipient phone number (E.164 format, with or without "whatsapp:" prefix)
 * @param {string}  body     - Message body text
 * @param {string}  [mediaUrl] - Optional public URL of a media attachment
 * @param {object}  [credentials] - Optional dynamic credentials { accountSid, authToken, whatsappFrom }
 * @returns {Promise<{ sid: string, status: string }>}
 * @throws {TwilioServiceError}
 */
const sendWhatsAppMessage = async (to, body, mediaUrl, credentials) => {
  // --- Input validation (Requirement 10.3) ---
  if (typeof body !== 'string' || body.trim().length === 0) {
    throw new TwilioServiceError('INVALID_MESSAGE_BODY', 'Message body must be a non-empty string.');
  }

  // Determine which credentials to use
  let activeAccountSid = accountSid;
  let activeAuthToken = authToken;
  let activeWhatsappFrom = whatsappFrom;
  let client;

  if (credentials && credentials.accountSid && credentials.authToken && credentials.whatsappFrom) {
    activeAccountSid = credentials.accountSid;
    activeAuthToken = credentials.authToken;
    activeWhatsappFrom = credentials.whatsappFrom;
    // eslint-disable-next-line global-require
    client = require('twilio')(activeAccountSid, activeAuthToken);
  } else {
    client = _getClient();
  }

  const toFormatted = _ensureWhatsAppPrefix(to);
  const fromFormatted = _ensureWhatsAppPrefix(activeWhatsappFrom);

  const messageParams = {
    from: fromFormatted,
    to: toFormatted,
    body: body.trim(),
  };

  if (mediaUrl !== undefined && mediaUrl !== null && mediaUrl !== '') {
    messageParams.mediaUrl = [mediaUrl];
  }

  try {
    logger.info('twilio.service: Sending WhatsApp message to %s', toFormatted);
    const message = await client.messages.create(messageParams);
    logger.info(
      'twilio.service: Message sent successfully — SID: %s, status: %s',
      message.sid,
      message.status
    );
    return { sid: message.sid, status: message.status };
  } catch (err) {
    // Map Twilio SDK errors to structured TwilioServiceError (Requirement 5.7)
    const twilioCode = err.code; // Twilio REST error code (numeric)
    const httpStatus = err.status; // HTTP status from Twilio API

    let code;
    let message;

    if (twilioCode === 21211 || twilioCode === 21614) {
      // 21211: Invalid 'To' phone number
      // 21614: 'To' number is not a valid mobile number
      code = 'INVALID_PHONE_NUMBER';
      message = `Invalid recipient phone number: ${to}`;
    } else if (twilioCode === 21408) {
      // Permission to send an SMS has not been enabled for the region
      code = 'PERMISSION_DENIED';
      message = 'Permission to send WhatsApp messages to this region is not enabled.';
    } else if (twilioCode === 20429 || httpStatus === 429) {
      // Too many requests / rate limit
      code = 'RATE_LIMITED';
      message = 'Twilio rate limit exceeded. Please retry after a short delay.';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      // Network-level errors
      code = 'NETWORK_ERROR';
      message = `Network error while contacting Twilio API: ${err.message}`;
    } else if (twilioCode === 20003) {
      // Authentication failure
      code = 'AUTH_ERROR';
      message = 'Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
    } else {
      code = 'SEND_FAILED';
      message = err.message || 'Failed to send WhatsApp message via Twilio.';
    }

    logger.error(
      'twilio.service: Failed to send message to %s — code: %s, twilioCode: %s, error: %s',
      toFormatted,
      code,
      twilioCode,
      err.message
    );

    throw new TwilioServiceError(code, message, twilioCode);
  }
};

module.exports = {
  sendWhatsAppMessage,
  validatePhoneNumber,
  isConfigured,
  TwilioServiceError,
};
