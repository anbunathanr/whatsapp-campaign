'use strict';

/**
 * Unit tests for the cloneCampaign service function
 *
 * Requirement 4.6: THE Platform SHALL support Campaign_Clone functionality to
 * duplicate existing campaigns.
 *
 * Tests:
 *   - Successfully clones a campaign and returns 201-equivalent data
 *   - Cloned campaign name is prefixed with "Copy of "
 *   - Cloned campaign status is 'draft'
 *   - Execution metrics are reset to 0
 *   - scheduledAt, executedAt, completedAt are NOT copied
 *   - clonedFrom references the source campaign's _id
 *   - createdBy and lastModifiedBy are set to the requesting user
 *   - mediaAttachment is copied when present
 *   - mediaAttachment is not copied when type is 'none'
 *   - Returns 404 when source campaign does not exist
 *   - Returns 400 for invalid ObjectId format
 *   - Populates targetSegment, createdBy, lastModifiedBy, clonedFrom in the response
 *   - Returns a plain object (not a Mongoose document)
 *   - Source campaign is not modified
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

// ── cloneCampaign — success cases ─────────────────────────────────────────────

describe('cloneCampaign — success: basic cloning', () => {
  it('creates a new campaign document in the database', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id);

    await campaignService.cloneCampaign(source._id.toString(), user._id.toString());

    const count = await Campaign.countDocuments();
    expect(count).toBe(2); // source + clone
  });

  it('prefixes the cloned campaign name with "Copy of "', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, { name: 'Summer Sale' });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.name).toBe('Copy of Summer Sale');
  });

  it('sets the cloned campaign status to draft', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, { status: 'completed' });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.status).toBe('draft');
  });

  it('copies the campaign type', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, { type: 'reminder' });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.type).toBe('reminder');
  });

  it('copies the messageTemplate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, {
      messageTemplate: 'Hi {{name}}, check out our offer!',
    });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.messageTemplate).toBe('Hi {{name}}, check out our offer!');
  });

  it('copies the targetSegment', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.targetSegment._id.toString()).toBe(segment._id.toString());
  });

  it('sets clonedFrom to the source campaign _id', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.clonedFrom._id.toString()).toBe(source._id.toString());
  });

  it('sets createdBy to the requesting user', async () => {
    const creator = await createUser({ email: 'creator@example.com' });
    const cloner = await createUser({ email: 'cloner@example.com' });
    const segment = await createSegment(creator._id);
    const source = await createCampaign(creator._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      cloner._id.toString()
    );

    expect(result.createdBy.email).toBe('cloner@example.com');
  });

  it('sets lastModifiedBy to the requesting user', async () => {
    const creator = await createUser({ email: 'creator@example.com' });
    const cloner = await createUser({ email: 'cloner@example.com' });
    const segment = await createSegment(creator._id);
    const source = await createCampaign(creator._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      cloner._id.toString()
    );

    expect(result.lastModifiedBy.email).toBe('cloner@example.com');
  });
});

// ── cloneCampaign — metrics reset ─────────────────────────────────────────────

describe('cloneCampaign — execution metrics are reset to 0', () => {
  const metricFields = [
    'actualRecipients',
    'messagesSent',
    'messagesDelivered',
    'messagesRead',
    'messagesFailed',
    'messagesReplied',
  ];

  metricFields.forEach((field) => {
    it(`resets ${field} to 0`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const source = await createCampaign(user._id, segment._id, {
        [field]: 999,
      });

      const result = await campaignService.cloneCampaign(
        source._id.toString(),
        user._id.toString()
      );

      expect(result[field]).toBe(0);
    });
  });
});

// ── cloneCampaign — excluded fields ──────────────────────────────────────────

describe('cloneCampaign — excluded fields are not copied', () => {
  it('does not copy scheduledAt', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const futureDate = new Date(Date.now() + 86400000); // 1 day from now
    const source = await createCampaign(user._id, segment._id, {
      scheduledAt: futureDate,
      status: 'scheduled',
    });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.scheduledAt).toBeUndefined();
  });

  it('does not copy executedAt', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, {
      executedAt: new Date(),
      status: 'completed',
    });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.executedAt).toBeUndefined();
  });

  it('does not copy completedAt', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, {
      completedAt: new Date(),
      status: 'completed',
    });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.completedAt).toBeUndefined();
  });

  it('assigns a new _id to the cloned campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result._id.toString()).not.toBe(source._id.toString());
  });
});

// ── cloneCampaign — mediaAttachment handling ──────────────────────────────────

describe('cloneCampaign — mediaAttachment handling', () => {
  it('copies mediaAttachment when type is image', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, {
      mediaAttachment: {
        type: 'image',
        url: 'https://example.com/image.jpg',
        filename: 'image.jpg',
        size: 102400,
      },
    });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.mediaAttachment).toBeDefined();
    expect(result.mediaAttachment.type).toBe('image');
    expect(result.mediaAttachment.url).toBe('https://example.com/image.jpg');
  });

  it('copies mediaAttachment when type is pdf', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, {
      mediaAttachment: {
        type: 'pdf',
        url: 'https://example.com/doc.pdf',
        filename: 'doc.pdf',
        size: 204800,
      },
    });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.mediaAttachment.type).toBe('pdf');
    expect(result.mediaAttachment.url).toBe('https://example.com/doc.pdf');
  });
});

// ── cloneCampaign — source campaign unchanged ─────────────────────────────────

describe('cloneCampaign — source campaign is not modified', () => {
  it('does not change the source campaign status', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, { status: 'completed' });

    await campaignService.cloneCampaign(source._id.toString(), user._id.toString());

    const found = await Campaign.findById(source._id);
    expect(found.status).toBe('completed');
  });

  it('does not change the source campaign name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, { name: 'Original Name' });

    await campaignService.cloneCampaign(source._id.toString(), user._id.toString());

    const found = await Campaign.findById(source._id);
    expect(found.name).toBe('Original Name');
  });
});

// ── cloneCampaign — population ────────────────────────────────────────────────

describe('cloneCampaign — populated references', () => {
  it('populates targetSegment with name and contactCount', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id, { name: 'VIP Segment', contactCount: 100 });
    const source = await createCampaign(user._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.targetSegment.name).toBe('VIP Segment');
    expect(result.targetSegment.contactCount).toBe(100);
  });

  it('populates clonedFrom with the source campaign name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id, { name: 'Original Campaign' });

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(result.clonedFrom.name).toBe('Original Campaign');
  });

  it('returns a plain object (not a Mongoose document)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const source = await createCampaign(user._id, segment._id);

    const result = await campaignService.cloneCampaign(
      source._id.toString(),
      user._id.toString()
    );

    expect(typeof result.save).toBe('undefined');
  });
});

// ── cloneCampaign — not found ─────────────────────────────────────────────────

describe('cloneCampaign — not found', () => {
  it('throws 404 when source campaign does not exist', async () => {
    const user = await createUser();
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(
      campaignService.cloneCampaign(nonExistentId, user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Campaign not found',
    });
  });
});

// ── cloneCampaign — invalid ID ────────────────────────────────────────────────

describe('cloneCampaign — invalid ID format', () => {
  it('throws 400 for a non-ObjectId string', async () => {
    const user = await createUser();

    await expect(
      campaignService.cloneCampaign('not-an-id', user._id.toString())
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid campaign ID format',
    });
  });

  it('throws 400 for an empty string', async () => {
    const user = await createUser();

    await expect(
      campaignService.cloneCampaign('', user._id.toString())
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
