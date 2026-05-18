/**
 * Tests for twilio.service.js
 *
 * Validates: Requirements 5.6, 5.7, 5.9, 10.3
 */

// ---------------------------------------------------------------------------
// Mock the twilio SDK before requiring the service so the lazy client
// initialisation uses our mock instead of the real SDK.
// ---------------------------------------------------------------------------

const mockMessagesCreate = jest.fn();

jest.mock('twilio', () => {
  return jest.fn(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));
});

// Mock config so we can control credential presence
jest.mock('../../config', () => ({
  twilio: {
    accountSid: 'ACtest000000000000000000000000000000',
    authToken: 'test_auth_token',
    whatsappFrom: 'whatsapp:+14155238886',
  },
  logging: {
    level: 'silent',
    dir: 'logs',
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { sendWhatsAppMessage, isConfigured, TwilioServiceError } = require('../../services/twilio.service');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('twilio.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // isConfigured
  // -------------------------------------------------------------------------

  describe('isConfigured', () => {
    it('should be true when credentials are present in config', () => {
      expect(isConfigured).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // sendWhatsAppMessage — success paths
  // -------------------------------------------------------------------------

  describe('sendWhatsAppMessage — success', () => {
    it('should return sid and status on successful send', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM123', status: 'queued' });

      const result = await sendWhatsAppMessage('+15551234567', 'Hello!');

      expect(result).toEqual({ sid: 'SM123', status: 'queued' });
    });

    it('should prefix recipient number with "whatsapp:" if not already prefixed', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM456', status: 'queued' });

      await sendWhatsAppMessage('+15551234567', 'Hello!');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'whatsapp:+15551234567' })
      );
    });

    it('should not double-prefix "whatsapp:" on recipient number', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM789', status: 'queued' });

      await sendWhatsAppMessage('whatsapp:+15551234567', 'Hello!');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'whatsapp:+15551234567' })
      );
    });

    it('should include mediaUrl in the API call when provided', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM999', status: 'queued' });

      await sendWhatsAppMessage('+15551234567', 'Check this out', 'https://example.com/image.jpg');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ mediaUrl: ['https://example.com/image.jpg'] })
      );
    });

    it('should omit mediaUrl from the API call when not provided', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM000', status: 'queued' });

      await sendWhatsAppMessage('+15551234567', 'No media here');

      const callArgs = mockMessagesCreate.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('mediaUrl');
    });

    it('should trim whitespace from the message body', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM111', status: 'queued' });

      await sendWhatsAppMessage('+15551234567', '  Hello with spaces  ');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Hello with spaces' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // sendWhatsAppMessage — input validation (Requirement 10.3)
  // -------------------------------------------------------------------------

  describe('sendWhatsAppMessage — input validation', () => {
    it('should throw TwilioServiceError with INVALID_MESSAGE_BODY for empty body', async () => {
      await expect(sendWhatsAppMessage('+15551234567', '')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'INVALID_MESSAGE_BODY',
      });
    });

    it('should throw TwilioServiceError with INVALID_MESSAGE_BODY for whitespace-only body', async () => {
      await expect(sendWhatsAppMessage('+15551234567', '   ')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'INVALID_MESSAGE_BODY',
      });
    });

    it('should throw TwilioServiceError with INVALID_PHONE_NUMBER for empty phone number', async () => {
      await expect(sendWhatsAppMessage('', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'INVALID_PHONE_NUMBER',
      });
    });

    it('should throw TwilioServiceError with INVALID_PHONE_NUMBER for non-string phone number', async () => {
      await expect(sendWhatsAppMessage(null, 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'INVALID_PHONE_NUMBER',
      });
    });
  });

  // -------------------------------------------------------------------------
  // sendWhatsAppMessage — error mapping (Requirement 5.7)
  // -------------------------------------------------------------------------

  describe('sendWhatsAppMessage — error mapping', () => {
    it('should map Twilio error code 21211 to INVALID_PHONE_NUMBER', async () => {
      const twilioErr = Object.assign(new Error('Invalid To number'), { code: 21211, status: 400 });
      mockMessagesCreate.mockRejectedValueOnce(twilioErr);

      await expect(sendWhatsAppMessage('+15550000000', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'INVALID_PHONE_NUMBER',
        twilioCode: 21211,
      });
    });

    it('should map Twilio error code 21614 to INVALID_PHONE_NUMBER', async () => {
      const twilioErr = Object.assign(new Error('Not a mobile number'), { code: 21614, status: 400 });
      mockMessagesCreate.mockRejectedValueOnce(twilioErr);

      await expect(sendWhatsAppMessage('+15550000000', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'INVALID_PHONE_NUMBER',
        twilioCode: 21614,
      });
    });

    it('should map HTTP 429 to RATE_LIMITED', async () => {
      const twilioErr = Object.assign(new Error('Too many requests'), { status: 429 });
      mockMessagesCreate.mockRejectedValueOnce(twilioErr);

      await expect(sendWhatsAppMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'RATE_LIMITED',
      });
    });

    it('should map Twilio error code 20429 to RATE_LIMITED', async () => {
      const twilioErr = Object.assign(new Error('Rate limit'), { code: 20429, status: 429 });
      mockMessagesCreate.mockRejectedValueOnce(twilioErr);

      await expect(sendWhatsAppMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'RATE_LIMITED',
      });
    });

    it('should map Twilio error code 20003 to AUTH_ERROR', async () => {
      const twilioErr = Object.assign(new Error('Authenticate'), { code: 20003, status: 401 });
      mockMessagesCreate.mockRejectedValueOnce(twilioErr);

      await expect(sendWhatsAppMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'AUTH_ERROR',
        twilioCode: 20003,
      });
    });

    it('should map ECONNREFUSED to NETWORK_ERROR', async () => {
      const networkErr = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      mockMessagesCreate.mockRejectedValueOnce(networkErr);

      await expect(sendWhatsAppMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'NETWORK_ERROR',
      });
    });

    it('should map ETIMEDOUT to NETWORK_ERROR', async () => {
      const networkErr = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' });
      mockMessagesCreate.mockRejectedValueOnce(networkErr);

      await expect(sendWhatsAppMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'NETWORK_ERROR',
      });
    });

    it('should map unknown Twilio errors to SEND_FAILED', async () => {
      const unknownErr = Object.assign(new Error('Something went wrong'), { code: 99999, status: 500 });
      mockMessagesCreate.mockRejectedValueOnce(unknownErr);

      await expect(sendWhatsAppMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        name: 'TwilioServiceError',
        code: 'SEND_FAILED',
        twilioCode: 99999,
      });
    });
  });

  // -------------------------------------------------------------------------
  // TwilioServiceError class
  // -------------------------------------------------------------------------

  describe('TwilioServiceError', () => {
    it('should be an instance of Error', () => {
      const err = new TwilioServiceError('TEST_CODE', 'test message');
      expect(err).toBeInstanceOf(Error);
    });

    it('should have the correct name, code, and message', () => {
      const err = new TwilioServiceError('MY_CODE', 'my message', 12345);
      expect(err.name).toBe('TwilioServiceError');
      expect(err.code).toBe('MY_CODE');
      expect(err.message).toBe('my message');
      expect(err.twilioCode).toBe(12345);
    });

    it('should not set twilioCode when not provided', () => {
      const err = new TwilioServiceError('MY_CODE', 'my message');
      expect(err).not.toHaveProperty('twilioCode');
    });
  });
});
