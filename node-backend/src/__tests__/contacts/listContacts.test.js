'use strict';

/**
 * Integration tests for GET /api/contacts
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

const createUserAndToken = async (role = 'Campaign_Manager') => {
  const user = await User.create({
    email: role.toLowerCase() + '-' + Date.now() + '@example.com',
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

const get = (query, token) => {
  const req = request(app).get('/api/contacts');
  if (token) {req.set('Authorization', 'Bearer ' + token);}
  if (query) {req.query(query);}
  return req;
};

/** Seed a batch of contacts into the DB. */
const seedContacts = async (contacts) => {
  return Contact.insertMany(contacts);
};

const BASE_CONTACTS = [
  {
    name: 'Alice Smith',
    phone: '+12125550001',
    industry: 'Technology',
    company: 'TechCorp',
    tags: ['vip', 'prospect'],
    location: { city: 'New York', state: 'NY', country: 'US' },
  },
  {
    name: 'Bob Jones',
    phone: '+12125550002',
    industry: 'Healthcare',
    company: 'MedCo',
    tags: ['prospect'],
    location: { city: 'Los Angeles', state: 'CA', country: 'US' },
  },
  {
    name: 'Carol White',
    phone: '+12125550003',
    industry: 'Technology',
    company: 'StartupXYZ',
    tags: ['vip'],
    location: { city: 'New York', state: 'NY', country: 'US' },
  },
  {
    name: 'Dave Brown',
    phone: '+12125550004',
    industry: 'Finance',
    company: 'BankCo',
    tags: [],
    location: { city: 'Chicago', state: 'IL', country: 'US' },
  },
  {
    name: 'Eve Davis',
    phone: '+447911000001',
    industry: 'Healthcare',
    company: 'NHS',
    tags: ['vip', 'prospect'],
    location: { city: 'London', state: '', country: 'UK' },
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/contacts', () => {
  // ── Authentication ────────────────────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await get(null, null);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await get(null, 'invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('allows Support_Staff to list contacts (read-only access)', async () => {
    const { token } = await createUserAndToken('Support_Staff');
    const res = await get(null, token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── Response shape ────────────────────────────────────────────────────────

  it('returns correct response shape with contacts array and pagination', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get(null, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.contacts)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();

    const { pagination } = res.body.data;
    expect(pagination.total).toBeDefined();
    expect(pagination.page).toBeDefined();
    expect(pagination.limit).toBeDefined();
    expect(pagination.totalPages).toBeDefined();
    expect(typeof pagination.hasNextPage).toBe('boolean');
    expect(typeof pagination.hasPrevPage).toBe('boolean');
  });

  it('returns empty contacts array when no contacts exist', async () => {
    const { token } = await createUserAndToken();
    const res = await get(null, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contacts).toHaveLength(0);
    expect(res.body.data.pagination.total).toBe(0);
    expect(res.body.data.pagination.totalPages).toBe(0);
    expect(res.body.data.pagination.hasNextPage).toBe(false);
    expect(res.body.data.pagination.hasPrevPage).toBe(false);
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('defaults to page=1 and limit=20', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get(null, token);

    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(20);
  });

  it('respects custom page and limit parameters', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ page: 1, limit: 2 }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contacts).toHaveLength(2);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(2);
    expect(res.body.data.pagination.total).toBe(5);
    expect(res.body.data.pagination.totalPages).toBe(3);
    expect(res.body.data.pagination.hasNextPage).toBe(true);
    expect(res.body.data.pagination.hasPrevPage).toBe(false);
  });

  it('returns correct page 2 results', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ page: 2, limit: 2 }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contacts).toHaveLength(2);
    expect(res.body.data.pagination.page).toBe(2);
    expect(res.body.data.pagination.hasPrevPage).toBe(true);
    expect(res.body.data.pagination.hasNextPage).toBe(true);
  });

  it('caps limit at 100', async () => {
    const { token } = await createUserAndToken();
    const res = await get({ limit: 999 }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(100);
  });

  it('returns empty array for page beyond total pages', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ page: 100, limit: 20 }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.contacts).toHaveLength(0);
  });

  // ── Filtering by industry ─────────────────────────────────────────────────

  it('filters by a single industry', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ industry: 'Technology' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
    res.body.data.contacts.forEach((c) => {
      expect(c.industry).toBe('Technology');
    });
  });

  it('filters by multiple industries (comma-separated)', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ industry: 'Technology,Healthcare' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(4);
    res.body.data.contacts.forEach((c) => {
      expect(['Technology', 'Healthcare']).toContain(c.industry);
    });
  });

  it('returns empty results for a non-matching industry', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ industry: 'Aerospace' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(0);
    expect(res.body.data.contacts).toHaveLength(0);
  });

  // ── Filtering by tags ─────────────────────────────────────────────────────

  it('filters by a single tag', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ tags: 'vip' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(3); // Alice, Carol, Eve
    res.body.data.contacts.forEach((c) => {
      expect(c.tags).toContain('vip');
    });
  });

  it('filters by multiple tags using AND logic (contact must have ALL tags)', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ tags: 'vip,prospect' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2); // Alice and Eve have both vip and prospect
    res.body.data.contacts.forEach((c) => {
      expect(c.tags).toContain('vip');
      expect(c.tags).toContain('prospect');
    });
  });

  // ── Filtering by location ─────────────────────────────────────────────────

  it('filters by location.country', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ 'location.country': 'UK' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.contacts[0].name).toBe('Eve Davis');
  });

  it('filters by location.city', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ 'location.city': 'New York' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2); // Alice and Carol
  });

  it('filters by location.state', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ 'location.state': 'CA' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.contacts[0].name).toBe('Bob Jones');
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it('searches by name (case-insensitive)', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ search: 'alice' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.contacts[0].name).toBe('Alice Smith');
  });

  it('searches by company name', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ search: 'TechCorp' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.contacts[0].company).toBe('TechCorp');
  });

  it('searches by phone number', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ search: '+447911000001' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.contacts[0].name).toBe('Eve Davis');
  });

  it('returns empty results for a non-matching search term', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ search: 'zzznomatch' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(0);
  });

  // ── AND logic for combined filters ────────────────────────────────────────

  it('applies AND logic when multiple filters are combined', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    // Technology AND New York → only Alice and Carol, but Carol has no 'prospect' tag
    const res = await get({ industry: 'Technology', 'location.city': 'New York' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2); // Alice and Carol
    res.body.data.contacts.forEach((c) => {
      expect(c.industry).toBe('Technology');
      expect(c.location.city).toBe('New York');
    });
  });

  it('returns empty when AND filters produce no matches', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    // Healthcare AND country=UK AND tags=vip → only Eve
    // But Healthcare AND country=US → Bob only, Bob has no vip tag
    const res = await get({ industry: 'Healthcare', 'location.country': 'US', tags: 'vip' }, token);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(0);
  });

  // ── Sorting ───────────────────────────────────────────────────────────────

  it('defaults to sorting by createdAt descending', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get(null, token);

    expect(res.status).toBe(200);
    const contacts = res.body.data.contacts;
    // Verify descending order by createdAt
    for (let i = 1; i < contacts.length; i++) {
      expect(new Date(contacts[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(contacts[i].createdAt).getTime()
      );
    }
  });

  it('sorts by name ascending when sortBy=name&sortOrder=asc', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ sortBy: 'name', sortOrder: 'asc' }, token);

    expect(res.status).toBe(200);
    const names = res.body.data.contacts.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('sorts by name descending when sortBy=name&sortOrder=desc', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ sortBy: 'name', sortOrder: 'desc' }, token);

    expect(res.status).toBe(200);
    const names = res.body.data.contacts.map((c) => c.name);
    const sorted = [...names].sort().reverse();
    expect(names).toEqual(sorted);
  });

  it('ignores invalid sortBy field and falls back to createdAt', async () => {
    const { token } = await createUserAndToken();
    await seedContacts(BASE_CONTACTS);

    const res = await get({ sortBy: 'invalidField' }, token);

    expect(res.status).toBe(200);
    // Should still return results without error
    expect(res.body.data.contacts.length).toBeGreaterThan(0);
  });
});
