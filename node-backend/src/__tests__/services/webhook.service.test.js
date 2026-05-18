/**
 * Webhook Service Tests
 * Tests for processWebhookEvent, signature validation, and idempotency.
 */

jest.mock('../../models/Message');
jest.mock('../../models/Campaign');
jest.mock('../../models/WebhookEvent');
jest.mock('../../services/workflow.service');
jest.mock('../../services/twilio.service');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const Message = require('../../models/Message');
const Campaign = require('../../models/Campaign');
const WebhookEvent = require('../../models/WebhookEvent');
const workflowService = require('../../services/workflow.service');
const twilioService = require('../../services/twilio.service');
const { processWebhookEvent, validateSignature } = require('../../services/webhook.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeMessage = (overrides = {}) => ({
  _id: 'msg001',
  externalMessageId: 'SM123',
  phoneNumber: '+14155550100',
  campaign: { _id: 'camp001' },
  status: 'sent',
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const makeWebhookEvent = (overrides = {}) => ({
  _id: 'evt001',
  processed: false,
  processedAt: null,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

// ─── validateSignature ─────────────────────────────────────────────────────────

describe('validateSignature', () => {
  it('returns false when signature is missing', () => {
    expect(validateSignature('https://example.com', {}, null, 'token')).toBe(false);
  });

  it('returns false when authToken is missing', () => {
    expect(validateSignature('https://example.com', {}, 'sig', null)).toBe(false);
  });
});

// ─── processWebhookEvent ───────────────────────────────────────────────────────

describe('processWebhookEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a warning and returns early when MessageSid is missing', async () => {
    const logger = require('../../utils/logger');
    await processWebhookEvent({ MessageStatus: 'delivered' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MessageSid'));
    expect(WebhookEvent.findOne).not.toHaveBeenCalled();
  });

  it('skips processing for already-processed idempotent events', async () => {
    WebhookEvent.findOne = jest.fn().mockResolvedValue({ _id: 'existing' });
    await processWebhookEvent({ MessageSid: 'SM123', MessageStatus: 'delivered' });
    expect(Message.findOne).not.toHaveBeenCalled();
  });

  it('saves WebhookEvent and updates message status to delivered', async () => {
    WebhookEvent.findOne = jest.fn().mockResolvedValue(null);
    const mockMsg = makeMessage({ status: 'sent' });
    Message.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockMsg),
    });
    const mockEvt = makeWebhookEvent();
    WebhookEvent.mockImplementation(() => mockEvt);
    Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue({});

    await processWebhookEvent({ MessageSid: 'SM123', MessageStatus: 'delivered' });

    expect(mockMsg.status).toBe('delivered');
    expect(mockMsg.save).toHaveBeenCalled();
    expect(mockEvt.processed).toBe(true);
    expect(mockEvt.save).toHaveBeenCalled();
  });

  it('updates message to read status and increments campaign counter', async () => {
    WebhookEvent.findOne = jest.fn().mockResolvedValue(null);
    const mockMsg = makeMessage({ status: 'delivered' });
    Message.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockMsg),
    });
    const mockEvt = makeWebhookEvent();
    WebhookEvent.mockImplementation(() => mockEvt);
    Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue({});

    await processWebhookEvent({ MessageSid: 'SM123', MessageStatus: 'read' });

    expect(mockMsg.status).toBe('read');
    expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith(
      'camp001',
      expect.objectContaining({ $inc: { messagesRead: 1 } })
    );
  });

  it('updates message to failed and increments messagesFailed', async () => {
    WebhookEvent.findOne = jest.fn().mockResolvedValue(null);
    const mockMsg = makeMessage({ status: 'sent' });
    Message.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockMsg),
    });
    const mockEvt = makeWebhookEvent();
    WebhookEvent.mockImplementation(() => mockEvt);
    Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue({});

    await processWebhookEvent({
      MessageSid: 'SM123',
      MessageStatus: 'failed',
      ErrorCode: '30006',
      ErrorMessage: 'Landline or unreachable carrier',
    });

    expect(mockMsg.status).toBe('failed');
    expect(mockMsg.errorCode).toBe('30006');
    expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith(
      'camp001',
      expect.objectContaining({ $inc: { messagesFailed: 1 } })
    );
  });

  it('processes replied events and triggers keyword auto-response', async () => {
    WebhookEvent.findOne = jest.fn().mockResolvedValue(null);
    const mockMsg = makeMessage({ status: 'sent' });
    Message.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockMsg),
    });
    const mockEvt = makeWebhookEvent();
    WebhookEvent.mockImplementation(() => mockEvt);
    Campaign.findByIdAndUpdate = jest.fn().mockResolvedValue({});

    const mockWorkflow = {
      n8nWorkflowId: null,
      triggerConfig: { autoResponse: 'Thanks for your message!' },
      executionCount: 0,
      lastExecutedAt: null,
      save: jest.fn().mockResolvedValue(true),
    };
    workflowService.matchAutoResponse = jest.fn().mockResolvedValue(mockWorkflow);
    twilioService.sendWhatsAppMessage = jest.fn().mockResolvedValue({ sid: 'SM999' });

    await processWebhookEvent({ MessageSid: 'SM123', Body: 'STOP' });

    expect(mockMsg.status).toBe('replied');
    expect(workflowService.matchAutoResponse).toHaveBeenCalledWith('STOP');
    expect(twilioService.sendWhatsAppMessage).toHaveBeenCalledWith(
      mockMsg.phoneNumber,
      'Thanks for your message!'
    );
    expect(mockWorkflow.executionCount).toBe(1);
  });

  it('handles missing message gracefully without throwing', async () => {
    WebhookEvent.findOne = jest.fn().mockResolvedValue(null);
    Message.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    const mockEvt = makeWebhookEvent();
    WebhookEvent.mockImplementation(() => mockEvt);

    // Should not throw
    await expect(
      processWebhookEvent({ MessageSid: 'SM_UNKNOWN', MessageStatus: 'delivered' })
    ).resolves.toBeUndefined();
  });
});
