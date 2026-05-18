'use strict';

/**
 * Integration tests for POST /api/auth/login
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance
 * and supertest to drive the Express app.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

// ── Disable rate limiters so tests don't hit 429 ──────────────────────────────
jest.mock('../../middleware/rateLimiter', () => ({
  apiLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next(),
}));

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
const VALID_USER = {
  email: 'bob@example.com',
  password: 'Secure1234!',
  firstName: 'Bob',
  lastName: 'Jones',
};

/** Register a user via the API so the password is properly hashed. */
const registerUser = (payload = VALID_USER) =>
  request(app).post('/api/auth/register').send(payload);

const post = (body) => request(app).post('/api/auth/login').send(body);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  // ── Happy path ────────────────────────────────────────────────────────────
  describe('successful login', () => {
    it('returns 200 with a JWT token and user object on valid credentials', async () => {
      await registerUser();

      const res = await post({ email: VALID_USER.email, password: VALID_USER.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.token.length).toBeGreaterThan(0);

      const { user } = res.body.data;
      expect(user.email).toBe(VALID_USER.email);
      expect(user.firstName).toBe(VALID_USER.firstName);
      expect(user.lastName).toBe(VALID_USER.lastName);
      expect(user.role).toBe('Campaign_Manager');
      expect(user.id).toBeDefined();
    });

    it('updates lastLogin timestamp on successful login', async () => {
      await registerUser();

      const before = new Date();
      await post({ email: VALID_USER.email, password: VALID_USER.password });
      const after = new Date();

      const stored = await User.findOne({ email: VALID_USER.email });
      expect(stored.lastLogin).toBeDefined();
      expect(stored.lastLogin.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stored.lastLogin.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('resets failedLoginAttempts to 0 on successful login', async () => {
      await registerUser();

      // Cause one failed attempt first
      await post({ email: VALID_USER.email, password: 'WrongPass1!' });

      // Now login successfully
      await post({ email: VALID_USER.email, password: VALID_USER.password });

      const stored = await User.findOne({ email: VALID_USER.email });
      expect(stored.failedLoginAttempts).toBe(0);
    });

    it('is case-insensitive for email', async () => {
      await registerUser();

      const res = await post({
        email: VALID_USER.email.toUpperCase(),
        password: VALID_USER.password,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('does not include passwordHash in the response', async () => {
      await registerUser();
      const res = await post({ email: VALID_USER.email, password: VALID_USER.password });
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('passwordHash');
    });
  });

  // ── Input validation ──────────────────────────────────────────────────────
  describe('input validation', () => {
    it('returns 400 when email is missing', async () => {
      const res = await post({ password: VALID_USER.password });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when password is missing', async () => {
      const res = await post({ email: VALID_USER.email });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when body is empty', async () => {
      const res = await post({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ── Invalid credentials ───────────────────────────────────────────────────
  describe('invalid credentials', () => {
    it('returns 401 for a non-existent email', async () => {
      const res = await post({ email: 'nobody@example.com', password: 'Secure1234!' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for a wrong password', async () => {
      await registerUser();
      const res = await post({ email: VALID_USER.email, password: 'WrongPass1!' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('uses a generic error message that does not reveal whether email or password was wrong', async () => {
      await registerUser();

      const wrongEmailRes = await post({
        email: 'nobody@example.com',
        password: VALID_USER.password,
      });
      const wrongPassRes = await post({
        email: VALID_USER.email,
        password: 'WrongPass1!',
      });

      // Both should return the same generic message
      expect(wrongEmailRes.body.message).toBe(wrongPassRes.body.message);
      // Message should not hint at which field was wrong
      expect(wrongEmailRes.body.message).not.toMatch(/email/i);
      expect(wrongEmailRes.body.message).not.toMatch(/password/i);
    });
  });

  // ── Account lockout ───────────────────────────────────────────────────────
  describe('account lockout', () => {
    it('increments failedLoginAttempts on each failed attempt', async () => {
      await registerUser();

      await post({ email: VALID_USER.email, password: 'WrongPass1!' });
      await post({ email: VALID_USER.email, password: 'WrongPass1!' });

      const stored = await User.findOne({ email: VALID_USER.email });
      expect(stored.failedLoginAttempts).toBe(2);
    });

    it('locks the account after 5 failed attempts', async () => {
      await registerUser();

      for (let i = 0; i < 5; i++) {
        await post({ email: VALID_USER.email, password: 'WrongPass1!' });
      }

      const stored = await User.findOne({ email: VALID_USER.email });
      expect(stored.accountLockedUntil).not.toBeNull();
      expect(stored.accountLockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns 423 when the account is locked', async () => {
      await registerUser();

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await post({ email: VALID_USER.email, password: 'WrongPass1!' });
      }

      // Attempt login while locked
      const res = await post({ email: VALID_USER.email, password: VALID_USER.password });
      expect(res.status).toBe(423);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/locked/i);
    });

    it('sets accountLockedUntil approximately 15 minutes in the future', async () => {
      await registerUser();

      for (let i = 0; i < 5; i++) {
        await post({ email: VALID_USER.email, password: 'WrongPass1!' });
      }

      const stored = await User.findOne({ email: VALID_USER.email });
      const expectedLockEnd = Date.now() + 15 * 60 * 1000;
      // Allow 5 seconds of tolerance
      expect(stored.accountLockedUntil.getTime()).toBeGreaterThan(expectedLockEnd - 5000);
      expect(stored.accountLockedUntil.getTime()).toBeLessThanOrEqual(expectedLockEnd + 5000);
    });

    it('resets accountLockedUntil to null on successful login after lock expires', async () => {
      await registerUser();

      // Manually set an expired lock
      await User.updateOne(
        { email: VALID_USER.email },
        {
          failedLoginAttempts: 5,
          accountLockedUntil: new Date(Date.now() - 1000), // expired 1 second ago
        }
      );

      const res = await post({ email: VALID_USER.email, password: VALID_USER.password });
      expect(res.status).toBe(200);

      const stored = await User.findOne({ email: VALID_USER.email });
      expect(stored.accountLockedUntil).toBeNull();
      expect(stored.failedLoginAttempts).toBe(0);
    });
  });
});
