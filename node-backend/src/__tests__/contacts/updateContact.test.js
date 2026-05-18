'use strict';

/**
 * Integration tests for PUT /api/contacts/:id
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

const put = (id, body, token) =>
  request(app)
    .put(`/api/contacts/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PUT /api/contacts/:id', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const contact = await seedContact();
    const res = await request(app)
      .put(`/api/contacts/${contact._id}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const contact = await seedContact();
    const res = await request(app)
      .put(`/api/contacts/${contact._id}`)
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Support_Staff user tries to update a contact', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Support_Staff');
    const res = await put(contact._id, { name: 'Updated Name' }, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns 200 with the updated contact for a Campaign_Manager', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { name: 'Updated Name' }, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contact).toBeDefined();
    expect(res.body.data.contact.name).toBe('Updated Name');
  });

  it('returns 200 with the updated contact for an Admin', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Admin');

    const res = await put(contact._id, { company: 'New Corp' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.company).toBe('New Corp');
  });

  it('persists the updated fields to the database', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    await put(contact._id, { name: 'Persisted Name', jobTitle: 'Manager' }, token);

    const stored = await Contact.findById(contact._id);
    expect(stored.name).toBe('Persisted Name');
    expect(stored.jobTitle).toBe('Manager');
  });

  it('does not overwrite fields that are not included in the update body', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    await put(contact._id, { name: 'Only Name Changed' }, token);

    const stored = await Contact.findById(contact._id);
    expect(stored.phone).toBe('+12125551234');
    expect(stored.company).toBe('Acme Corp');
    expect(stored.industry).toBe('Technology');
  });

  it('can update the phone number to a new valid E.164 number', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { phone: '+447911123456' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.phone).toBe('+447911123456');
  });

  it('returns 400 when phone number contains spaces', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { phone: '+1 212 555 9999' }, token);

    // Spaces are now rejected with a descriptive error message
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/space/i);
  });

  it('can update the industry to another valid value', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { industry: 'Healthcare' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.industry).toBe('Healthcare');
  });

  it('can update tags array', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { tags: ['vip', 'enterprise'] }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.tags).toEqual(expect.arrayContaining(['vip', 'enterprise']));
  });

  it('can update location fields', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { location: { city: 'London', country: 'GB' } }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.location.city).toBe('London');
    expect(res.body.data.contact.location.country).toBe('GB');
  });

  it('returns updated timestamps after update', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { name: 'Timestamp Check' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.updatedAt).toBeDefined();
    // updatedAt should be >= original createdAt
    const updatedAt = new Date(res.body.data.contact.updatedAt);
    const createdAt = new Date(contact.createdAt);
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  it('returns 404 when the contact does not exist', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const nonExistentId = new mongoose.Types.ObjectId();

    const res = await put(nonExistentId, { name: 'Ghost' }, token);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  // ── Invalid ID format ─────────────────────────────────────────────────────

  it('returns 400 for a malformed contact ID', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put('not-a-valid-id', { name: 'Bad ID' }, token);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid.*id/i);
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('returns 400 when name is set to an empty string', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { name: '   ' }, token);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/name/i);
  });

  it('returns 400 for an invalid phone number format', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { phone: '12125551234' }, token); // missing +
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/\+|E\.164/i);
  });

  it('returns 400 for an invalid industry value', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { industry: 'InvalidIndustry' }, token);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/industry/i);
  });

  it('returns 400 when tags is not an array', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { tags: 'not-an-array' }, token);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/tags/i);
  });

  // ── Duplicate phone prevention ────────────────────────────────────────────

  it('returns 409 when the new phone number is already used by another contact', async () => {
    const contactA = await seedContact({ phone: '+12125551111' });
    await seedContact({ phone: '+12125552222', name: 'Contact B' });

    const { token } = await createUserAndToken('Campaign_Manager');

    // Try to update contactA's phone to contactB's phone
    const res = await put(contactA._id, { phone: '+12125552222' }, token);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('allows updating a contact with its own existing phone number (no false conflict)', async () => {
    const contact = await seedContact({ phone: '+12125551234' });
    const { token } = await createUserAndToken('Campaign_Manager');

    // Sending the same phone number back should not trigger a 409
    const res = await put(contact._id, { phone: '+12125551234', name: 'Same Phone' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.phone).toBe('+12125551234');
  });

  // ── Ignored / non-mutable fields ─────────────────────────────────────────

  it('ignores unknown fields in the request body', async () => {
    const contact = await seedContact();
    const { token } = await createUserAndToken('Campaign_Manager');

    const res = await put(contact._id, { name: 'Valid', unknownField: 'should be ignored' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contact.unknownField).toBeUndefined();
  });

  it('does not allow changing the source field', async () => {
    const contact = await seedContact({ source: 'manual' });
    const { token } = await createUserAndToken('Campaign_Manager');

    await put(contact._id, { source: 'api' }, token);

    const stored = await Contact.findById(contact._id);
    expect(stored.source).toBe('manual');
  });
});
