/**
 * Tests for middleware/errorHandler.js — TwilioServiceError handling
 *
 * Validates: Requirements 5.7, 10.3
 */

jest.mock('../../config', () => ({
  twilio: {
    accountSid: 'ACtest',
    authToken: 'test_token',
    whatsappFrom: 'whatsapp:+14155238886',
  },
  logging: { level: 'silent', dir: 'logs' },
}));

const { errorHandler } = require('../../middleware/errorHandler');

/**
 * Build a minimal mock Express req object.
 */
const mockReq = () => ({
  originalUrl: '/api/test',
  method: 'POST',
  ip: '127.0.0.1',
});

/**
 * Build a mock Express res object that captures status and json calls.
 */
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Create a TwilioServiceError-like object (without importing the real service).
 */
const makeTwilioError = (code, message) => {
  const err = new Error(message);
  err.name = 'TwilioServiceError';
  err.code = code;
  return err;
};

describe('errorHandler middleware — TwilioServiceError handling', () => {
  let req;
  let res;
  const next = jest.fn();

  beforeEach(() => {
    req = mockReq();
    res = mockRes();
    jest.clearAllMocks();
  });

  it('should return 503 for TWILIO_NOT_CONFIGURED', () => {
    const err = makeTwilioError('TWILIO_NOT_CONFIGURED', 'Twilio not configured');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Twilio not configured' })
    );
  });

  it('should return 400 for INVALID_PHONE_NUMBER', () => {
    const err = makeTwilioError('INVALID_PHONE_NUMBER', 'Invalid phone number');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Invalid phone number' })
    );
  });

  it('should return 400 for INVALID_MESSAGE_BODY', () => {
    const err = makeTwilioError('INVALID_MESSAGE_BODY', 'Message body is empty');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Message body is empty' })
    );
  });

  it('should return 403 for PERMISSION_DENIED', () => {
    const err = makeTwilioError('PERMISSION_DENIED', 'Permission denied');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Permission denied' })
    );
  });

  it('should return 429 for RATE_LIMITED', () => {
    const err = makeTwilioError('RATE_LIMITED', 'Rate limit exceeded');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Rate limit exceeded' })
    );
  });

  it('should return 502 for NETWORK_ERROR', () => {
    const err = makeTwilioError('NETWORK_ERROR', 'Network error');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Network error' })
    );
  });

  it('should return 502 for AUTH_ERROR', () => {
    const err = makeTwilioError('AUTH_ERROR', 'Twilio auth failed');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Twilio auth failed' })
    );
  });

  it('should return 502 for SEND_FAILED', () => {
    const err = makeTwilioError('SEND_FAILED', 'Send failed');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Send failed' })
    );
  });

  it('should not call next() after handling a TwilioServiceError', () => {
    const err = makeTwilioError('SEND_FAILED', 'Send failed');
    errorHandler(err, req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('should still handle non-Twilio errors normally (e.g. CastError → 400)', () => {
    const err = Object.assign(new Error('Cast to ObjectId failed'), {
      name: 'CastError',
      path: '_id',
      value: 'bad-id',
    });
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
