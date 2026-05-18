'use strict';

/**
 * Integration tests for POST /api/contacts/segments
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance
 * and supertest to drive the Express app.
 *
 * Validates: Requirements 3.6, 3.7
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
const Contact = require('../../models/Contact');
const Segment = require('../../models/Segment');
const User = require('../../models/User');
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
  await Contact.deleteMany({});
  await Segment.deleteMany({});
  await User.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a real user in the DB and return a signed JWT for them. */
const createUserAndToken = async (role = 'Campaign_Manager') => {
  const user = await User.create({
    email: `${role.toLowerCase()}-${Date.now()}@example.com`,
    passwordHash: 'hashed-does-not-matter',
    firstName: 'Test',
    lastName: 'User',
    role,
  });

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  return { user, token };
};

/** Seed a contact into the DB. */
const seedContact = (overrides = {}) =>
  Contact.create({
    name: 'Test Contact',
    phone: `+1212555${Math.floor(1000 + Math.random() * 9000)}`,
    industry: 'Technology',
    source: 'manual',
    ...overrides,
  });

const post = (body, token) =>
  request(app)
    .post('/api/contacts/segments')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/contacts/segments', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/contacts/segments')
      .send({ name: 'My Segment' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .post('/api/contacts/segments')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ name: 'My Segment' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Support_Staff user tries to create a segment', async () => {
    const { token } = await createUserAndToken('Support_Staff');
    const res = await post({ name: 'My Segment' }, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── Happy path — minimal payload ──────────────────────────────────────────

  it('returns 201 with the created segment for a Campaign_Manager', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ name: 'Tech Contacts' }, token);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.segment).toBeDefined();

    const { segment } = res.body.data;
    expect(segment.name).toBe('Tech Contacts');
    expect(segment._id).toBeDefined();
    expect(segment.contactCount).toBe(0); // no contacts seeded
  });

  it('returns 201 with the created segment for an Admin', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await post({ name: 'Admin Segment' }, token);
    expect(res.status).toBe(201);
    expect(res.body.data.segment.name).toBe('Admin Segment');
  });

  it('persists the segment to the database', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    await post({ name: 'Persisted Segment' }, token);

    const stored = await Segment.findOne({ name: 'Persisted Segment' });
    expect(stored).not.toBeNull();
    expect(stored.name).toBe('Persisted Segment');
  });

  it('records the createdBy field as the authenticated user', async () => {
    const { user, token } = await createUserAndToken('Campaign_Manager');
    await post({ name: 'Owned Segment' }, token);

    const stored = await Segment.findOne({ name: 'Owned Segment' });
    expect(stored.createdBy.toString()).toBe(user._id.toString());
  });

  it('accepts an optional description', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(
      { name: 'Described Segment', description: 'All tech contacts' },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.segment.description).toBe('All tech contacts');
  });

  it('returns timestamps (createdAt, updatedAt) in the response', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ name: 'Timestamped Segment' }, token);
    expect(res.status).toBe(201);
    expect(res.body.data.segment.createdAt).toBeDefined();
    expect(res.body.data.segment.updatedAt).toBeDefined();
  });

  // ── contactCount calculation ──────────────────────────────────────────────

  it('calculates contactCount = 0 when no contacts match the filter', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    // Seed a Healthcare contact but filter for Finance
    await seedContact({ industry: 'Healthcare' });

    const res = await post(
      { name: 'Finance Segment', filterCriteria: { industries: ['Finance'] } },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.segment.contactCount).toBe(0);
  });

  it('calculates contactCount correctly when contacts match by industry', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    await seedContact({ industry: 'Technology' });
    await seedContact({ industry: 'Technology', phone: '+12125550001' });
    await seedContact({ industry: 'Healthcare', phone: '+12125550002' });

    const res = await post(
      { name: 'Tech Segment', filterCriteria: { industries: ['Technology'] } },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.segment.contactCount).toBe(2);
  });

  it('calculates contactCount correctly when contacts match by tags', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    await seedContact({ tags: ['vip'], phone: '+12125550010' });
    await seedContact({ tags: ['vip', 'prospect'], phone: '+12125550011' });
    await seedContact({ tags: ['prospect'], phone: '+12125550012' });

    const res = await post(
      { name: 'VIP Segment', filterCriteria: { tags: ['vip'] } },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.segment.contactCount).toBe(2);
  });

  it('calculates contactCount correctly when contacts match by location', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    await seedContact({ location: { city: 'New York', country: 'US' }, phone: '+12125550020' });
    await seedContact({ location: { city: 'London', country: 'UK' }, phone: '+12125550021' });
    await seedContact({ location: { city: 'New York', country: 'US' }, phone: '+12125550022' });

    const res = await post(
      {
        name: 'NY Segment',
        filterCriteria: { locations: [{ city: 'New York', country: 'US' }] },
      },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.segment.contactCount).toBe(2);
  });

  it('calculates contactCount = 0 when no filterCriteria is provided and no contacts exist', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ name: 'Empty Segment' }, token);
    expect(res.status).toBe(201);
    expect(res.body.data.segment.contactCount).toBe(0);
  });

  it('stores the filterCriteria in the saved segment', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const filterCriteria = {
      industries: ['Technology', 'Finance'],
      tags: ['vip'],
    };

    const res = await post({ name: 'Multi-filter Segment', filterCriteria }, token);
    expect(res.status).toBe(201);

    const stored = await Segment.findById(res.body.data.segment._id);
    expect(stored.filterCriteria.industries).toEqual(
      expect.arrayContaining(['Technology', 'Finance'])
    );
    expect(stored.filterCriteria.tags).toEqual(expect.arrayContaining(['vip']));
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('returns 400 when name is missing', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ description: 'No name provided' }, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/name/i);
  });

  it('returns 400 when name is an empty string', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ name: '   ' }, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/name/i);
  });

  it('returns 400 when name is not a string', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ name: 123 }, token);
    // name: 123 — numeric, not a string — should be rejected
    // (Mongoose will coerce numbers to strings, so we rely on the service validation)
    // The service checks typeof name !== 'string', so this should return 400
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it('response data contains segment with expected fields', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(
      {
        name: 'Shape Test Segment',
        description: 'Testing response shape',
        filterCriteria: { industries: ['Technology'] },
      },
      token
    );

    expect(res.status).toBe(201);
    const { segment } = res.body.data;
    expect(segment).toHaveProperty('_id');
    expect(segment).toHaveProperty('name', 'Shape Test Segment');
    expect(segment).toHaveProperty('description', 'Testing response shape');
    expect(segment).toHaveProperty('filterCriteria');
    expect(segment).toHaveProperty('contactCount');
    expect(segment).toHaveProperty('createdBy');
    expect(segment).toHaveProperty('createdAt');
    expect(segment).toHaveProperty('updatedAt');
  });

  it('trims whitespace from name and description', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(
      { name: '  Trimmed Name  ', description: '  Trimmed Desc  ' },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.segment.name).toBe('Trimmed Name');
    expect(res.body.data.segment.description).toBe('Trimmed Desc');
  });
});
