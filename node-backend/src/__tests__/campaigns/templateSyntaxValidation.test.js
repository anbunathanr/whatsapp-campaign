'use strict';

/**
 * Tests for template syntax validation integrated into campaign creation and update.
 *
 * Validates: Requirements 4.3, 13.1, 13.2, 13.3 (Task 4.6 — Validate template syntax)
 *
 * Ensures that:
 *   - createCampaign rejects templates with invalid syntax (400)
 *   - createCampaign accepts templates with valid syntax
 *   - updateCampaign rejects templates with invalid syntax (400)
 *   - updateCampaign accepts templates with valid syntax
 *   - Error messages are descriptive and reference the specific syntax problem
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const Campaign = require('../../models/Campaign');
const User = require('../../models/User');
const Segment = require('../../models/Segment');
const campaignService = require('../../services/campaign.service');

// ── In-memory MongoDB lifecycle ───────────────────────────────────────────────

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Campaign.deleteMany({});
  await User.deleteMany({});
  await Segment.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const createUser = async (overrides = {}) =>
  User.create({
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: 'irrelevant-hash',
    firstName: 'Test',
    lastName: 'User',
    role: 'Campaign_Manager',
    ...overrides,
  });

const createSegment = async (userId, overrides = {}) =>
  Segment.create({
    name: 'Test Segment',
    filterCriteria: { industries: ['Technology'] },
    contactCount: 10,
    createdBy: userId,
    ...overrides,
  });

const createCampaign = async (userId, segmentId, overrides = {}) =>
  Campaign.create({
    name: 'Base Campaign',
    type: 'promotional',
    status: 'draft',
    targetSegment: segmentId,
    messageTemplate: 'Hello {{name}}!',
    createdBy: userId,
    ...overrides,
  });

const baseCampaignData = (segmentId, overrides = {}) => ({
  name: 'Test Campaign',
  type: 'promotional',
  targetSegment: segmentId.toString(),
  messageTemplate: 'Hello {{name}}!',
  ...overrides,
});

// ── createCampaign — valid templates ─────────────────────────────────────────

describe('createCampaign — valid template syntax', () => {
  it('accepts a template with no placeholders', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const result = await campaignService.createCampaign(
      baseCampaignData(segment._id, { messageTemplate: 'Hello there!' }),
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Hello there!');
  });

  it('accepts a template with a simple {{variable}} placeholder', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const result = await campaignService.createCampaign(
      baseCampaignData(segment._id, { messageTemplate: 'Hi {{name}}, welcome!' }),
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Hi {{name}}, welcome!');
  });

  it('accepts a template with nested dot-notation {{contact.company.name}}', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const result = await campaignService.createCampaign(
      baseCampaignData(segment._id, {
        messageTemplate: 'Your company {{contact.company.name}} is valued.',
      }),
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Your company {{contact.company.name}} is valued.');
  });

  it('accepts a template with multiple valid placeholders', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const result = await campaignService.createCampaign(
      baseCampaignData(segment._id, {
        messageTemplate: 'Hi {{name}}, your role is {{jobTitle}} at {{company}}.',
      }),
      user._id.toString()
    );

    expect(result.messageTemplate).toBe(
      'Hi {{name}}, your role is {{jobTitle}} at {{company}}.'
    );
  });
});

// ── createCampaign — invalid templates ───────────────────────────────────────

describe('createCampaign — invalid template syntax', () => {
  it('rejects a template with an unmatched {{ (missing closing }})', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      campaignService.createCampaign(
        baseCampaignData(segment._id, { messageTemplate: 'Hello {{name' }),
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('rejects a template with an unmatched }} (missing opening {{)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      campaignService.createCampaign(
        baseCampaignData(segment._id, { messageTemplate: 'Hello name}}' }),
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('rejects a template with an empty placeholder {{}}}', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      campaignService.createCampaign(
        baseCampaignData(segment._id, { messageTemplate: 'Hello {{}}!' }),
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('rejects a template with invalid characters in variable name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      campaignService.createCampaign(
        baseCampaignData(segment._id, { messageTemplate: 'Hello {{name!}}' }),
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('includes a descriptive error message identifying the problem', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    let thrownError;
    try {
      await campaignService.createCampaign(
        baseCampaignData(segment._id, { messageTemplate: 'Hello {{name' }),
        user._id.toString()
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.statusCode).toBe(400);
    // Error message should describe the specific problem (unmatched braces)
    expect(thrownError.message).toMatch(/unmatched/i);
  });
});

// ── updateCampaign — valid templates ─────────────────────────────────────────

describe('updateCampaign — valid template syntax', () => {
  it('accepts a valid template update on a draft campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { messageTemplate: 'Updated: Hi {{name}} from {{company}}!' },
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Updated: Hi {{name}} from {{company}}!');
  });

  it('accepts a nested dot-notation template update', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { messageTemplate: 'Company: {{contact.company.name}}' },
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Company: {{contact.company.name}}');
  });
});

// ── updateCampaign — invalid templates ───────────────────────────────────────

describe('updateCampaign — invalid template syntax', () => {
  it('rejects an update with an unmatched {{ placeholder', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { messageTemplate: 'Hello {{name' },
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('rejects an update with an empty placeholder', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { messageTemplate: 'Hello {{}}!' },
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('rejects an update with invalid variable name characters', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { messageTemplate: 'Hello {{first-name}}!' },
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/invalid syntax/i),
    });
  });

  it('does NOT update the campaign when template syntax is invalid', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);
    const originalTemplate = campaign.messageTemplate;

    try {
      await campaignService.updateCampaign(
        campaign._id.toString(),
        { messageTemplate: 'Hello {{name' },
        user._id.toString()
      );
    } catch (_err) {
      // expected
    }

    // Verify the campaign was NOT modified in the database
    const unchanged = await Campaign.findById(campaign._id);
    expect(unchanged.messageTemplate).toBe(originalTemplate);
  });

  it('includes a descriptive error message for invalid update template', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    let thrownError;
    try {
      await campaignService.updateCampaign(
        campaign._id.toString(),
        { messageTemplate: 'Hello {{}}!' },
        user._id.toString()
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.statusCode).toBe(400);
    // Error message should describe the specific problem (empty placeholder)
    expect(thrownError.message).toMatch(/empty/i);
  });
});
