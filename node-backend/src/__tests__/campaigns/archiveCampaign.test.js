'use strict';

/**
 * Unit tests for the archiveCampaign service function (Task 4.3)
 *
 * Requirement 4.10: WHEN a User deletes a Campaign, THE Platform SHALL archive
 * the campaign rather than permanently removing it.
 *
 * Tests:
 *   - Successfully archives a draft campaign
 *   - Successfully archives a scheduled campaign
 *   - Successfully archives a completed campaign
 *   - Successfully archives a cancelled campaign
 *   - Returns 409 when campaign is currently 'executing'
 *   - Returns 404 when campaign does not exist
 *   - Returns 400 for invalid ObjectId format
 *   - Sets status to 'archived' (not deleted from DB)
 *   - Records lastModifiedBy on archive
 *   - Is idempotent: archiving an already-archived campaign returns it unchanged
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

// ── archiveCampaign — success cases ──────────────────────────────────────────

describe('archiveCampaign — success: archivable statuses', () => {
  const archivableStatuses = ['draft', 'scheduled', 'completed', 'cancelled'];

  archivableStatuses.forEach((status) => {
    it(`archives a campaign with status '${status}'`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await createCampaign(user._id, segment._id, { status });

      const result = await campaignService.archiveCampaign(
        campaign._id.toString(),
        user._id.toString()
      );

      expect(result.status).toBe('archived');
    });
  });

  it('does not permanently delete the campaign from the database', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await campaignService.archiveCampaign(campaign._id.toString(), user._id.toString());

    const found = await Campaign.findById(campaign._id);
    expect(found).not.toBeNull();
    expect(found.status).toBe('archived');
  });

  it('records lastModifiedBy as the archiving user', async () => {
    const creator = await createUser({ firstName: 'Alice', email: 'alice@example.com' });
    const archiver = await createUser({ firstName: 'Bob', email: 'bob@example.com' });
    const segment = await createSegment(creator._id);
    const campaign = await createCampaign(creator._id, segment._id);

    const result = await campaignService.archiveCampaign(
      campaign._id.toString(),
      archiver._id.toString()
    );

    expect(result.lastModifiedBy).toBeDefined();
    expect(result.lastModifiedBy.email).toBe('bob@example.com');
  });

  it('populates targetSegment in the response', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id, { name: 'My Segment', contactCount: 42 });
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.archiveCampaign(
      campaign._id.toString(),
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

    const result = await campaignService.archiveCampaign(
      campaign._id.toString(),
      user._id.toString()
    );

    expect(result.createdBy).toBeDefined();
    expect(result.createdBy.email).toBe('alice@example.com');
  });

  it('returns a plain object (not a Mongoose document)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.archiveCampaign(
      campaign._id.toString(),
      user._id.toString()
    );

    expect(typeof result.save).toBe('undefined');
  });
});

// ── archiveCampaign — idempotency ─────────────────────────────────────────────

describe('archiveCampaign — idempotency', () => {
  it('returns the campaign unchanged when it is already archived', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'archived' });

    const result = await campaignService.archiveCampaign(
      campaign._id.toString(),
      user._id.toString()
    );

    expect(result.status).toBe('archived');
    // Verify it's still in the DB
    const found = await Campaign.findById(campaign._id);
    expect(found.status).toBe('archived');
  });
});

// ── archiveCampaign — executing guard ─────────────────────────────────────────

describe('archiveCampaign — executing guard', () => {
  it('throws 409 when campaign status is executing', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'executing' });

    await expect(
      campaignService.archiveCampaign(campaign._id.toString(), user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('error message mentions executing status', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'executing' });

    await expect(
      campaignService.archiveCampaign(campaign._id.toString(), user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('executing'),
    });
  });

  it('does not change the campaign status when archive is rejected', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'executing' });

    await expect(
      campaignService.archiveCampaign(campaign._id.toString(), user._id.toString())
    ).rejects.toMatchObject({ statusCode: 409 });

    const found = await Campaign.findById(campaign._id);
    expect(found.status).toBe('executing');
  });
});

// ── archiveCampaign — not found ───────────────────────────────────────────────

describe('archiveCampaign — not found', () => {
  it('throws 404 when campaign does not exist', async () => {
    const user = await createUser();
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(
      campaignService.archiveCampaign(nonExistentId, user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Campaign not found',
    });
  });
});

// ── archiveCampaign — invalid ID ──────────────────────────────────────────────

describe('archiveCampaign — invalid ID format', () => {
  it('throws 400 for a non-ObjectId string', async () => {
    const user = await createUser();

    await expect(
      campaignService.archiveCampaign('not-an-id', user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid campaign ID format',
    });
  });

  it('throws 400 for an empty string', async () => {
    const user = await createUser();

    await expect(
      campaignService.archiveCampaign('', user._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
