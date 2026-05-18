'use strict';

/**
 * Unit tests for the listCampaigns service function (Task 4.3)
 *
 * Tests pagination, filtering by status/type/search/date range,
 * sorting, and population of related documents.
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

const createUser = async () =>
  User.create({
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: 'irrelevant-hash',
    firstName: 'Test',
    lastName: 'User',
    role: 'Campaign_Manager',
  });

const createSegment = async (userId) =>
  Segment.create({
    name: 'Test Segment',
    filterCriteria: { industries: ['Technology'] },
    contactCount: 100,
    createdBy: userId,
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

// ── Basic listing ─────────────────────────────────────────────────────────────

describe('listCampaigns — basic listing', () => {
  it('returns an empty list when no campaigns exist', async () => {
    const result = await campaignService.listCampaigns({}, {});

    expect(result.campaigns).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('returns all campaigns when no filters are applied', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Campaign A' });
    await createCampaign(user._id, segment._id, { name: 'Campaign B' });
    await createCampaign(user._id, segment._id, { name: 'Campaign C' });

    const result = await campaignService.listCampaigns({}, {});

    expect(result.campaigns).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('populates targetSegment with name and contactCount', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    await createCampaign(user._id, segment._id);

    const result = await campaignService.listCampaigns({}, {});

    expect(result.campaigns[0].targetSegment).toBeDefined();
    expect(result.campaigns[0].targetSegment.name).toBe('Test Segment');
    expect(result.campaigns[0].targetSegment.contactCount).toBe(100);
  });

  it('populates createdBy with firstName, lastName, and email', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    await createCampaign(user._id, segment._id);

    const result = await campaignService.listCampaigns({}, {});

    expect(result.campaigns[0].createdBy).toBeDefined();
    expect(result.campaigns[0].createdBy.firstName).toBe('Test');
    expect(result.campaigns[0].createdBy.lastName).toBe('User');
    expect(result.campaigns[0].createdBy.email).toBeDefined();
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('listCampaigns — pagination', () => {
  it('defaults to page 1 and limit 10', async () => {
    const result = await campaignService.listCampaigns({}, {});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('respects custom page and limit parameters', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    // Create 15 campaigns
    for (let i = 0; i < 15; i++) {
      await createCampaign(user._id, segment._id, { name: `Campaign ${i}` });
    }

    const result = await campaignService.listCampaigns({}, { page: 2, limit: 5 });

    expect(result.campaigns).toHaveLength(5);
    expect(result.total).toBe(15);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
  });

  it('returns correct campaigns for page 1 with limit 3', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    for (let i = 0; i < 5; i++) {
      await createCampaign(user._id, segment._id, { name: `Campaign ${i}` });
    }

    const result = await campaignService.listCampaigns({}, { page: 1, limit: 3 });

    expect(result.campaigns).toHaveLength(3);
    expect(result.total).toBe(5);
  });

  it('returns empty array when page exceeds total pages', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    await createCampaign(user._id, segment._id);

    const result = await campaignService.listCampaigns({}, { page: 99, limit: 10 });

    expect(result.campaigns).toHaveLength(0);
    expect(result.total).toBe(1);
  });

  it('caps limit at 100', async () => {
    const result = await campaignService.listCampaigns({}, { limit: 999 });

    expect(result.limit).toBe(100);
  });

  it('enforces minimum limit of 1 for positive values', async () => {
    const result = await campaignService.listCampaigns({}, { limit: 1 });

    expect(result.limit).toBe(1);
  });

  it('falls back to default limit of 10 when limit is 0 or invalid', async () => {
    const result = await campaignService.listCampaigns({}, { limit: 0 });

    expect(result.limit).toBe(10);
  });
});

// ── Filter by status ──────────────────────────────────────────────────────────

describe('listCampaigns — filter by status', () => {
  it('filters campaigns by status "draft"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Draft Campaign', status: 'draft' });
    await createCampaign(user._id, segment._id, { name: 'Completed Campaign', status: 'completed' });

    const result = await campaignService.listCampaigns({ status: 'draft' }, {});

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].name).toBe('Draft Campaign');
    expect(result.campaigns[0].status).toBe('draft');
  });

  it('filters campaigns by status "scheduled"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { status: 'draft' });
    await createCampaign(user._id, segment._id, {
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 86400000),
    });

    const result = await campaignService.listCampaigns({ status: 'scheduled' }, {});

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].status).toBe('scheduled');
  });

  it('returns all campaigns when status filter is invalid (ignored)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { status: 'draft' });
    await createCampaign(user._id, segment._id, { status: 'completed' });

    const result = await campaignService.listCampaigns({ status: 'invalid_status' }, {});

    // Invalid status is ignored, returns all
    expect(result.total).toBe(2);
  });

  it('returns empty list when no campaigns match the status filter', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { status: 'draft' });

    const result = await campaignService.listCampaigns({ status: 'completed' }, {});

    expect(result.campaigns).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ── Filter by type ────────────────────────────────────────────────────────────

describe('listCampaigns — filter by type', () => {
  it('filters campaigns by type "promotional"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { type: 'promotional' });
    await createCampaign(user._id, segment._id, { type: 'reminder' });
    await createCampaign(user._id, segment._id, { type: 'festival' });

    const result = await campaignService.listCampaigns({ type: 'promotional' }, {});

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].type).toBe('promotional');
  });

  it('filters campaigns by type "follow_up"', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { type: 'follow_up' });
    await createCampaign(user._id, segment._id, { type: 'promotional' });

    const result = await campaignService.listCampaigns({ type: 'follow_up' }, {});

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].type).toBe('follow_up');
  });

  it('ignores invalid type filter and returns all campaigns', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { type: 'promotional' });
    await createCampaign(user._id, segment._id, { type: 'reminder' });

    const result = await campaignService.listCampaigns({ type: 'newsletter' }, {});

    expect(result.total).toBe(2);
  });
});

// ── Filter by search ──────────────────────────────────────────────────────────

describe('listCampaigns — filter by search (name)', () => {
  it('finds campaigns by exact name match (case-insensitive)', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Summer Sale' });
    await createCampaign(user._id, segment._id, { name: 'Winter Promo' });

    const result = await campaignService.listCampaigns({ search: 'summer sale' }, {});

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].name).toBe('Summer Sale');
  });

  it('finds campaigns by partial name match', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Summer Sale 2024' });
    await createCampaign(user._id, segment._id, { name: 'Summer Promo' });
    await createCampaign(user._id, segment._id, { name: 'Winter Campaign' });

    const result = await campaignService.listCampaigns({ search: 'Summer' }, {});

    expect(result.campaigns).toHaveLength(2);
  });

  it('returns empty list when no campaigns match the search term', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Summer Sale' });

    const result = await campaignService.listCampaigns({ search: 'nonexistent' }, {});

    expect(result.campaigns).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('handles special regex characters in search term safely', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Campaign (Test)' });

    // Should not throw — special chars are escaped
    const result = await campaignService.listCampaigns({ search: '(Test)' }, {});

    expect(result.campaigns).toHaveLength(1);
  });
});

// ── Filter by date range ──────────────────────────────────────────────────────

describe('listCampaigns — filter by date range', () => {
  it('filters campaigns by startDate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    // Create a campaign with a past createdAt
    const pastDate = new Date('2023-01-01T00:00:00Z');
    await Campaign.create({
      name: 'Old Campaign',
      type: 'promotional',
      status: 'completed',
      targetSegment: segment._id,
      messageTemplate: 'Hello!',
      createdBy: user._id,
      createdAt: pastDate,
    });

    // Create a recent campaign
    await createCampaign(user._id, segment._id, { name: 'Recent Campaign' });

    const startDate = new Date('2024-01-01T00:00:00Z').toISOString();
    const result = await campaignService.listCampaigns({ startDate }, {});

    // Only the recent campaign should be returned
    expect(result.campaigns.every((c) => new Date(c.createdAt) >= new Date(startDate))).toBe(true);
  });

  it('filters campaigns by endDate', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const pastDate = new Date('2023-06-15T00:00:00Z');
    await Campaign.create({
      name: 'Old Campaign',
      type: 'promotional',
      status: 'completed',
      targetSegment: segment._id,
      messageTemplate: 'Hello!',
      createdBy: user._id,
      createdAt: pastDate,
    });

    await createCampaign(user._id, segment._id, { name: 'Recent Campaign' });

    const endDate = new Date('2023-12-31T00:00:00Z').toISOString();
    const result = await campaignService.listCampaigns({ endDate }, {});

    expect(result.campaigns.every((c) => new Date(c.createdAt) <= new Date(endDate))).toBe(true);
  });

  it('ignores invalid date strings gracefully', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);
    await createCampaign(user._id, segment._id);

    // Should not throw — invalid dates are ignored
    const result = await campaignService.listCampaigns(
      { startDate: 'not-a-date', endDate: 'also-not-a-date' },
      {}
    );

    expect(result.total).toBe(1);
  });
});

// ── Sorting ───────────────────────────────────────────────────────────────────

describe('listCampaigns — sorting', () => {
  it('defaults to sorting by createdAt descending', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    const c1 = await createCampaign(user._id, segment._id, { name: 'First' });
    await new Promise((r) => setTimeout(r, 10));
    const c2 = await createCampaign(user._id, segment._id, { name: 'Second' });

    const result = await campaignService.listCampaigns({}, {});

    // Most recent first
    expect(result.campaigns[0]._id.toString()).toBe(c2._id.toString());
    expect(result.campaigns[1]._id.toString()).toBe(c1._id.toString());
  });

  it('sorts by name ascending when sortBy=name and sortOrder=asc', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Zebra Campaign' });
    await createCampaign(user._id, segment._id, { name: 'Alpha Campaign' });
    await createCampaign(user._id, segment._id, { name: 'Mango Campaign' });

    const result = await campaignService.listCampaigns({}, { sortBy: 'name', sortOrder: 'asc' });

    expect(result.campaigns[0].name).toBe('Alpha Campaign');
    expect(result.campaigns[1].name).toBe('Mango Campaign');
    expect(result.campaigns[2].name).toBe('Zebra Campaign');
  });

  it('sorts by name descending when sortBy=name and sortOrder=desc', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Zebra Campaign' });
    await createCampaign(user._id, segment._id, { name: 'Alpha Campaign' });

    const result = await campaignService.listCampaigns({}, { sortBy: 'name', sortOrder: 'desc' });

    expect(result.campaigns[0].name).toBe('Zebra Campaign');
    expect(result.campaigns[1].name).toBe('Alpha Campaign');
  });

  it('falls back to createdAt sort for invalid sortBy field', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Campaign A' });
    await createCampaign(user._id, segment._id, { name: 'Campaign B' });

    // Should not throw — invalid sortBy is ignored
    const result = await campaignService.listCampaigns({}, { sortBy: 'invalidField' });

    expect(result.campaigns).toHaveLength(2);
  });
});

// ── Combined filters ──────────────────────────────────────────────────────────

describe('listCampaigns — combined filters', () => {
  it('applies status and type filters together', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { type: 'promotional', status: 'draft' });
    await createCampaign(user._id, segment._id, { type: 'reminder', status: 'draft' });
    await createCampaign(user._id, segment._id, { type: 'promotional', status: 'completed' });

    const result = await campaignService.listCampaigns(
      { type: 'promotional', status: 'draft' },
      {}
    );

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].type).toBe('promotional');
    expect(result.campaigns[0].status).toBe('draft');
  });

  it('applies search and status filters together', async () => {
    const user = await createUser();
    const segment = await createSegment(user._id);

    await createCampaign(user._id, segment._id, { name: 'Summer Sale', status: 'draft' });
    await createCampaign(user._id, segment._id, { name: 'Summer Promo', status: 'completed' });
    await createCampaign(user._id, segment._id, { name: 'Winter Sale', status: 'draft' });

    const result = await campaignService.listCampaigns(
      { search: 'Summer', status: 'draft' },
      {}
    );

    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].name).toBe('Summer Sale');
  });
});
