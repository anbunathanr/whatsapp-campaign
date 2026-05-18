'use strict';

/**
 * Integration tests for DELETE /api/contacts/:id
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

/** Seed a contact directly into the DB and return it. */
const seedContact = async (overrides = {}) => {
  return Contact.create({
    name: 'Jane Doe',
    phone: '+12125551234',
    jobTitle: 'Engineer',
    company: 'Acme Corp',
    industry: 'Technology',
    source: 'manual',
    ...overrides,
  });
};

const del = (id, token) =>
  request(app)
    .delete(`/api/contacts/${id}`)
    .set('Authorization', `Bearer ${token}`);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DELETE /api/contacts/:id', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const contact = await seedContact();
    const res = await request(app).delete(`/api/contacts/${contact._id}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const contact = await seedContact();
    const res = await request(app)
      .delete(`/api/contacts/${contact._id}`)
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Support_Staff user tries to delete a contact', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Support_Staff');
    const res = await del(contact._id, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns 200 with success message for a Campaign_Manager', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await del(contact._id, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });

  it('returns 200 with success message for an Admin', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Admin');

    const res = await del(contact._id, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });

  it('actually removes the contact from the database', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    await del(contact._id, token);

    const found = await Contact.findById(contact._id);
    expect(found).toBeNull();
  });

  it('returns null data in the response body', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await del(contact._id, token);

    expect(res.status).toBe(200);
    // data should be null or absent
    expect(res.body.data == null).toBe(true);
  });

  // ── Segment count update ──────────────────────────────────────────────────

  it('decrements contactCount on segments that matched the deleted contact', async () => {
    const { user } = await createUserAndToken('Admin');
    const { token } = await createUserAndToken('Campaign_Manager');

    // Seed a contact with industry 'Technology'
    const contact = await seedContact({ industry: 'Technology' });

    // Create a segment that filters by 'Technology' industry
    const segment = await Segment.create({
      name: 'Tech Segment',
      filterCriteria: {
        industries: ['Technology'],
        tags: [],
        locations: [],
      },
      contactCount: 1,
      createdBy: user._id,
    });

    // Delete the contact
    const res = await del(contact._id, token);
    expect(res.status).toBe(200);

    // The segment's contactCount should now be 0
    const updatedSegment = await Segment.findById(segment._id);
    expect(updatedSegment.contactCount).toBe(0);
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  it('returns 404 when the contact does not exist', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const nonExistentId = new mongoose.Types.ObjectId();

    const res = await del(nonExistentId, token);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  // ── Invalid ID format ─────────────────────────────────────────────────────

  it('returns 400 for a malformed contact ID', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await del('not-a-valid-id', token);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid.*id/i);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('returns 404 on a second delete attempt for the same contact', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    // First delete — should succeed
    const first = await del(contact._id, token);
    expect(first.status).toBe(200);

    // Second delete — contact is gone, should return 404
    const second = await del(contact._id, token);
    expect(second.status).toBe(404);
    expect(second.body.success).toBe(false);
    expect(second.body.message).toMatch(/not found/i);
  });
});
