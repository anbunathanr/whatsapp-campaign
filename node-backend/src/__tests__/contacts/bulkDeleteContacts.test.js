'use strict';

/**
 * Integration tests for POST /api/contacts/bulk-delete
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance
 * and supertest to drive the Express app.
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
const User = require('../../models/User');
const Segment = require('../../models/Segment');
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
  await User.deleteMany({});
  await Segment.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a real user in the DB and return a signed JWT for them. */
const createUserAndToken = async (role = 'Admin') => {
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

/** Seed a contact directly into the DB and return it. */
const seedContact = async (overrides = {}) => {
  return Contact.create({
    name: 'Jane Doe',
    phone: `+1212555${Math.floor(1000 + Math.random() * 9000)}`,
    jobTitle: 'Engineer',
    company: 'Acme Corp',
    industry: 'Technology',
    source: 'manual',
    ...overrides,
  });
};

const bulkDelete = (body, token) =>
  request(app)
    .post('/api/contacts/bulk-delete')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/contacts/bulk-delete', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const contact = await seedContact();
    const res = await request(app)
      .post('/api/contacts/bulk-delete')
      .send({ contactIds: [contact._id.toString()] });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const contact = await seedContact();
    const res = await request(app)
      .post('/api/contacts/bulk-delete')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ contactIds: [contact._id.toString()] });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Campaign_Manager tries to bulk-delete', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await bulkDelete({ contactIds: [contact._id.toString()] }, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Support_Staff user tries to bulk-delete', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Support_Staff');
    const res = await bulkDelete({ contactIds: [contact._id.toString()] }, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it('returns 400 when contactIds is missing', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await bulkDelete({}, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/contactIds/i);
  });

  it('returns 400 when contactIds is an empty array', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await bulkDelete({ contactIds: [] }, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/contactIds/i);
  });

  it('returns 400 when contactIds is not an array', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await bulkDelete({ contactIds: 'not-an-array' }, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when contactIds contains an invalid ObjectId', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await bulkDelete({ contactIds: ['not-a-valid-id'] }, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid contact id/i);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns 200 with deletedCount for a single contact', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Admin');

    const res = await bulkDelete({ contactIds: [contact._id.toString()] }, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(1);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });

  it('actually removes the contacts from the database', async () => {
    const c1 = await seedContact({ phone: '+12125550001' });
    const c2 = await seedContact({ phone: '+12125550002' });
    const { token } = await createUserAndToken('Admin');

    await bulkDelete({ contactIds: [c1._id.toString(), c2._id.toString()] }, token);

    const found1 = await Contact.findById(c1._id);
    const found2 = await Contact.findById(c2._id);
    expect(found1).toBeNull();
    expect(found2).toBeNull();
  });

  it('returns correct deletedCount when deleting multiple contacts', async () => {
    const c1 = await seedContact({ phone: '+12125550011' });
    const c2 = await seedContact({ phone: '+12125550012' });
    const c3 = await seedContact({ phone: '+12125550013' });
    const { token } = await createUserAndToken('Admin');

    const res = await bulkDelete(
      { contactIds: [c1._id.toString(), c2._id.toString(), c3._id.toString()] },
      token
    );

    expect(res.status).toBe(200);
    expect(res.body.data.deletedCount).toBe(3);
  });

  it('returns deletedCount of 0 when none of the IDs exist', async () => {
    const { token } = await createUserAndToken('Admin');
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    const res = await bulkDelete({ contactIds: [nonExistentId] }, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deletedCount).toBe(0);
  });

  it('only deletes the specified contacts, leaving others intact', async () => {
    const c1 = await seedContact({ phone: '+12125550021' });
    const c2 = await seedContact({ phone: '+12125550022' });
    const c3 = await seedContact({ phone: '+12125550023' }); // should NOT be deleted
    const { token } = await createUserAndToken('Admin');

    await bulkDelete({ contactIds: [c1._id.toString(), c2._id.toString()] }, token);

    const remaining = await Contact.findById(c3._id);
    expect(remaining).not.toBeNull();
  });

  // ── Segment count update ──────────────────────────────────────────────────

  it('recalculates contactCount on segments that matched the deleted contacts', async () => {
    const { user } = await createUserAndToken('Admin');
    const { token } = await createUserAndToken('Admin');

    const c1 = await seedContact({ phone: '+12125550031', industry: 'Technology' });
    const c2 = await seedContact({ phone: '+12125550032', industry: 'Technology' });

    const segment = await Segment.create({
      name: 'Tech Segment',
      filterCriteria: {
        industries: ['Technology'],
        tags: [],
        locations: [],
      },
      contactCount: 2,
      createdBy: user._id,
    });

    const res = await bulkDelete(
      { contactIds: [c1._id.toString(), c2._id.toString()] },
      token
    );
    expect(res.status).toBe(200);

    const updatedSegment = await Segment.findById(segment._id);
    expect(updatedSegment.contactCount).toBe(0);
  });

  it('does not affect segments that did not match the deleted contacts', async () => {
    const { user } = await createUserAndToken('Admin');
    const { token } = await createUserAndToken('Admin');

    const techContact = await seedContact({ phone: '+12125550041', industry: 'Technology' });
    await seedContact({ phone: '+12125550042', industry: 'Finance' }); // stays in DB

    const financeSegment = await Segment.create({
      name: 'Finance Segment',
      filterCriteria: {
        industries: ['Finance'],
        tags: [],
        locations: [],
      },
      contactCount: 1,
      createdBy: user._id,
    });

    await bulkDelete({ contactIds: [techContact._id.toString()] }, token);

    const updatedSegment = await Segment.findById(financeSegment._id);
    expect(updatedSegment.contactCount).toBe(1);
  });
});
