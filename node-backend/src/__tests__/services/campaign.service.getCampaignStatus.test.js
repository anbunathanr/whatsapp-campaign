/**
 * Tests for campaign.service.getCampaignStatus
 *
 * Validates: Requirement 5.8 — Track campaign execution progress via GET /api/campaigns/:id/status
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config', () => ({
  twilio: {
    accountSid: 'ACtest',
    authToken: 'test_token',
    whatsappFrom: 'whatsapp:+14155238886',
  },
  logging: { level: 'silent', dir: 'logs' },
}));

const mockCampaignFindById = jest.fn();
jest.mock('../../models/Campaign', () => ({
  findById: (...args) => mockCampaignFindById(...args),
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { getCampaignStatus } = require('../../services/campaign.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

/**
 * Build a minimal mock campaign document returned by Campaign.findById().lean()
 */
const makeMockCampaign = (overrides = {}) => ({
  _id: VALID_OBJECT_ID,
  name: 'Test Campaign',
  status: 'executing',
  messagesSent: 50,
  messagesDelivered: 40,
  messagesRead: 30,
  messagesFailed: 5,
  messagesReplied: 10,
  actualRecipients: 100,
  estimatedRecipients: 100,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('campaign.service.getCampaignStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('should return campaign info and progress data for a valid campaign', async () => {
    const mockCampaign = makeMockCampaign();
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result).toMatchObject({
      campaign: {
        id: VALID_OBJECT_ID,
        name: 'Test Campaign',
        status: 'executing',
      },
      progress: {
        messagesSent: 50,
        messagesDelivered: 40,
        messagesRead: 30,
        messagesFailed: 5,
        messagesReplied: 10,
        totalRecipients: 100,
        percentComplete: 50,
      },
    });
  });

  it('should call Campaign.findById with the provided id', async () => {
    const mockCampaign = makeMockCampaign();
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    await getCampaignStatus(VALID_OBJECT_ID);

    expect(mockCampaignFindById).toHaveBeenCalledWith(VALID_OBJECT_ID);
  });

  // ── percentComplete calculation ────────────────────────────────────────────

  it('should calculate percentComplete as 0 when totalRecipients is 0', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: 0,
      estimatedRecipients: 0,
      messagesSent: 0,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress.percentComplete).toBe(0);
    expect(result.progress.totalRecipients).toBe(0);
  });

  it('should calculate percentComplete correctly when all messages are sent', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: 200,
      messagesSent: 200,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress.percentComplete).toBe(100);
  });

  it('should round percentComplete to the nearest integer', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: 3,
      messagesSent: 1,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    // 1/3 * 100 = 33.33... → rounds to 33
    expect(result.progress.percentComplete).toBe(33);
  });

  it('should calculate percentComplete as 0 when messagesSent is 0', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: 100,
      messagesSent: 0,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress.percentComplete).toBe(0);
  });

  // ── totalRecipients fallback ───────────────────────────────────────────────

  it('should use actualRecipients when available', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: 80,
      estimatedRecipients: 100,
      messagesSent: 40,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress.totalRecipients).toBe(80);
    expect(result.progress.percentComplete).toBe(50); // 40/80 * 100
  });

  it('should fall back to estimatedRecipients when actualRecipients is 0', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: 0,
      estimatedRecipients: 150,
      messagesSent: 75,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress.totalRecipients).toBe(150);
    expect(result.progress.percentComplete).toBe(50); // 75/150 * 100
  });

  it('should fall back to estimatedRecipients when actualRecipients is not set', async () => {
    const mockCampaign = makeMockCampaign({
      actualRecipients: undefined,
      estimatedRecipients: 200,
      messagesSent: 100,
    });
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress.totalRecipients).toBe(200);
    expect(result.progress.percentComplete).toBe(50);
  });

  it('should default metric fields to 0 when not set on the campaign', async () => {
    const mockCampaign = {
      _id: VALID_OBJECT_ID,
      name: 'Sparse Campaign',
      status: 'draft',
      // No metrics set
    };
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(mockCampaign) });

    const result = await getCampaignStatus(VALID_OBJECT_ID);

    expect(result.progress).toEqual({
      messagesSent: 0,
      messagesDelivered: 0,
      messagesRead: 0,
      messagesFailed: 0,
      messagesReplied: 0,
      totalRecipients: 0,
      percentComplete: 0,
    });
  });

  // ── Error cases ────────────────────────────────────────────────────────────

  it('should throw a 400 error for an invalid ObjectId', async () => {
    await expect(getCampaignStatus('not-a-valid-id')).rejects.toMatchObject({
      message: 'Invalid campaign ID format',
      statusCode: 400,
    });

    // Should not call the database for invalid IDs
    expect(mockCampaignFindById).not.toHaveBeenCalled();
  });

  it('should throw a 404 error when campaign is not found', async () => {
    mockCampaignFindById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    await expect(getCampaignStatus(VALID_OBJECT_ID)).rejects.toMatchObject({
      message: 'Campaign not found',
      statusCode: 404,
    });
  });
});
