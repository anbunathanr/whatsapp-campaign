'use strict';

/**
 * Unit tests for the previewCampaign service function and GET /api/campaigns/:id/preview endpoint.
 *
 * Requirement 4.12: THE Platform SHALL support campaign preview showing rendered
 * Message_Template with sample Dynamic_Variable values.
 *
 * Tests:
 *   Service:
 *     - Returns preview object with campaignId, campaignName, originalTemplate, renderedPreview, sampleContact
 *     - Renders {{name}} placeholder with sample contact name
 *     - Renders {{company}} placeholder with sample contact company
 *     - Renders {{jobTitle}} placeholder with sample contact jobTitle
 *     - Renders {{industry}} placeholder with sample contact industry
 *     - Renders nested {{location.city}} placeholder
 *     - Renders {{contact.name}} (contact. prefix) placeholder
 *     - Leaves no unresolved placeholders for known variables
 *     - Returns 404 when campaign does not exist
 *     - Returns 400 for invalid ObjectId format
 *     - originalTemplate matches the stored messageTemplate
 *
 *   Controller (HTTP):
 *     - GET /api/campaigns/:id/preview returns 200 with preview data
 *     - Returns 404 for non-existent campaign
 *     - Returns 400 for invalid ObjectId
 *     - Requires authentication (401 without token)
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// ── Disable rate limiters so tests don't hit 429 ──────────────────────────────
jest.mock('../../middleware/rateLimiter', () => ({
  apiLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next(),
}));

process.env.NODE_ENV = 'test';

const app = require('../../app');
const Campaign = require('../../models/Campaign');
const User = require('../../models/User');
const Segment = require('../../models/Segment');
const campaignService = require('../../services/campaign.service');
const config = require('../../config');

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
    passwordHash: '$2b$10$irrelevanthashfortest',
    firstName: 'Test',
    lastName: 'User',
    role: 'Campaign_Manager',
    ...overrides,
  });

const createSegment = async (userId, overrides = {}) =>
  Segment.create({
    name: 'Test Segment',
    filterCriteria: { industries: ['Technology'] },
    contactCount: 50,
    createdBy: userId,
    ...overrides,
  });

const createCampaign = async (userId, segmentId, overrides = {}) =>
  Campaign.create({
    name: 'Test Campaign',
    type: 'promotional',
    status: 'draft',
    targetSegment: segmentId,
    messageTemplate: 'Hello {{name}}!',
    createdBy: userId,
    ...overrides,
  });

// ── previewCampaign service — success cases ───────────────────────────────────

describe('previewCampaign service — success: response shape', () => {
  it('returns an object with campaignId, campaignName, originalTemplate, renderedPreview, sampleContact', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result).toHaveProperty('campaignId');
    expect(result).toHaveProperty('campaignName');
    expect(result).toHaveProperty('originalTemplate');
    expect(result).toHaveProperty('renderedPreview');
    expect(result).toHaveProperty('sampleContact');
  });

  it('campaignId matches the requested campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.campaignId.toString()).toBe(campaign._id.toString());
  });

  it('campaignName matches the campaign name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { name: 'Summer Promo' });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.campaignName).toBe('Summer Promo');
  });

  it('originalTemplate matches the stored messageTemplate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const template = 'Hi {{name}}, welcome to {{company}}!';
    const campaign = await createCampaign(user._id, segment._id, { messageTemplate: template });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.originalTemplate).toBe(template);
  });
});

describe('previewCampaign service — success: template rendering', () => {
  it('renders {{name}} with sample contact name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Hello {{name}}!',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('Jane Smith');
    expect(result.renderedPreview).not.toContain('{{name}}');
  });

  it('renders {{company}} with sample contact company', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'From {{company}}',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('Acme Corporation');
    expect(result.renderedPreview).not.toContain('{{company}}');
  });

  it('renders {{jobTitle}} with sample contact jobTitle', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Dear {{jobTitle}}',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('Marketing Director');
    expect(result.renderedPreview).not.toContain('{{jobTitle}}');
  });

  it('renders {{industry}} with sample contact industry', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Industry: {{industry}}',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('Technology');
    expect(result.renderedPreview).not.toContain('{{industry}}');
  });

  it('renders nested {{location.city}} placeholder', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'City: {{location.city}}',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('San Francisco');
    expect(result.renderedPreview).not.toContain('{{location.city}}');
  });

  it('renders {{contact.name}} using the contact. prefix convention', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Hello {{contact.name}}!',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('Jane Smith');
    expect(result.renderedPreview).not.toContain('{{contact.name}}');
  });

  it('renders a template with multiple variables', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Hi {{name}}, as a {{jobTitle}} at {{company}} in {{industry}}, we have an offer for you!',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toContain('Jane Smith');
    expect(result.renderedPreview).toContain('Marketing Director');
    expect(result.renderedPreview).toContain('Acme Corporation');
    expect(result.renderedPreview).toContain('Technology');
    expect(result.renderedPreview).not.toMatch(/\{\{[^}]+\}\}/); // no unresolved placeholders
  });

  it('renders a plain text template (no variables) unchanged', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'This is a plain message with no variables.',
    });

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.renderedPreview).toBe('This is a plain message with no variables.');
  });
});

describe('previewCampaign service — success: sampleContact shape', () => {
  it('sampleContact includes name, phone, jobTitle, company, industry, tags, location', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.previewCampaign(campaign._id.toString());

    expect(result.sampleContact).toHaveProperty('name');
    expect(result.sampleContact).toHaveProperty('phone');
    expect(result.sampleContact).toHaveProperty('jobTitle');
    expect(result.sampleContact).toHaveProperty('company');
    expect(result.sampleContact).toHaveProperty('industry');
    expect(result.sampleContact).toHaveProperty('tags');
    expect(result.sampleContact).toHaveProperty('location');
  });
});

// ── previewCampaign service — error cases ─────────────────────────────────────

describe('previewCampaign service — not found', () => {
  it('throws 404 when campaign does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(
      campaignService.previewCampaign(nonExistentId)
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Campaign not found',
    });
  });
});

describe('previewCampaign service — invalid ID format', () => {
  it('throws 400 for a non-ObjectId string', async () => {
    await expect(
      campaignService.previewCampaign('not-an-id')
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid campaign ID format',
    });
  });

  it('throws 400 for an empty string', async () => {
    await expect(
      campaignService.previewCampaign('')
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── HTTP endpoint tests ───────────────────────────────────────────────────────

describe('GET /api/campaigns/:id/preview — HTTP endpoint', () => {
  let authToken;
  let testUserId;
  let testSegment;

  beforeEach(async () => {
    await Campaign.deleteMany({});
    await User.deleteMany({});
    await Segment.deleteMany({});

    // Create a user and sign a JWT directly (avoids rate limiter on auth endpoint)
    const user = await User.create({
      email: `preview-http-${Date.now()}@example.com`,
      passwordHash: '$2b$10$irrelevanthashfortest',
      firstName: 'Preview',
      lastName: 'Tester',
      role: 'Campaign_Manager',
    });

    testUserId = user._id;
    authToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // Create a segment for campaigns
    testSegment = await Segment.create({
      name: 'Preview Test Segment',
      filterCriteria: { industries: ['Technology'] },
      contactCount: 10,
      createdBy: testUserId,
    });
  });

  it('returns 200 with preview data for a valid campaign', async () => {
    const campaign = await Campaign.create({
      name: 'Preview Test Campaign',
      type: 'promotional',
      status: 'draft',
      targetSegment: testSegment._id,
      messageTemplate: 'Hello {{name}}, welcome to {{company}}!',
      createdBy: testUserId,
    });

    const res = await request(app)
      .get(`/api/campaigns/${campaign._id}/preview`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('renderedPreview');
    expect(res.body.data).toHaveProperty('originalTemplate');
    expect(res.body.data).toHaveProperty('sampleContact');
    expect(res.body.data.renderedPreview).toContain('Jane Smith');
    expect(res.body.data.renderedPreview).toContain('Acme Corporation');
  });

  it('returns 404 for a non-existent campaign', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/campaigns/${nonExistentId}/preview`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for an invalid ObjectId', async () => {
    const res = await request(app)
      .get('/api/campaigns/not-a-valid-id/preview')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when no authentication token is provided', async () => {
    const campaign = await Campaign.create({
      name: 'Auth Test Campaign',
      type: 'promotional',
      status: 'draft',
      targetSegment: testSegment._id,
      messageTemplate: 'Hello {{name}}!',
      createdBy: testUserId,
    });

    const res = await request(app)
      .get(`/api/campaigns/${campaign._id}/preview`);

    expect(res.status).toBe(401);
  });
});
