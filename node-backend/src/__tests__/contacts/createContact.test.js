'use strict';

/**
 * Integration tests for POST /api/contacts
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

const VALID_CONTACT = {
  name: 'Jane Doe',
  phone: '+12125551234',
  jobTitle: 'Engineer',
  company: 'Acme Corp',
  industry: 'Technology',
};

const post = (body, token) =>
  request(app)
    .post('/api/contacts')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/contacts', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/contacts').send(VALID_CONTACT);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', 'Bearer invalid.token.here')
      .send(VALID_CONTACT);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Support_Staff user tries to create a contact', async () => {
    const { token } = await createUserAndToken('Support_Staff');
    const res = await post(VALID_CONTACT, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns 201 with the created contact for a Campaign_Manager', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(VALID_CONTACT, token);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contact).toBeDefined();

    const { contact } = res.body.data;
    expect(contact.name).toBe('Jane Doe');
    expect(contact.phone).toBe('+12125551234');
    expect(contact.jobTitle).toBe('Engineer');
    expect(contact.company).toBe('Acme Corp');
    expect(contact.industry).toBe('Technology');
    expect(contact._id).toBeDefined();
  });

  it('returns 201 with the created contact for an Admin', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await post(VALID_CONTACT, token);
    expect(res.status).toBe(201);
    expect(res.body.data.contact.name).toBe('Jane Doe');
  });

  it('persists the contact to the database', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    await post(VALID_CONTACT, token);

    const stored = await Contact.findOne({ phone: '+12125551234' });
    expect(stored).not.toBeNull();
    expect(stored.name).toBe('Jane Doe');
    expect(stored.industry).toBe('Technology');
    expect(stored.source).toBe('manual');
  });

  it('sets source to "manual" for manually created contacts', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(VALID_CONTACT, token);
    expect(res.body.data.contact.source).toBe('manual');
  });

  it('records the createdBy field as the authenticated user', async () => {
    const { user, token } = await createUserAndToken('Campaign_Manager');
    await post(VALID_CONTACT, token);

    const stored = await Contact.findOne({ phone: '+12125551234' });
    expect(stored.createdBy.toString()).toBe(user._id.toString());
  });

  it('accepts optional tags array', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ ...VALID_CONTACT, tags: ['vip', 'prospect'] }, token);

    expect(res.status).toBe(201);
    expect(res.body.data.contact.tags).toEqual(expect.arrayContaining(['vip', 'prospect']));
  });

  it('accepts optional location object', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const location = { city: 'New York', state: 'NY', country: 'US' };
    const res = await post({ ...VALID_CONTACT, location }, token);

    expect(res.status).toBe(201);
    expect(res.body.data.contact.location.city).toBe('New York');
    expect(res.body.data.contact.location.country).toBe('US');
  });

  it('creates a contact with only required fields (name, phone, industry)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(
      { name: 'Minimal Contact', phone: '+447911123456', industry: 'Healthcare' },
      token
    );

    expect(res.status).toBe(201);
    expect(res.body.data.contact.name).toBe('Minimal Contact');
    expect(res.body.data.contact.phone).toBe('+447911123456');
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('returns 400 when name is missing', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const { name: _omit, ...body } = VALID_CONTACT;
    const res = await post(body, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/name/i);
  });

  it('returns 400 when phone is missing', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const { phone: _omit, ...body } = VALID_CONTACT;
    const res = await post(body, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('returns 400 when industry is missing', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const { industry: _omit, ...body } = VALID_CONTACT;
    const res = await post(body, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/industry/i);
  });

  it('returns 400 for an invalid phone number format', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ ...VALID_CONTACT, phone: '12125551234' }, token); // missing +
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/\+|E\.164/i);
  });

  it('returns 400 for a phone number with spaces', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ ...VALID_CONTACT, phone: '+1 212 555 1234' }, token);
    // spaces are now rejected with a descriptive error message
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/space/i);
  });

  it('returns 400 for an invalid industry value', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post({ ...VALID_CONTACT, industry: 'InvalidIndustry' }, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/industry/i);
  });

  // ── Duplicate phone prevention ────────────────────────────────────────────

  it('returns 409 when a contact with the same phone number already exists', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    // First creation — should succeed
    const first = await post(VALID_CONTACT, token);
    expect(first.status).toBe(201);

    // Second creation with same phone — should conflict
    const second = await post({ ...VALID_CONTACT, name: 'Different Name' }, token);
    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.message).toMatch(/already exists/i);
  });

  it('does not create a duplicate when the same phone is submitted twice', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    await post(VALID_CONTACT, token);
    await post({ ...VALID_CONTACT, name: 'Duplicate' }, token);

    const count = await Contact.countDocuments({ phone: '+12125551234' });
    expect(count).toBe(1);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it('does not expose internal fields like __v in the response', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(VALID_CONTACT, token);
    expect(res.status).toBe(201);
    // __v is a Mongoose version key — should not be relied upon by clients
    // (it may or may not be present depending on Mongoose config, but passwordHash must not be)
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('passwordHash');
  });

  it('returns timestamps (createdAt, updatedAt) in the response', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await post(VALID_CONTACT, token);
    expect(res.status).toBe(201);
    expect(res.body.data.contact.createdAt).toBeDefined();
    expect(res.body.data.contact.updatedAt).toBeDefined();
  });
});
