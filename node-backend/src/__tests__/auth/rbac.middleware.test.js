'use strict';

/**
 * Unit tests for the RBAC middleware (rbac.js)
 *
 * Validates:
 *   - Requirement 1.5  : Role_Permission rules enforced for all API_Endpoint access
 *   - Requirement 1.6  : Three roles: Admin, Campaign_Manager, Support_Staff
 *   - Requirement 1.10 : 403 Forbidden for unauthorized access
 *   - Correctness Property 2: Role Permission Enforcement
 *     • Admin role has access to all endpoints
 *     • Campaign_Manager has access to campaign/contact/analytics but NOT admin endpoints
 *     • Support_Staff has read-only access to contacts and campaigns, NO write access
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

// ── Disable rate limiters ─────────────────────────────────────────────────────
jest.mock('../../middleware/rateLimiter', () => ({
  apiLimiter: (_req, _res, next) => next(),
  authLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next(),
}));

process.env.NODE_ENV = 'test';

const app = require('../../app');
const User = require('../../models/User');
const { PERMISSIONS, hasPermission, requirePermission, requireRole } = require('../../middleware/rbac');

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

/**
 * Create a user directly in the database with the given role and return their JWT token.
 * Uses direct DB insertion to bypass the Admin-only /api/auth/register endpoint.
 */
const registerUser = async (role = 'Campaign_Manager') => {
  const email = `${role.toLowerCase().replace(/_/g, '.')}@example.com`;
  const password = 'Secure1234!';

  // Create user directly in DB (pre-save hook will hash the password)
  const user = new User({
    email,
    passwordHash: password,
    firstName: 'Test',
    lastName: role,
    role,
  });
  await user.save();

  // Log in via the public login endpoint to get a JWT
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.token;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. hasPermission() – pure function tests
// ─────────────────────────────────────────────────────────────────────────────

describe('hasPermission()', () => {
  describe('Admin role', () => {
    it('has access to all defined permissions', () => {
      Object.keys(PERMISSIONS).forEach((perm) => {
        expect(hasPermission('Admin', perm)).toBe(true);
      });
    });
  });

  describe('Campaign_Manager role', () => {
    it('can read contacts', () => {
      expect(hasPermission('Campaign_Manager', 'contacts:read')).toBe(true);
    });

    it('can write contacts', () => {
      expect(hasPermission('Campaign_Manager', 'contacts:write')).toBe(true);
    });

    it('cannot perform admin-only contact operations (contacts:admin)', () => {
      expect(hasPermission('Campaign_Manager', 'contacts:admin')).toBe(false);
    });

    it('can read, write, and execute campaigns', () => {
      expect(hasPermission('Campaign_Manager', 'campaigns:read')).toBe(true);
      expect(hasPermission('Campaign_Manager', 'campaigns:write')).toBe(true);
      expect(hasPermission('Campaign_Manager', 'campaigns:execute')).toBe(true);
    });

    it('can read analytics', () => {
      expect(hasPermission('Campaign_Manager', 'analytics:read')).toBe(true);
    });

    it('cannot access admin panel (admin:read, admin:write, admin:delete)', () => {
      expect(hasPermission('Campaign_Manager', 'admin:read')).toBe(false);
      expect(hasPermission('Campaign_Manager', 'admin:write')).toBe(false);
      expect(hasPermission('Campaign_Manager', 'admin:delete')).toBe(false);
    });

    it('cannot delete workflows', () => {
      expect(hasPermission('Campaign_Manager', 'workflows:delete')).toBe(false);
    });
  });

  describe('Support_Staff role', () => {
    it('can read contacts, campaigns, templates, analytics, workflows, and segments', () => {
      const readPerms = [
        'contacts:read',
        'campaigns:read',
        'templates:read',
        'analytics:read',
        'workflows:read',
        'segments:read',
      ];
      readPerms.forEach((perm) => {
        expect(hasPermission('Support_Staff', perm)).toBe(true);
      });
    });

    it('cannot write contacts', () => {
      expect(hasPermission('Support_Staff', 'contacts:write')).toBe(false);
    });

    it('cannot write campaigns', () => {
      expect(hasPermission('Support_Staff', 'campaigns:write')).toBe(false);
    });

    it('cannot delete anything', () => {
      const deletePerms = [
        'contacts:delete',
        'contacts:admin',
        'campaigns:delete',
        'templates:delete',
        'segments:delete',
        'workflows:delete',
        'admin:delete',
      ];
      deletePerms.forEach((perm) => {
        expect(hasPermission('Support_Staff', perm)).toBe(false);
      });
    });

    it('cannot execute campaigns or workflows', () => {
      expect(hasPermission('Support_Staff', 'campaigns:execute')).toBe(false);
      expect(hasPermission('Support_Staff', 'workflows:execute')).toBe(false);
    });

    it('cannot access admin panel', () => {
      expect(hasPermission('Support_Staff', 'admin:read')).toBe(false);
      expect(hasPermission('Support_Staff', 'admin:write')).toBe(false);
    });
  });

  describe('unknown role', () => {
    it('returns false for any permission', () => {
      expect(hasPermission('Unknown_Role', 'contacts:read')).toBe(false);
      expect(hasPermission('Unknown_Role', 'admin:read')).toBe(false);
    });
  });

  describe('unknown permission', () => {
    it('returns false for any role', () => {
      expect(hasPermission('Admin', 'nonexistent:action')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. requirePermission() middleware – unit tests with mock req/res
// ─────────────────────────────────────────────────────────────────────────────

describe('requirePermission() middleware', () => {
  const buildReqRes = (role) => {
    const req = { user: role ? { role } : undefined };
    const res = {
      _status: null,
      _body: null,
      status(code) {
        this._status = code;
        return this;
      },
      json(body) {
        this._body = body;
        return this;
      },
    };
    const next = jest.fn();
    return { req, res, next };
  };

  it('calls next() when the role has the required permission', () => {
    const { req, res, next } = buildReqRes('Admin');
    requirePermission('admin:read')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });

  it('returns 403 when the role lacks the required permission', () => {
    const { req, res, next } = buildReqRes('Support_Staff');
    requirePermission('contacts:write')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body.success).toBe(false);
  });

  it('returns 401 when req.user is not set (unauthenticated)', () => {
    const { req, res, next } = buildReqRes(null);
    requirePermission('contacts:read')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('passes when the role satisfies at least one of multiple permissions (OR logic)', () => {
    const { req, res, next } = buildReqRes('Campaign_Manager');
    // Campaign_Manager has contacts:write but not admin:write
    requirePermission('admin:write', 'contacts:write')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when the role satisfies none of multiple permissions', () => {
    const { req, res, next } = buildReqRes('Support_Staff');
    requirePermission('admin:write', 'contacts:write')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
  });

  it('includes the role name in the 403 error message', () => {
    const { req, res, next } = buildReqRes('Support_Staff');
    requirePermission('campaigns:write')(req, res, next);
    expect(res._body.message).toMatch(/Support_Staff/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. requireRole() middleware – unit tests with mock req/res
// ─────────────────────────────────────────────────────────────────────────────

describe('requireRole() middleware', () => {
  const buildReqRes = (role) => {
    const req = { user: role ? { role } : undefined };
    const res = {
      _status: null,
      _body: null,
      status(code) {
        this._status = code;
        return this;
      },
      json(body) {
        this._body = body;
        return this;
      },
    };
    const next = jest.fn();
    return { req, res, next };
  };

  it('calls next() when the user role is in the allowed list', () => {
    const { req, res, next } = buildReqRes('Admin');
    requireRole('Admin')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when the user role is not in the allowed list', () => {
    const { req, res, next } = buildReqRes('Support_Staff');
    requireRole('Admin')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body.success).toBe(false);
  });

  it('returns 401 when req.user is absent', () => {
    const { req, res, next } = buildReqRes(null);
    requireRole('Admin')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('allows multiple roles in the allowlist', () => {
    const { req, res, next } = buildReqRes('Campaign_Manager');
    requireRole('Admin', 'Campaign_Manager')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Integration tests – admin routes enforce Admin-only access
// ─────────────────────────────────────────────────────────────────────────────

describe('Admin route access control (integration)', () => {
  it('Admin can access GET /api/admin/users', async () => {
    const token = await registerUser('Admin');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    // 200 or 501 (not implemented) are both acceptable — what matters is NOT 403
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('Campaign_Manager cannot access GET /api/admin/users (403)', async () => {
    const token = await registerUser('Campaign_Manager');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Support_Staff cannot access GET /api/admin/users (403)', async () => {
    const token = await registerUser('Support_Staff');
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Unauthenticated request to admin route returns 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Integration tests – campaign write routes
// ─────────────────────────────────────────────────────────────────────────────

describe('Campaign write route access control (integration)', () => {
  it('Campaign_Manager can POST /api/campaigns (not 403)', async () => {
    const token = await registerUser('Campaign_Manager');
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', type: 'promotional' });
    // Controller may return 400/422 for missing fields — that's fine, just not 403
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('Support_Staff cannot POST /api/campaigns (403)', async () => {
    const token = await registerUser('Support_Staff');
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', type: 'promotional' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Support_Staff can GET /api/campaigns (read-only access)', async () => {
    const token = await registerUser('Support_Staff');
    const res = await request(app)
      .get('/api/campaigns')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Integration tests – contact write routes
// ─────────────────────────────────────────────────────────────────────────────

describe('Contact write route access control (integration)', () => {
  it('Campaign_Manager can POST /api/contacts (not 403)', async () => {
    const token = await registerUser('Campaign_Manager');
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alice', phone: '+1234567890' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('Support_Staff cannot POST /api/contacts (403)', async () => {
    const token = await registerUser('Support_Staff');
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alice', phone: '+1234567890' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Support_Staff can GET /api/contacts (read-only access)', async () => {
    const token = await registerUser('Support_Staff');
    const res = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  it('Only Admin can POST /api/contacts/bulk-delete', async () => {
    const cmToken = await registerUser('Campaign_Manager');
    const resCm = await request(app)
      .post('/api/contacts/bulk-delete')
      .set('Authorization', `Bearer ${cmToken}`)
      .send({ ids: [] });
    expect(resCm.status).toBe(403);

    await User.deleteMany({});
    const adminToken = await registerUser('Admin');
    const resAdmin = await request(app)
      .post('/api/contacts/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] });
    expect(resAdmin.status).not.toBe(403);
    expect(resAdmin.status).not.toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Correctness Property 2 – exhaustive role × endpoint matrix
// ─────────────────────────────────────────────────────────────────────────────

describe('Correctness Property 2: Role Permission Enforcement', () => {
  /**
   * Verify that the PERMISSIONS map is internally consistent:
   *   - Admin is always a superset of Campaign_Manager permissions
   *   - Campaign_Manager is always a superset of Support_Staff permissions
   *     (for read permissions only)
   */

  it('Admin is a superset of Campaign_Manager permissions', () => {
    Object.entries(PERMISSIONS).forEach(([perm, roles]) => {
      if (roles.includes('Campaign_Manager')) {
        expect(roles).toContain('Admin');
      }
    });
  });

  it('Admin is a superset of Support_Staff permissions', () => {
    Object.entries(PERMISSIONS).forEach(([perm, roles]) => {
      if (roles.includes('Support_Staff')) {
        expect(roles).toContain('Admin');
      }
    });
  });

  it('Support_Staff only has read permissions (no write/delete/execute/admin)', () => {
    const writePatterns = [':write', ':delete', ':execute', ':admin'];
    Object.entries(PERMISSIONS).forEach(([perm, roles]) => {
      const isWriteAction = writePatterns.some((p) => perm.endsWith(p));
      if (isWriteAction) {
        expect(roles).not.toContain('Support_Staff');
      }
    });
  });

  it('Campaign_Manager cannot access any admin: permissions', () => {
    Object.entries(PERMISSIONS).forEach(([perm, roles]) => {
      if (perm.startsWith('admin:')) {
        expect(roles).not.toContain('Campaign_Manager');
      }
    });
  });

  it('every permission in the matrix has at least one role', () => {
    Object.entries(PERMISSIONS).forEach(([perm, roles]) => {
      expect(roles.length).toBeGreaterThan(0);
    });
  });

  it('all roles in the matrix are valid User model roles', () => {
    const validRoles = new Set(['Admin', 'Campaign_Manager', 'Support_Staff']);
    Object.entries(PERMISSIONS).forEach(([perm, roles]) => {
      roles.forEach((role) => {
        expect(validRoles.has(role)).toBe(true);
      });
    });
  });
});
