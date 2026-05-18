/**
 * Workflow Service Tests
 * Tests for executeN8nWorkflow, handleTriggerEvent, and matchAutoResponse.
 */

jest.mock('axios');
jest.mock('../../models/Workflow');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const axios = require('axios');
const Workflow = require('../../models/Workflow');
const {
  executeN8nWorkflow,
  handleTriggerEvent,
  matchAutoResponse,
} = require('../../services/workflow.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeWorkflow = (overrides = {}) => ({
  _id: 'wf001',
  name: 'Test Workflow',
  n8nWorkflowId: 'n8n-abc-123',
  triggerType: 'keyword',
  isActive: true,
  executionCount: 0,
  lastExecutedAt: null,
  triggerConfig: { keyword: 'HELP' },
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

// ─── executeN8nWorkflow ────────────────────────────────────────────────────────

describe('executeN8nWorkflow', () => {
  afterEach(() => jest.clearAllMocks());

  it('calls the n8n webhook URL with the provided payload and returns data', async () => {
    const mockResponse = { data: { success: true, executionId: 'exec-001' } };
    axios.post.mockResolvedValue(mockResponse);

    const result = await executeN8nWorkflow('n8n-abc-123', { contactId: 'c1' });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/webhook/n8n-abc-123'),
      { contactId: 'c1' },
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
    );
    expect(result).toEqual({ success: true, executionId: 'exec-001' });
  });

  it('throws when the n8n call fails', async () => {
    axios.post.mockRejectedValue(new Error('Connection refused'));
    await expect(executeN8nWorkflow('n8n-abc-123', {})).rejects.toThrow('Connection refused');
  });
});

// ─── handleTriggerEvent ────────────────────────────────────────────────────────

describe('handleTriggerEvent', () => {
  afterEach(() => jest.clearAllMocks());

  it('executes matching event workflows and updates their metrics', async () => {
    const wf = makeWorkflow({
      triggerType: 'event',
      triggerConfig: { event: 'campaign_executed' },
    });
    Workflow.find = jest.fn().mockResolvedValue([wf]);
    axios.post.mockResolvedValue({ data: {} });

    await handleTriggerEvent('campaign_executed', { campaignId: 'camp001' });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(wf.executionCount).toBe(1);
    expect(wf.save).toHaveBeenCalledTimes(1);
  });

  it('skips workflows where event type does not match', async () => {
    const wf = makeWorkflow({
      triggerType: 'event',
      triggerConfig: { event: 'campaign_executed' },
    });
    Workflow.find = jest.fn().mockResolvedValue([wf]);

    await handleTriggerEvent('user_login', {});

    expect(axios.post).not.toHaveBeenCalled();
    expect(wf.save).not.toHaveBeenCalled();
  });

  it('returns without error when no workflows are found', async () => {
    Workflow.find = jest.fn().mockResolvedValue([]);
    await expect(handleTriggerEvent('campaign_executed', {})).resolves.toBeUndefined();
  });
});

// ─── matchAutoResponse ─────────────────────────────────────────────────────────

describe('matchAutoResponse', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the matching workflow for an exact keyword match', async () => {
    const wf = makeWorkflow({ triggerConfig: { keyword: 'HELP' } });
    Workflow.find = jest.fn().mockResolvedValue([wf]);

    const result = await matchAutoResponse('I need HELP please');
    expect(result).toBe(wf);
  });

  it('matches keyword case-insensitively', async () => {
    const wf = makeWorkflow({ triggerConfig: { keyword: 'STOP' } });
    Workflow.find = jest.fn().mockResolvedValue([wf]);

    const result = await matchAutoResponse('stop sending me messages');
    expect(result).toBe(wf);
  });

  it('returns null when no keyword matches', async () => {
    const wf = makeWorkflow({ triggerConfig: { keyword: 'HELP' } });
    Workflow.find = jest.fn().mockResolvedValue([wf]);

    const result = await matchAutoResponse('Hello there');
    expect(result).toBeNull();
  });

  it('returns null when there are no active keyword workflows', async () => {
    Workflow.find = jest.fn().mockResolvedValue([]);
    const result = await matchAutoResponse('HELP');
    expect(result).toBeNull();
  });

  it('skips workflows with empty keyword config', async () => {
    const wf = makeWorkflow({ triggerConfig: {} }); // no keyword
    Workflow.find = jest.fn().mockResolvedValue([wf]);

    const result = await matchAutoResponse('HELP');
    expect(result).toBeNull();
  });

  it('matches the first workflow when multiple keywords match', async () => {
    const wf1 = makeWorkflow({ _id: 'wf1', triggerConfig: { keyword: 'INFO' } });
    const wf2 = makeWorkflow({ _id: 'wf2', triggerConfig: { keyword: 'info' } });
    Workflow.find = jest.fn().mockResolvedValue([wf1, wf2]);

    const result = await matchAutoResponse('send me more INFO');
    expect(result._id).toBe('wf1');
  });
});
