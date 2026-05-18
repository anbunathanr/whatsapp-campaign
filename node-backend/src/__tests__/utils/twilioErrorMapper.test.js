/**
 * Tests for twilioErrorMapper.js
 *
 * Validates: Requirements 5.7, 10.3
 */

const { twilioErrorToHttpStatus } = require('../../utils/twilioErrorMapper');

describe('twilioErrorToHttpStatus', () => {
  // -------------------------------------------------------------------------
  // Known error code mappings
  // -------------------------------------------------------------------------

  it('should map TWILIO_NOT_CONFIGURED to 503 (Service Unavailable)', () => {
    expect(twilioErrorToHttpStatus('TWILIO_NOT_CONFIGURED')).toBe(503);
  });

  it('should map INVALID_PHONE_NUMBER to 400 (Bad Request)', () => {
    expect(twilioErrorToHttpStatus('INVALID_PHONE_NUMBER')).toBe(400);
  });

  it('should map INVALID_MESSAGE_BODY to 400 (Bad Request)', () => {
    expect(twilioErrorToHttpStatus('INVALID_MESSAGE_BODY')).toBe(400);
  });

  it('should map PERMISSION_DENIED to 403 (Forbidden)', () => {
    expect(twilioErrorToHttpStatus('PERMISSION_DENIED')).toBe(403);
  });

  it('should map RATE_LIMITED to 429 (Too Many Requests)', () => {
    expect(twilioErrorToHttpStatus('RATE_LIMITED')).toBe(429);
  });

  it('should map NETWORK_ERROR to 502 (Bad Gateway)', () => {
    expect(twilioErrorToHttpStatus('NETWORK_ERROR')).toBe(502);
  });

  it('should map AUTH_ERROR to 502 (Bad Gateway)', () => {
    expect(twilioErrorToHttpStatus('AUTH_ERROR')).toBe(502);
  });

  it('should map SEND_FAILED to 502 (Bad Gateway)', () => {
    expect(twilioErrorToHttpStatus('SEND_FAILED')).toBe(502);
  });

  // -------------------------------------------------------------------------
  // Unknown / unrecognised error codes
  // -------------------------------------------------------------------------

  it('should map an unknown error code to 500 (Internal Server Error)', () => {
    expect(twilioErrorToHttpStatus('UNKNOWN_ERROR_CODE')).toBe(500);
  });

  it('should map an empty string to 500 (Internal Server Error)', () => {
    expect(twilioErrorToHttpStatus('')).toBe(500);
  });

  it('should map undefined to 500 (Internal Server Error)', () => {
    expect(twilioErrorToHttpStatus(undefined)).toBe(500);
  });

  it('should map null to 500 (Internal Server Error)', () => {
    expect(twilioErrorToHttpStatus(null)).toBe(500);
  });
});
