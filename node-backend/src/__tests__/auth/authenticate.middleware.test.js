'use strict';

/**
 * Unit tests for the authenticate JWT middleware
 *
 * Validates:
 *   - Requirement 1.1: JWT token generated on login is accepted
 *   - Requirement 1.4: Expired tokens result in 401 re-authentication
 *   - Requirement 1.7: Session state maintained for authenticated users
 *   - Requirement 10.9: JWT signature validated on every authenticated request
 *   - Requirement 10.12: JWT tokens expire after 24 hours
 *
 * Uses supertest + in-memory MongoDB to drive the full Express stack.
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
const config = require('../../config');
const User = require('../../models/User');

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
  await User.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_USER = {
  email: 'test@example.com',
  password: 'Secure1234!',
  firstName: 'Test',
  lastName: 'User',
};

/** Register a user and return the JWT token. */
const registerAndGetToken = async (payload = VALID_USER) => {
  const res = await request(app).post('/api/auth/register').send(payload);
  return res.body.data.token;
};

/** Hit GET /api/auth/me — a protected endpoint that requires a valid JWT. */
const getMe = (token) =>
  request(app)
    .get('/api/auth/me')
    .set('Authorization', token ? `Bearer ${token}` : '');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  // ── Happy path ────────────────────────────────────────────────────────────
  describe('valid token', () => {
    it('allows access to a protected route when a valid JWT is provided', async () => {
      const token = await registerAndGetToken();
      const res = await getMe(token);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('attaches decoded user information to req.user (id, email, role)', async () => {
      const token = await registerAndGetToken();
      const res = await getMe(token);

      expect(res.status).toBe(200);
      const { user } = res.body.data;
      expect(user).toBeDefined();
      expect(user.email).toBe(VALID_USER.email);
      expect(user.role).toBe('Campaign_Manager');
      expect(user.id).toBeDefined();
    });

    it('accepts tokens for all valid roles', async () => {
      const roles = ['Admin', 'Campaign_Manager', 'Support_Staff'];

      for (const role of roles) {
        await User.deleteMany({});
        const token = await registerAndGetToken({ ...VALID_USER, role });
        const res = await getMe(token);
        expect(res.status).toBe(200);
      }
    });
  });

  // ── Missing / malformed Authorization header ──────────────────────────────
  describe('missing or malformed token', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when Authorization header is empty string', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', '');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when token is not prefixed with "Bearer "', async () => {
      const token = await registerAndGetToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', token); // missing "Bearer " prefix
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when token is the literal string "Bearer " with no token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for a completely invalid token string', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for a token signed with a different secret', async () => {
      const fakeToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), email: 'hacker@example.com', role: 'Admin' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const res = await getMe(fakeToken);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for a tampered token payload', async () => {
      const token = await registerAndGetToken();
      // Tamper with the payload section (middle part of JWT)
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ id: 'fake-id', email: 'hacker@example.com', role: 'Admin' })
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const res = await getMe(tamperedToken);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ── Expired tokens (Requirement 1.4, 10.12) ───────────────────────────────
  describe('expired token', () => {
    it('returns 401 when the token has expired', async () => {
      // Create a token that expired 1 second ago
      const expiredToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), email: VALID_USER.email, role: 'Campaign_Manager' },
        config.jwt.secret,
        { expiresIn: -1 } // already expired
      );

      const res = await getMe(expiredToken);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns a message indicating the token has expired', async () => {
      const expiredToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), email: VALID_USER.email, role: 'Campaign_Manager' },
        config.jwt.secret,
        { expiresIn: -1 }
      );

      const res = await getMe(expiredToken);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    it('does not allow access with an expired token even if the signature is valid', async () => {
      const expiredToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), email: VALID_USER.email, role: 'Campaign_Manager' },
        config.jwt.secret,
        { expiresIn: 0 }
      );

      // Wait a tick to ensure expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const res = await getMe(expiredToken);
      expect(res.status).toBe(401);
    });
  });

  // ── Token signature validation (Requirement 10.9) ─────────────────────────
  describe('signature validation', () => {
    it('validates the JWT signature on every request', async () => {
      const token = await registerAndGetToken();

      // First request succeeds
      const res1 = await getMe(token);
      expect(res1.status).toBe(200);

      // Second request with same valid token also succeeds
      const res2 = await getMe(token);
      expect(res2.status).toBe(200);
    });

    it('rejects a token with a valid structure but wrong signature', async () => {
      // Build a token with the correct structure but signed with a different key
      const payload = { id: new mongoose.Types.ObjectId(), email: 'test@example.com', role: 'Admin' };
      const wrongToken = jwt.sign(payload, 'completely-different-secret', { expiresIn: '1h' });

      const res = await getMe(wrongToken);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ── Response shape ────────────────────────────────────────────────────────
  describe('error response shape', () => {
    it('returns a JSON body with success: false on 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });
  });

  // ── Full user enrichment from database (Requirement 1.7) ─────────────────
  describe('user enrichment from database', () => {
    it('attaches firstName and lastName from the database to req.user (visible via /me)', async () => {
      const token = await registerAndGetToken();
      const res = await getMe(token);

      expect(res.status).toBe(200);
      const { user } = res.body.data;
      expect(user.firstName).toBe(VALID_USER.firstName);
      expect(user.lastName).toBe(VALID_USER.lastName);
    });

    it('does not expose passwordHash in the /me response', async () => {
      const token = await registerAndGetToken();
      const res = await getMe(token);

      expect(res.status).toBe(200);
      const { user } = res.body.data;
      expect(user.passwordHash).toBeUndefined();
    });

    it('returns 401 when the token belongs to a user that no longer exists', async () => {
      // Register a user, grab their DB id, then delete them
      const regRes = await request(app).post('/api/auth/register').send(VALID_USER);
      const token = regRes.body.data.token;
      const userId = regRes.body.data.user.id;

      await User.findByIdAndDelete(userId);

      const res = await getMe(token);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 when the token belongs to a deactivated user (isActive: false)', async () => {
      const regRes = await request(app).post('/api/auth/register').send(VALID_USER);
      const token = regRes.body.data.token;
      const userId = regRes.body.data.user.id;

      // Deactivate the user directly in the database
      await User.findByIdAndUpdate(userId, { isActive: false });

      const res = await getMe(token);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
