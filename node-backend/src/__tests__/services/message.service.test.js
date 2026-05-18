/**
 * Tests for message.service.js
 *
 * Validates: Requirements 5.6, 5.7, 5.9
 */

// ---------------------------------------------------------------------------
// Mock twilio.service so message.service tests are isolated
// ---------------------------------------------------------------------------

jest.mock('../../services/twilio.service', () => ({
  sendWhatsAppMessage: jest.fn(),
  isConfigured: true,
  TwilioServiceError: class TwilioServiceError extends Error {
    constructor(code, message, twilioCode) {
      super(message);
      this.name = 'TwilioServiceError';
      this.code = code;
      if (twilioCode !== undefined) {this.twilioCode = twilioCode;}
    }
  },
}));

jest.mock('../../config', () => ({
  twilio: {
    accountSid: 'ACtest',
    authToken: 'test_token',
    whatsappFrom: 'whatsapp:+14155238886',
  },
  logging: { level: 'silent', dir: 'logs' },
}));

// Mock the Message model
const mockMessageFindById = jest.fn();
jest.mock('../../models/Message', () => ({
  findById: (...args) => mockMessageFindById(...args),
}));

// Mock mongoose for ObjectId validation
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    Types: {
      ...actual.Types,
      ObjectId: {
        ...actual.Types.ObjectId,
        isValid: jest.fn((id) => actual.Types.ObjectId.isValid(id)),
      },
    },
  };
});

const mongoose = require('mongoose');
const twilioService = require('../../services/twilio.service');
const { sendMessage, personalizeMessage, sendAndUpdateMessage, getMessageStatus } = require('../../services/message.service');

describe('message.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('should return externalMessageId and status "sent" on success (Requirement 5.9)', async () => {
      twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_abc123', status: 'queued' });

      const result = await sendMessage('+15551234567', 'Hello!');

      expect(result).toEqual({ externalMessageId: 'SM_abc123', status: 'sent' });
    });

    it('should call twilioService.sendWhatsAppMessage with the correct arguments', async () => {
      twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_xyz', status: 'queued' });

      await sendMessage('+15559876543', 'Test message', 'https://example.com/img.jpg');

      expect(twilioService.sendWhatsAppMessage).toHaveBeenCalledWith(
        '+15559876543',
        'Test message',
        'https://example.com/img.jpg'
      );
    });

    it('should re-throw errors from twilioService so callers can handle retry logic', async () => {
      const { TwilioServiceError } = require('../../services/twilio.service');
      const err = new TwilioServiceError('RATE_LIMITED', 'Rate limit exceeded');
      twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);

      await expect(sendMessage('+15551234567', 'Hello')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });

    it('should pass mediaUrl as undefined when not provided', async () => {
      twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_nomedia', status: 'queued' });

      await sendMessage('+15551234567', 'No media');

      expect(twilioService.sendWhatsAppMessage).toHaveBeenCalledWith(
        '+15551234567',
        'No media',
        undefined
      );
    });
  });

  // -------------------------------------------------------------------------
  // personalizeMessage (existing functionality — regression check)
  // -------------------------------------------------------------------------

  describe('personalizeMessage', () => {
    it('should replace template placeholders with contact data', async () => {
      const result = await personalizeMessage('Hello {{name}}!', { name: 'Alice' });
      expect(result).toBe('Hello Alice!');
    });

    it('should support nested dot-notation placeholders', async () => {
      const result = await personalizeMessage('Company: {{contact.company}}', {
        contact: { company: 'Acme Corp' },
      });
      expect(result).toBe('Company: Acme Corp');
    });

    it('should replace missing variables with empty string', async () => {
      const result = await personalizeMessage('Hello {{name}}!', {});
      expect(result).toBe('Hello !');
    });
  });

  // -------------------------------------------------------------------------
  // sendAndUpdateMessage
  // -------------------------------------------------------------------------

  describe('sendAndUpdateMessage', () => {
    /**
     * Helper to create a mock Mongoose Message document.
     */
    const makeMockMessageDoc = (overrides = {}) => ({
      phoneNumber: '+15551234567',
      messageContent: 'Hello, World!',
      status: 'queued',
      retryCount: 0,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    describe('success path', () => {
      it('should set status to "sent" on the document (Requirement 5.9)', async () => {
        twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_success', status: 'queued' });
        const messageDoc = makeMockMessageDoc();

        await sendAndUpdateMessage(messageDoc);

        expect(messageDoc.status).toBe('sent');
      });

      it('should set externalMessageId to the returned SID (Requirement 5.9)', async () => {
        twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_success', status: 'queued' });
        const messageDoc = makeMockMessageDoc();

        await sendAndUpdateMessage(messageDoc);

        expect(messageDoc.externalMessageId).toBe('SM_success');
      });

      it('should set sentAt to a Date on success (Requirement 5.9)', async () => {
        twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_success', status: 'queued' });
        const messageDoc = makeMockMessageDoc();

        await sendAndUpdateMessage(messageDoc);

        expect(messageDoc.sentAt).toBeInstanceOf(Date);
      });

      it('should call save() on the document after a successful send', async () => {
        twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_success', status: 'queued' });
        const messageDoc = makeMockMessageDoc();

        await sendAndUpdateMessage(messageDoc);

        expect(messageDoc.save).toHaveBeenCalledTimes(1);
      });

      it('should return the updated message document on success', async () => {
        twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_success', status: 'queued' });
        const messageDoc = makeMockMessageDoc();

        const result = await sendAndUpdateMessage(messageDoc);

        expect(result).toBe(messageDoc);
      });

      it('should pass mediaUrl to twilioService when provided', async () => {
        twilioService.sendWhatsAppMessage.mockResolvedValueOnce({ sid: 'SM_media', status: 'queued' });
        const messageDoc = makeMockMessageDoc();

        await sendAndUpdateMessage(messageDoc, 'https://example.com/image.jpg');

        expect(twilioService.sendWhatsAppMessage).toHaveBeenCalledWith(
          messageDoc.phoneNumber,
          messageDoc.messageContent,
          'https://example.com/image.jpg'
        );
      });
    });

    describe('failure path', () => {
      const { TwilioServiceError } = require('../../services/twilio.service');

      it('should set status to "failed" on the document (Requirement 5.7)', async () => {
        const err = new TwilioServiceError('RATE_LIMITED', 'Rate limit exceeded');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc();

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toThrow();

        expect(messageDoc.status).toBe('failed');
      });

      it('should set errorCode from the error on the document (Requirement 5.7)', async () => {
        const err = new TwilioServiceError('SEND_FAILED', 'Something went wrong');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc();

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toThrow();

        expect(messageDoc.errorCode).toBe('SEND_FAILED');
      });

      it('should set errorMessage from the error on the document (Requirement 5.7)', async () => {
        const err = new TwilioServiceError('SEND_FAILED', 'Something went wrong');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc();

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toThrow();

        expect(messageDoc.errorMessage).toBe('Something went wrong');
      });

      it('should set failedAt to a Date on failure (Requirement 5.7)', async () => {
        const err = new TwilioServiceError('SEND_FAILED', 'Something went wrong');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc();

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toThrow();

        expect(messageDoc.failedAt).toBeInstanceOf(Date);
      });

      it('should increment retryCount on failure (Requirement 5.7)', async () => {
        const err = new TwilioServiceError('SEND_FAILED', 'Something went wrong');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc({ retryCount: 2 });

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toThrow();

        expect(messageDoc.retryCount).toBe(3);
      });

      it('should call save() on the document after a failure', async () => {
        const err = new TwilioServiceError('SEND_FAILED', 'Something went wrong');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc();

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toThrow();

        expect(messageDoc.save).toHaveBeenCalledTimes(1);
      });

      it('should re-throw the error so callers can handle retry logic', async () => {
        const err = new TwilioServiceError('RATE_LIMITED', 'Rate limit exceeded');
        twilioService.sendWhatsAppMessage.mockRejectedValueOnce(err);
        const messageDoc = makeMockMessageDoc();

        await expect(sendAndUpdateMessage(messageDoc)).rejects.toMatchObject({
          code: 'RATE_LIMITED',
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // getMessageStatus
  // -------------------------------------------------------------------------

  describe('getMessageStatus', () => {
    const validObjectId = '507f1f77bcf86cd799439011';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return the message document when found (Requirement 5.9)', async () => {
      const mockMessage = {
        _id: validObjectId,
        status: 'sent',
        externalMessageId: 'SM_abc123',
        sentAt: new Date('2024-01-01T10:00:00Z'),
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        repliedAt: null,
        errorCode: null,
        errorMessage: null,
        retryCount: 0,
      };

      mockMessageFindById.mockReturnValueOnce({
        select: jest.fn().mockResolvedValueOnce(mockMessage),
      });

      const result = await getMessageStatus(validObjectId);

      expect(result).toBe(mockMessage);
      expect(mockMessageFindById).toHaveBeenCalledWith(validObjectId);
    });

    it('should throw a 404 error when message is not found', async () => {
      mockMessageFindById.mockReturnValueOnce({
        select: jest.fn().mockResolvedValueOnce(null),
      });

      await expect(getMessageStatus(validObjectId)).rejects.toMatchObject({
        message: 'Message not found',
        statusCode: 404,
      });
    });

    it('should throw a 400 error for an invalid ObjectId', async () => {
      await expect(getMessageStatus('not-a-valid-id')).rejects.toMatchObject({
        message: 'Invalid message ID',
        statusCode: 400,
      });

      // Should not call the database for invalid IDs
      expect(mockMessageFindById).not.toHaveBeenCalled();
    });
  });
});