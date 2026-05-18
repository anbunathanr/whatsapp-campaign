'use strict';

/**
 * Unit tests for the Campaign Mongoose schema (Task 4.1)
 *
 * Validates schema structure, field constraints, default values,
 * enum enforcement, and index definitions against the design spec.
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const Campaign = require('../../models/Campaign');
const User = require('../../models/User');
const Segment = require('../../models/Segment');

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

/** Create a minimal User document for use as a reference. */
const createUser = async () =>
  User.create({
    email: `user-${Date.now()}@example.com`,
    passwordHash: 'irrelevant-hash',
    firstName: 'Test',
    lastName: 'User',
    role: 'Campaign_Manager',
  });

/** Create a minimal Segment document for use as a reference. */
const createSegment = async (userId) =>
  Segment.create({
    name: 'Test Segment',
    filterCriteria: { industries: ['Technology'] },
    createdBy: userId,
  });

/** Build a valid campaign payload given user and segment IDs. */
const validPayload = (userId, segmentId) => ({
  name: 'Summer Promo',
  type: 'promotional',
  targetSegment: segmentId,
  messageTemplate: 'Hello {{name}}, check out our summer deals!',
  createdBy: userId,
});

// ── Schema field tests ────────────────────────────────────────────────────────

describe('Campaign schema — required fields', () => {
  it('saves successfully with all required fields provided', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    expect(campaign._id).toBeDefined();
    expect(campaign.name).toBe('Summer Promo');
    expect(campaign.type).toBe('promotional');
    expect(campaign.targetSegment.toString()).toBe(segment._id.toString());
    expect(campaign.messageTemplate).toBe('Hello {{name}}, check out our summer deals!');
    expect(campaign.createdBy.toString()).toBe(user._id.toString());
  });

  it('rejects a campaign without a name', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const { name: _omit, ...payload } = validPayload(user._id, segment._id);

    await expect(Campaign.create(payload)).rejects.toThrow(/name/i);
  });

  it('rejects a campaign without a type', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const { type: _omit, ...payload } = validPayload(user._id, segment._id);

    await expect(Campaign.create(payload)).rejects.toThrow(/type/i);
  });

  it('rejects a campaign without a targetSegment', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const { targetSegment: _omit, ...payload } = validPayload(user._id, segment._id);

    await expect(Campaign.create(payload)).rejects.toThrow(/targetSegment/i);
  });

  it('rejects a campaign without a messageTemplate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const { messageTemplate: _omit, ...payload } = validPayload(user._id, segment._id);

    await expect(Campaign.create(payload)).rejects.toThrow(/messageTemplate/i);
  });

  it('rejects a campaign without a createdBy reference', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const { createdBy: _omit, ...payload } = validPayload(user._id, segment._id);

    await expect(Campaign.create(payload)).rejects.toThrow(/createdBy/i);
  });
});

// ── Type enum ─────────────────────────────────────────────────────────────────

describe('Campaign schema — type enum', () => {
  const VALID_TYPES = ['promotional', 'reminder', 'festival', 'product_launch', 'follow_up'];

  VALID_TYPES.forEach((type) => {
    it(`accepts type "${type}"`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await Campaign.create({ ...validPayload(user._id, segment._id), type });
      expect(campaign.type).toBe(type);
    });
  });

  it('rejects an invalid type value', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      Campaign.create({ ...validPayload(user._id, segment._id), type: 'newsletter' })
    ).rejects.toThrow(/type/i);
  });
});

// ── Status enum and default ───────────────────────────────────────────────────

describe('Campaign schema — status field', () => {
  it('defaults status to "draft" when not provided', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    expect(campaign.status).toBe('draft');
  });

  const VALID_STATUSES = ['draft', 'scheduled', 'executing', 'completed', 'archived', 'cancelled'];

  VALID_STATUSES.forEach((status) => {
    it(`accepts status "${status}"`, async () => {
      const user = await createUser();
      const segment = await createSegment(user._id);
      const campaign = await Campaign.create({
        ...validPayload(user._id, segment._id),
        status,
      });
      expect(campaign.status).toBe(status);
    });
  });

  it('rejects an invalid status value', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      Campaign.create({ ...validPayload(user._id, segment._id), status: 'paused' })
    ).rejects.toThrow(/status/i);
  });
});

// ── scheduledAt field ─────────────────────────────────────────────────────────

describe('Campaign schema — scheduledAt field', () => {
  it('stores a future scheduledAt date correctly', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 day

    const campaign = await Campaign.create({
      ...validPayload(user._id, segment._id),
      status: 'scheduled',
      scheduledAt: futureDate,
    });

    expect(campaign.scheduledAt).toBeInstanceOf(Date);
    expect(campaign.scheduledAt.getTime()).toBeCloseTo(futureDate.getTime(), -3);
  });

  it('allows scheduledAt to be omitted (draft campaigns)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    expect(campaign.scheduledAt).toBeUndefined();
  });
});

// ── mediaAttachment sub-document ──────────────────────────────────────────────

describe('Campaign schema — mediaAttachment field', () => {
  it('stores a valid image attachment', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const campaign = await Campaign.create({
      ...validPayload(user._id, segment._id),
      mediaAttachment: {
        type: 'image',
        url: 'https://cdn.example.com/promo.jpg',
        filename: 'promo.jpg',
        size: 204800,
      },
    });

    expect(campaign.mediaAttachment.type).toBe('image');
    expect(campaign.mediaAttachment.url).toBe('https://cdn.example.com/promo.jpg');
    expect(campaign.mediaAttachment.filename).toBe('promo.jpg');
    expect(campaign.mediaAttachment.size).toBe(204800);
  });

  it('stores a valid pdf attachment', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const campaign = await Campaign.create({
      ...validPayload(user._id, segment._id),
      mediaAttachment: {
        type: 'pdf',
        url: 'https://cdn.example.com/brochure.pdf',
        filename: 'brochure.pdf',
        size: 1048576,
      },
    });

    expect(campaign.mediaAttachment.type).toBe('pdf');
  });

  it('rejects an invalid mediaAttachment type', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await expect(
      Campaign.create({
        ...validPayload(user._id, segment._id),
        mediaAttachment: { type: 'video' },
      })
    ).rejects.toThrow(/mediaAttachment/i);
  });
});

// ── Delivery metrics defaults ─────────────────────────────────────────────────

describe('Campaign schema — delivery metrics', () => {
  it('initialises all metric counters to 0 by default', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    expect(campaign.messagesSent).toBe(0);
    expect(campaign.messagesDelivered).toBe(0);
    expect(campaign.messagesRead).toBe(0);
    expect(campaign.messagesFailed).toBe(0);
    expect(campaign.messagesReplied).toBe(0);
    expect(campaign.estimatedRecipients).toBe(0);
    expect(campaign.actualRecipients).toBe(0);
  });

  it('persists updated metric values correctly', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    await Campaign.findByIdAndUpdate(campaign._id, {
      messagesSent: 500,
      messagesDelivered: 480,
      messagesRead: 300,
      messagesFailed: 20,
      messagesReplied: 50,
    });

    const updated = await Campaign.findById(campaign._id);
    expect(updated.messagesSent).toBe(500);
    expect(updated.messagesDelivered).toBe(480);
    expect(updated.messagesRead).toBe(300);
    expect(updated.messagesFailed).toBe(20);
    expect(updated.messagesReplied).toBe(50);
  });
});

// ── Optional reference fields ─────────────────────────────────────────────────

describe('Campaign schema — optional reference fields', () => {
  it('stores a lastModifiedBy reference', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const campaign = await Campaign.create({
      ...validPayload(user._id, segment._id),
      lastModifiedBy: user._id,
    });

    expect(campaign.lastModifiedBy.toString()).toBe(user._id.toString());
  });

  it('stores a clonedFrom reference to another campaign', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const original = await Campaign.create(validPayload(user._id, segment._id));
    const clone = await Campaign.create({
      ...validPayload(user._id, segment._id),
      name: 'Summer Promo (Clone)',
      clonedFrom: original._id,
    });

    expect(clone.clonedFrom.toString()).toBe(original._id.toString());
  });
});

// ── Timestamps ────────────────────────────────────────────────────────────────

describe('Campaign schema — timestamps', () => {
  it('automatically sets createdAt and updatedAt on creation', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const before = new Date();

    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    const after = new Date();
    expect(campaign.createdAt).toBeInstanceOf(Date);
    expect(campaign.updatedAt).toBeInstanceOf(Date);
    expect(campaign.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(campaign.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('updates updatedAt when the document is modified', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    const campaign = await Campaign.create(validPayload(user._id, segment._id));

    const originalUpdatedAt = campaign.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await Campaign.findByIdAndUpdate(
      campaign._id,
      { name: 'Updated Name' },
      { new: true }
    );

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
  });
});

// ── Indexes ───────────────────────────────────────────────────────────────────

describe('Campaign schema — indexes', () => {
  it('has the expected indexes defined on the schema', async () => {
    // Sync indexes to the in-memory DB
    await Campaign.syncIndexes();

    const indexes = await Campaign.collection.indexes();
    const indexedFields = indexes.map((idx) => Object.keys(idx.key).join(','));

    // Required indexes per design spec (Req 11.6)
    expect(indexedFields).toContain('status');
    expect(indexedFields).toContain('scheduledAt');
    expect(indexedFields).toContain('createdBy');
    expect(indexedFields).toContain('type');
    expect(indexedFields).toContain('createdAt');
  });
});

// ── Populate references ───────────────────────────────────────────────────────

describe('Campaign schema — population of references', () => {
  it('populates targetSegment correctly', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await Campaign.create(validPayload(user._id, segment._id));

    const populated = await Campaign.findOne().populate('targetSegment');
    expect(populated.targetSegment.name).toBe('Test Segment');
  });

  it('populates createdBy correctly', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await Campaign.create(validPayload(user._id, segment._id));

    const populated = await Campaign.findOne().populate('createdBy');
    expect(populated.createdBy.firstName).toBe('Test');
  });
});
