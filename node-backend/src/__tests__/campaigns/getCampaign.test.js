'use strict';

/**
 * Unit tests for the getCampaignById service function (Task 4.3)
 *
 * Tests:
 *   - Returns campaign with populated fields when found
 *   - Returns 404 when campaign does not exist
 *   - Returns 400 for invalid ObjectId format
 *   - Populates targetSegment, createdBy, and lastModifiedBy
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

// ── getCampaignById — success cases ──────────────────────────────────────────

describe('getCampaignById — success', () => {
  it('returns the campaign when a valid ID is provided', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.getCampaignById(campaign._id.toString());

    expect(result).toBeDefined();
    expect(result._id.toString()).toBe(campaign._id.toString());
    expect(result.name).toBe('Test Campaign');
    expect(result.type).toBe('promotional');
    expect(result.status).toBe('draft');
  });

  it('populates targetSegment with name and contactCount', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id, { name: 'Tech Segment', contactCount: 200 });
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.getCampaignById(campaign._id.toString());

    expect(result.targetSegment).toBeDefined();
    expect(result.targetSegment.name).toBe('Tech Segment');
    expect(result.targetSegment.contactCount).toBe(200);
    // Should not expose filterCriteria (not in select)
    expect(result.targetSegment.filterCriteria).toBeUndefined();
  });

  it('populates createdBy with firstName, lastName, and email', async () => {
    const user = await createUser({ firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' });
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.getCampaignById(campaign._id.toString());

    expect(result.createdBy).toBeDefined();
    expect(result.createdBy.firstName).toBe('Alice');
    expect(result.createdBy.lastName).toBe('Smith');
    expect(result.createdBy.email).toBe('alice@example.com');
    // Should not expose passwordHash
    expect(result.createdBy.passwordHash).toBeUndefined();
  });

  it('populates lastModifiedBy when set', async () => {
    const creator = await createUser({ firstName: 'Alice', lastName: 'Smith' });
    const modifier = await createUser({ firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' });
    const segment = await createSegment(creator._id);
    const campaign = await createCampaign(creator._id, segment._id, {
      lastModifiedBy: modifier._id,
    });

    const result = await campaignService.getCampaignById(campaign._id.toString());

    expect(result.lastModifiedBy).toBeDefined();
    expect(result.lastModifiedBy.firstName).toBe('Bob');
    expect(result.lastModifiedBy.lastName).toBe('Jones');
    expect(result.lastModifiedBy.email).toBe('bob@example.com');
  });

  it('returns null for lastModifiedBy when not set', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.getCampaignById(campaign._id.toString());

    // lastModifiedBy is not set, should be null/undefined
    expect(result.lastModifiedBy == null).toBe(true);
  });

  it('returns a plain object (lean result)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.getCampaignById(campaign._id.toString());

    // Lean result should not have Mongoose document methods
    expect(typeof result.save).toBe('undefined');
    expect(typeof result.toObject).toBe('undefined');
  });

  it('returns all expected campaign fields', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Hi {{name}}, check out our offer!',
      estimatedRecipients: 50,
    });

    const result = await campaignService.getCampaignById(campaign._id.toString());

    expect(result.messageTemplate).toBe('Hi {{name}}, check out our offer!');
    expect(result.estimatedRecipients).toBe(50);
    expect(result.messagesSent).toBe(0);
    expect(result.messagesDelivered).toBe(0);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});

// ── getCampaignById — not found ───────────────────────────────────────────────

describe('getCampaignById — not found', () => {
  it('throws a 404 error when campaign does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(campaignService.getCampaignById(nonExistentId)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Campaign not found',
    });
  });

  it('throws 404 after campaign is deleted', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);
    const id = campaign._id.toString();

    await Campaign.findByIdAndDelete(id);

    await expect(campaignService.getCampaignById(id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ── getCampaignById — invalid ID ──────────────────────────────────────────────

describe('getCampaignById — invalid ID format', () => {
  it('throws a 400 error for a non-ObjectId string', async () => {
    await expect(campaignService.getCampaignById('not-an-id')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid campaign ID format',
    });
  });

  it('throws a 400 error for an empty string', async () => {
    await expect(campaignService.getCampaignById('')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws a 400 error for a numeric value', async () => {
    await expect(campaignService.getCampaignById('12345')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws a 400 error for a partially valid ObjectId', async () => {
    await expect(campaignService.getCampaignById('507f1f77bcf86cd79943901')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
