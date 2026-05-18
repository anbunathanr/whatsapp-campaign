'use strict';

/**
 * Unit tests for the scheduleCampaign service function (Task 4.4)
 *
 * Requirement 4.7: WHEN a User schedules a Campaign, THE Platform SHALL validate
 * that the scheduled time is in the future (UTC).
 *
 * Requirement 6.1: WHEN a User schedules a Campaign, THE Platform SHALL store
 * the execution timestamp in UTC format.
 *
 * Tests:
 *   - Successfully schedules a draft campaign
 *   - Successfully reschedules a scheduled campaign
 *   - Sets status to 'scheduled'
 *   - Stores scheduledAt timestamp in UTC
 *   - Records lastModifiedBy on schedule
 *   - Returns 400 for missing scheduledAt
 *   - Returns 400 for invalid date format
 *   - Returns 400 for past date
 *   - Returns 400 for current time (not future)
 *   - Returns 404 when campaign does not exist
 *   - Returns 400 for invalid ObjectId format
 *   - Returns 409 when campaign is 'executing'
 *   - Returns 409 when campaign is 'completed'
 *   - Returns 409 when campaign is 'archived'
 *   - Returns 409 when campaign is 'cancelled'
 *   - Populates targetSegment, createdBy, lastModifiedBy in the response
 *   - Returns a plain object (not a Mongoose document)
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

// ── scheduleCampaign — success cases ──────────────────────────────────────────

describe('scheduleCampaign — success: schedulable statuses', () => {
  it('schedules a draft campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'draft' });

    const futureDate = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      user._id.toString()
    );

    expect(result.status).toBe('scheduled');
    expect(new Date(result.scheduledAt).getTime()).toBe(futureDate.getTime());
  });

  it('reschedules a scheduled campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const oldDate = new Date(Date.now() + 3600 * 1000);
    const campaign = await createCampaign(user._id, segment._id, {
      status: 'scheduled',
      scheduledAt: oldDate,
    });

    const newDate = new Date(Date.now() + 7200 * 1000); // 2 hours from now
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      newDate.toISOString(),
      user._id.toString()
    );

    expect(result.status).toBe('scheduled');
    expect(new Date(result.scheduledAt).getTime()).toBe(newDate.getTime());
  });

  it('sets status to scheduled', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const futureDate = new Date(Date.now() + 3600 * 1000);
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      user._id.toString()
    );

    expect(result.status).toBe('scheduled');

    // Verify in database
    const found = await Campaign.findById(campaign._id);
    expect(found.status).toBe('scheduled');
  });

  it('stores scheduledAt timestamp in UTC', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const futureDate = new Date(Date.now() + 3600 * 1000);
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      user._id.toString()
    );

    expect(result.scheduledAt).toBeDefined();
    expect(new Date(result.scheduledAt).getTime()).toBe(futureDate.getTime());

    // Verify in database
    const found = await Campaign.findById(campaign._id);
    expect(found.scheduledAt.getTime()).toBe(futureDate.getTime());
  });

  it('records lastModifiedBy as the scheduling user', async () => {
    const creator = await createUser({ firstName: 'Alice', email: 'alice@example.com' });
    const scheduler = await createUser({ firstName: 'Bob', email: 'bob@example.com' });
    const segment = await createSegment(creator._id);
    const campaign = await createCampaign(creator._id, segment._id);

    const futureDate = new Date(Date.now() + 3600 * 1000);
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      scheduler._id.toString()
    );

    expect(result.lastModifiedBy).toBeDefined();
    expect(result.lastModifiedBy.email).toBe('bob@example.com');
  });

  it('populates targetSegment in the response', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id, { name: 'My Segment', contactCount: 42 });
    const campaign = await createCampaign(user._id, segment._id);

    const futureDate = new Date(Date.now() + 3600 * 1000);
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      user._id.toString()
    );

    expect(result.targetSegment).toBeDefined();
    expect(result.targetSegment.name).toBe('My Segment');
    expect(result.targetSegment.contactCount).toBe(42);
  });

  it('populates createdBy in the response', async () => {
    const user = await createUser({ firstName: 'Alice', email: 'alice@example.com' });
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const futureDate = new Date(Date.now() + 3600 * 1000);
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      user._id.toString()
    );

    expect(result.createdBy).toBeDefined();
    expect(result.createdBy.email).toBe('alice@example.com');
  });

  it('returns a plain object (not a Mongoose document)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const futureDate = new Date(Date.now() + 3600 * 1000);
    const result = await campaignService.scheduleCampaign(
      campaign._id.toString(),
      futureDate.toISOString(),
      user._id.toString()
    );

    expect(typeof result.save).toBe('undefined');
  });
});

// ── scheduleCampaign — validation errors ──────────────────────────────────────

describe('scheduleCampaign — validation errors', () => {
  it('throws 400 for missing scheduledAt', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.scheduleCampaign(campaign._id.toString(), undefined, user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'scheduledAt is required',
    });
  });

  it('throws 400 for null scheduledAt', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.scheduleCampaign(campaign._id.toString(), null, user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'scheduledAt is required',
    });
  });

  it('throws 400 for empty string scheduledAt', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.scheduleCampaign(campaign._id.toString(), '', user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'scheduledAt is required',
    });
  });

  it('throws 400 for invalid date format', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.scheduleCampaign(
        campaign._id.toString(),
        'not-a-date',
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'scheduledAt must be a valid ISO 8601 date string',
    });
  });

  it('throws 400 for past date', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    await expect(
      campaignService.scheduleCampaign(
        campaign._id.toString(),
        pastDate.toISOString(),
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'scheduledAt must be a future date and time (UTC)',
    });
  });

  it('throws 400 for current time (not future)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const now = new Date();
    await expect(
      campaignService.scheduleCampaign(campaign._id.toString(), now.toISOString(), user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'scheduledAt must be a future date and time (UTC)',
    });
  });

  it('does not change the campaign when validation fails', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const pastDate = new Date(Date.now() - 3600 * 1000);
    await expect(
      campaignService.scheduleCampaign(
        campaign._id.toString(),
        pastDate.toISOString(),
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    const found = await Campaign.findById(campaign._id);
    expect(found.status).toBe('draft');
    expect(found.scheduledAt).toBeUndefined();
  });
});

// ── scheduleCampaign — status guards ──────────────────────────────────────────

describe('scheduleCampaign — status guards', () => {
  const nonSchedulableStatuses = ['executing', 'completed', 'archived', 'cancelled'];

  nonSchedulableStatuses.forEach((status) => {
    it(`throws 409 when campaign status is '${status}'`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await createCampaign(user._id, segment._id, { status });

      const futureDate = new Date(Date.now() + 3600 * 1000);
      await expect(
        campaignService.scheduleCampaign(
          campaign._id.toString(),
          futureDate.toISOString(),
          user._id.toString()
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it(`error message mentions current status '${status}'`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await createCampaign(user._id, segment._id, { status });

      const futureDate = new Date(Date.now() + 3600 * 1000);
      await expect(
        campaignService.scheduleCampaign(
          campaign._id.toString(),
          futureDate.toISOString(),
          user._id.toString()
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining(status),
      });
    });

    it(`does not change the campaign status when schedule is rejected for '${status}'`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await createCampaign(user._id, segment._id, { status });

      const futureDate = new Date(Date.now() + 3600 * 1000);
      await expect(
        campaignService.scheduleCampaign(
          campaign._id.toString(),
          futureDate.toISOString(),
          user._id.toString()
        )
      ).rejects.toMatchObject({ statusCode: 409 });

      const found = await Campaign.findById(campaign._id);
      expect(found.status).toBe(status);
    });
  });
});

// ── scheduleCampaign — not found ──────────────────────────────────────────────

describe('scheduleCampaign — not found', () => {
  it('throws 404 when campaign does not exist', async () => {
    const user = await createUser();
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const futureDate = new Date(Date.now() + 3600 * 1000);

    await expect(
      campaignService.scheduleCampaign(nonExistentId, futureDate.toISOString(), user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Campaign not found',
    });
  });
});

// ── scheduleCampaign — invalid ID ─────────────────────────────────────────────

describe('scheduleCampaign — invalid ID format', () => {
  it('throws 400 for a non-ObjectId string', async () => {
    const user = await createUser();
    const futureDate = new Date(Date.now() + 3600 * 1000);

    await expect(
      campaignService.scheduleCampaign('not-an-id', futureDate.toISOString(), user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid campaign ID format',
    });
  });

  it('throws 400 for an empty string', async () => {
    const user = await createUser();
    const futureDate = new Date(Date.now() + 3600 * 1000);

    await expect(
      campaignService.scheduleCampaign('', futureDate.toISOString(), user._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
