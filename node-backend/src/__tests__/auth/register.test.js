'use strict';

/**
 * Integration tests for POST /api/auth/register
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance
 * and supertest to drive the Express app.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcrypt');

// ── Disable rate limiters so tests don't hit 429 ──────────────────────────────
// Must be done before requiring the app.
jest.mock('../../middleware/rateLimiter', () => ({
  apiLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next(),
}));

// ── App setup ─────────────────────────────────────────────────────────────────
// Import the Express app AFTER setting NODE_ENV so morgan is suppressed
process.env.NODE_ENV = 'test';
const app = require('../../app');
const User = require('../../models/User');

// ── In-memory MongoDB lifecycle ───────────────────────────────────────────────
let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_PAYLOAD = {
  email: 'alice@example.com',
  password: 'Secure1234!',
  firstName: 'Alice',
  lastName: 'Smith',
};

const post = (body) => request(app).post('/api/auth/register').send(body);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  // 1. Happy path
  it('returns 201 with a token and user object on valid registration', async () => {
    const res = await post(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.length).toBeGreaterThan(0);

    const { user } = res.body.data;
    expect(user).toBeDefined();
    expect(user.email).toBe('alice@example.com');
    expect(user.firstName).toBe('Alice');
    expect(user.lastName).toBe('Smith');
    expect(user.role).toBe('Campaign_Manager');
    expect(user.id).toBeDefined();
  });

  // 2. Missing fields
  it('returns 400 when email is missing', async () => {
    const { email: _omit, ...body } = VALID_PAYLOAD;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when password is missing', async () => {
    const { password: _omit, ...body } = VALID_PAYLOAD;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when firstName is missing', async () => {
    const { firstName: _omit, ...body } = VALID_PAYLOAD;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when lastName is missing', async () => {
    const { lastName: _omit, ...body } = VALID_PAYLOAD;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 3. Invalid email
  it('returns 400 for a malformed email address', async () => {
    const res = await post({ ...VALID_PAYLOAD, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for an email missing the domain', async () => {
    const res = await post({ ...VALID_PAYLOAD, email: 'user@' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 4. Weak password
  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await post({ ...VALID_PAYLOAD, password: 'Ab1' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when password has no uppercase letter', async () => {
    const res = await post({ ...VALID_PAYLOAD, password: 'secure1234' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when password has no digit', async () => {
    const res = await post({ ...VALID_PAYLOAD, password: 'SecurePass' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when password has no special character', async () => {
    const res = await post({ ...VALID_PAYLOAD, password: 'Secure1234' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/special character/i);
  });

  // 5. Duplicate email
  it('returns 409 when the same email is registered twice', async () => {
    await post(VALID_PAYLOAD); // first registration
    const res = await post(VALID_PAYLOAD); // duplicate
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already registered/i);
  });

  it('returns 409 regardless of email casing', async () => {
    await post(VALID_PAYLOAD);
    const res = await post({ ...VALID_PAYLOAD, email: 'ALICE@EXAMPLE.COM' });
    expect(res.status).toBe(409);
  });

  // 6. Password not in response
  it('does not include passwordHash or password in the response body', async () => {
    const res = await post(VALID_PAYLOAD);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('passwordHash');
    expect(bodyStr).not.toContain('"password"');
  });

  // 7. Password hashing in DB
  it('stores a bcrypt hash (not plaintext) in the database', async () => {
    await post(VALID_PAYLOAD);

    const stored = await User.findOne({ email: 'alice@example.com' });
    expect(stored).not.toBeNull();
    expect(stored.passwordHash).not.toBe(VALID_PAYLOAD.password);
    expect(stored.passwordHash).toMatch(/^\$2b\$/);

    const matches = await bcrypt.compare(VALID_PAYLOAD.password, stored.passwordHash);
    expect(matches).toBe(true);
  });

  // 8. Role default
  it('assigns Campaign_Manager role when role is not provided', async () => {
    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Campaign_Manager');
  });

  it('accepts a valid role when provided', async () => {
    const res = await post({ ...VALID_PAYLOAD, role: 'Admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Admin');
  });

  it('accepts Support_Staff role', async () => {
    const res = await post({ ...VALID_PAYLOAD, role: 'Support_Staff' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Support_Staff');
  });

  // 9. Invalid role
  it('returns 400 when an invalid role is provided', async () => {
    const res = await post({ ...VALID_PAYLOAD, role: 'SuperAdmin' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a role with wrong casing', async () => {
    const res = await post({ ...VALID_PAYLOAD, role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
