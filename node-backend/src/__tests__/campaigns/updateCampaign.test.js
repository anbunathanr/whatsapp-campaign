'use strict';

/**
 * Unit tests for the updateCampaign service function (Task 4.3)
 *
 * Tests:
 *   - Successfully updates allowed fields on a draft campaign
 *   - Successfully updates allowed fields on a scheduled campaign
 *   - Rejects updates when campaign status is executing, completed, archived, or cancelled
 *   - Returns 400 for invalid ObjectId format
 *   - Returns 404 when campaign does not exist
 *   - Returns 404 when new targetSegment does not exist
 *   - Validates individual field constraints (name, type, scheduledAt, mediaAttachment)
 *   - Records lastModifiedBy on every successful update
 *   - Ignores read-only fields (status, metrics, createdBy)
 *   - Allows clearing scheduledAt
 *   - Updates estimatedRecipients when targetSegment changes
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
    name: 'Original Campaign',
    type: 'promotional',
    status: 'draft',
    targetSegment: segmentId,
    messageTemplate: 'Hello {{name}}!',
    createdBy: userId,
    ...overrides,
  });

// ── updateCampaign — success: draft campaign ──────────────────────────────────

describe('updateCampaign — success on draft campaign', () => {
  it('updates the campaign name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: 'Updated Name' },
      user._id.toString()
    );

    expect(result.name).toBe('Updated Name');
  });

  it('updates the campaign type', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { type: 'reminder' },
      user._id.toString()
    );

    expect(result.type).toBe('reminder');
  });

  it('updates the messageTemplate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { messageTemplate: 'Hi {{name}}, new message!' },
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Hi {{name}}, new message!');
  });

  it('updates targetSegment and recalculates estimatedRecipients', async () => {
    const user = await createUser();
    const oldSegment = await createSegment(user._id, { contactCount: 50 });
    const newSegment = await createSegment(user._id, { name: 'New Segment', contactCount: 200 });
    const campaign = await createCampaign(user._id, oldSegment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { targetSegment: newSegment._id.toString() },
      user._id.toString()
    );

    expect(result.targetSegment._id.toString()).toBe(newSegment._id.toString());
    expect(result.estimatedRecipients).toBe(200);
  });

  it('sets scheduledAt to a future date', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { scheduledAt: futureDate },
      user._id.toString()
    );

    expect(new Date(result.scheduledAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('clears scheduledAt when null is provided', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const futureDate = new Date(Date.now() + 3600 * 1000);
    const campaign = await createCampaign(user._id, segment._id, { scheduledAt: futureDate });

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { scheduledAt: null },
      user._id.toString()
    );

    expect(result.scheduledAt == null).toBe(true);
  });

  it('updates mediaAttachment', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { mediaAttachment: { type: 'image', url: 'https://example.com/img.jpg', filename: 'img.jpg', size: 1024 } },
      user._id.toString()
    );

    expect(result.mediaAttachment.type).toBe('image');
    expect(result.mediaAttachment.url).toBe('https://example.com/img.jpg');
  });

  it('records lastModifiedBy as the updating user', async () => {
    const creator = await createUser({ firstName: 'Alice', email: 'alice@example.com' });
    const modifier = await createUser({ firstName: 'Bob', email: 'bob@example.com' });
    const segment = await createSegment(creator._id);
    const campaign = await createCampaign(creator._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: 'Modified' },
      modifier._id.toString()
    );

    expect(result.lastModifiedBy).toBeDefined();
    expect(result.lastModifiedBy.email).toBe('bob@example.com');
  });

  it('returns a plain object (not a Mongoose document)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: 'Plain Object Test' },
      user._id.toString()
    );

    expect(typeof result.save).toBe('undefined');
  });

  it('trims whitespace from name and messageTemplate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: '  Trimmed Name  ', messageTemplate: '  Trimmed Template  ' },
      user._id.toString()
    );

    expect(result.name).toBe('Trimmed Name');
    expect(result.messageTemplate).toBe('Trimmed Template');
  });

  it('does not change fields that are not included in the update', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { type: 'festival' });

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: 'Only Name Changed' },
      user._id.toString()
    );

    expect(result.type).toBe('festival');
    expect(result.messageTemplate).toBe('Hello {{name}}!');
  });
});

// ── updateCampaign — success: scheduled campaign ──────────────────────────────

describe('updateCampaign — success on scheduled campaign', () => {
  it('allows updating a scheduled campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const futureDate = new Date(Date.now() + 3600 * 1000);
    const campaign = await createCampaign(user._id, segment._id, {
      status: 'scheduled',
      scheduledAt: futureDate,
    });

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: 'Updated Scheduled Campaign' },
      user._id.toString()
    );

    expect(result.name).toBe('Updated Scheduled Campaign');
    expect(result.status).toBe('scheduled');
  });
});

// ── updateCampaign — status guard ─────────────────────────────────────────────

describe('updateCampaign — status guard (non-editable states)', () => {
  const nonEditableStatuses = ['executing', 'completed', 'archived', 'cancelled'];

  nonEditableStatuses.forEach((status) => {
    it(`throws 409 when campaign status is '${status}'`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await createCampaign(user._id, segment._id, { status });

      await expect(
        campaignService.updateCampaign(
          campaign._id.toString(),
          { name: 'Should Fail' },
          user._id.toString()
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  it('error message mentions the current status', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'completed' });

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { name: 'Should Fail' },
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('completed'),
    });
  });
});

// ── updateCampaign — not found ────────────────────────────────────────────────

describe('updateCampaign — not found', () => {
  it('throws 404 when campaign does not exist', async () => {
    const user = await createUser();
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(
      campaignService.updateCampaign(nonExistentId, { name: 'Ghost' }, user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Campaign not found',
    });
  });

  it('throws 404 when new targetSegment does not exist', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);
    const nonExistentSegmentId = new mongoose.Types.ObjectId().toString();

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { targetSegment: nonExistentSegmentId },
        user._id.toString()
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Target segment not found',
    });
  });
});

// ── updateCampaign — invalid ID ───────────────────────────────────────────────

describe('updateCampaign — invalid ID format', () => {
  it('throws 400 for a non-ObjectId string', async () => {
    const user = await createUser();

    await expect(
      campaignService.updateCampaign('not-an-id', { name: 'Test' }, user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid campaign ID format',
    });
  });

  it('throws 400 for an empty string', async () => {
    const user = await createUser();

    await expect(
      campaignService.updateCampaign('', { name: 'Test' }, user._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── updateCampaign — field validation ────────────────────────────────────────

describe('updateCampaign — field validation', () => {
  it('throws 400 when name is an empty string', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { name: '   ' },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when type is invalid', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { type: 'invalid_type' },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when targetSegment is not a valid ObjectId', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { targetSegment: 'bad-id' },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when messageTemplate is an empty string', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { messageTemplate: '' },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when scheduledAt is in the past', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { scheduledAt: pastDate },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when scheduledAt is not a valid date string', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { scheduledAt: 'not-a-date' },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when mediaAttachment.type is invalid', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    await expect(
      campaignService.updateCampaign(
        campaign._id.toString(),
        { mediaAttachment: { type: 'video' } },
        user._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── updateCampaign — read-only field protection ───────────────────────────────

describe('updateCampaign — read-only field protection', () => {
  it('does not change status even if provided in updates', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id, { status: 'draft' });

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { status: 'completed', name: 'Status Ignored' },
      user._id.toString()
    );

    // status should remain 'draft' — the service ignores the status field in updates
    expect(result.status).toBe('draft');
  });

  it('does not reset delivery metrics when updating', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await createCampaign(user._id, segment._id);

    // Manually set some metrics
    await Campaign.findByIdAndUpdate(campaign._id, { messagesSent: 100, messagesDelivered: 80 });

    const result = await campaignService.updateCampaign(
      campaign._id.toString(),
      { name: 'Metrics Preserved' },
      user._id.toString()
    );

    expect(result.messagesSent).toBe(100);
    expect(result.messagesDelivered).toBe(80);
  });
});
