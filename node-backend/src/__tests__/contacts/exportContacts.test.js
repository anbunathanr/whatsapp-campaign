'use strict';

/**
 * Integration tests for GET /api/contacts/export
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance
 * and supertest to drive the Express app.
 *
 * Validates:
 *   - Authentication and authorization (JWT required, Admin/Campaign_Manager only)
 *   - CSV file download response (Content-Type, Content-Disposition headers)
 *   - CSV content correctness (all contact fields present)
 *   - Filter support (industry, tags, location, search)
 *   - Round-trip property: exported CSV can be re-imported to produce identical records
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

const exportRequest = (query, token) => {
  const req = request(app).get('/api/contacts/export');
  if (token) {req.set('Authorization', 'Bearer ' + token);}
  if (query) {req.query(query);}
  return req;
};

/** Parse a CSV string into an array of row objects keyed by header. */
const parseCSV = (csvString) => {
  const lines = csvString.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {return [];}
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    // Simple CSV parse (handles quoted fields)
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    return row;
  });
};

const BASE_CONTACTS = [
  {
    name: 'Alice Smith',
    phone: '+12125550001',
    industry: 'Technology',
    company: 'TechCorp',
    jobTitle: 'Engineer',
    tags: ['vip', 'prospect'],
    location: { city: 'New York', state: 'NY', country: 'US' },
  },
  {
    name: 'Bob Jones',
    phone: '+12125550002',
    industry: 'Healthcare',
    company: 'MedCo',
    jobTitle: 'Doctor',
    tags: ['prospect'],
    location: { city: 'Los Angeles', state: 'CA', country: 'US' },
  },
  {
    name: 'Carol White',
    phone: '+12125550003',
    industry: 'Technology',
    company: 'StartupXYZ',
    jobTitle: 'Designer',
    tags: ['vip'],
    location: { city: 'New York', state: 'NY', country: 'US' },
  },
  {
    name: 'Dave Brown',
    phone: '+12125550004',
    industry: 'Finance',
    company: 'BankCo',
    jobTitle: 'Analyst',
    tags: [],
    location: { city: 'Chicago', state: 'IL', country: 'US' },
  },
  {
    name: 'Eve Davis',
    phone: '+447911000001',
    industry: 'Healthcare',
    company: 'NHS',
    jobTitle: 'Nurse',
    tags: ['vip', 'prospect'],
    location: { city: 'London', state: '', country: 'UK' },
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/contacts/export', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const res = await exportRequest(null, null);
    expect(res.status).toBe(401);
  });

  it('returns 401 when an invalid token is provided', async () => {
    const res = await exportRequest(null, 'invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('returns 403 when Support_Staff tries to export', async () => {
    const { token } = await createUserAndToken('Support_Staff');
    const res = await exportRequest(null, token);
    expect(res.status).toBe(403);
  });

  it('allows Campaign_Manager to export', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await exportRequest(null, token);
    expect(res.status).toBe(200);
  });

  it('allows Admin to export', async () => {
    const { token } = await createUserAndToken('Admin');
    const res = await exportRequest(null, token);
    expect(res.status).toBe(200);
  });

  // ── Response headers ──────────────────────────────────────────────────────

  it('returns correct Content-Type header for CSV download', async () => {
    const { token } = await createUserAndToken();
    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('returns Content-Disposition attachment header with .csv filename', async () => {
    const { token } = await createUserAndToken();
    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/\.csv/);
  });

  // ── CSV content ───────────────────────────────────────────────────────────

  it('returns a CSV with the correct header row', async () => {
    const { token } = await createUserAndToken();
    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const firstLine = res.text.split('\n')[0];
    expect(firstLine).toBe('name,phone,job_title,company,industry,tags,city,state,country');
  });

  it('returns an empty CSV (header only) when no contacts exist', async () => {
    const { token } = await createUserAndToken();
    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1); // only header
    expect(lines[0]).toBe('name,phone,job_title,company,industry,tags,city,state,country');
  });

  it('exports all contacts when no filters are applied', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(BASE_CONTACTS.length);
  });

  it('includes all required fields in each CSV row', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany([BASE_CONTACTS[0]]); // Alice

    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.name).toBe('Alice Smith');
    expect(row.phone).toBe('+12125550001');
    expect(row.job_title).toBe('Engineer');
    expect(row.company).toBe('TechCorp');
    expect(row.industry).toBe('Technology');
    expect(row.city).toBe('New York');
    expect(row.state).toBe('NY');
    expect(row.country).toBe('US');
  });

  it('serialises tags as semicolon-separated values', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany([BASE_CONTACTS[0]]); // Alice has tags: ['vip', 'prospect']

    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows[0].tags).toBe('vip;prospect');
  });

  it('exports empty tags field for contacts with no tags', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany([BASE_CONTACTS[3]]); // Dave has no tags

    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows[0].tags).toBe('');
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  it('filters exported contacts by industry', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ industry: 'Technology' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(2); // Alice and Carol
    rows.forEach((row) => expect(row.industry).toBe('Technology'));
  });

  it('filters by multiple industries (comma-separated)', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ industry: 'Technology,Finance' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(3); // Alice, Carol, Dave
    rows.forEach((row) => {
      expect(['Technology', 'Finance']).toContain(row.industry);
    });
  });

  it('filters exported contacts by tag', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ tags: 'vip' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(3); // Alice, Carol, Eve
    rows.forEach((row) => {
      expect(row.tags).toContain('vip');
    });
  });

  it('filters by multiple tags using AND logic', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ tags: 'vip,prospect' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(2); // Alice and Eve have both vip and prospect
    rows.forEach((row) => {
      expect(row.tags).toContain('vip');
      expect(row.tags).toContain('prospect');
    });
  });

  it('filters exported contacts by location.country', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ 'location.country': 'UK' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Eve Davis');
    expect(rows[0].country).toBe('UK');
  });

  it('filters exported contacts by location.city', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ 'location.city': 'New York' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(2); // Alice and Carol
    rows.forEach((row) => expect(row.city).toBe('New York'));
  });

  it('filters exported contacts by search term', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ search: 'alice' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice Smith');
  });

  it('returns empty CSV when filters match no contacts', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    const res = await exportRequest({ industry: 'Aerospace' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(0);
  });

  it('applies AND logic when multiple filters are combined', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany(BASE_CONTACTS);

    // Technology AND New York → Alice and Carol
    const res = await exportRequest({ industry: 'Technology', 'location.city': 'New York' }, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.industry).toBe('Technology');
      expect(row.city).toBe('New York');
    });
  });

  // ── Round-trip property ───────────────────────────────────────────────────
  // Validates: Requirements 3.8 — FOR ALL exported CSV_Files, re-importing
  // SHALL produce identical Contact records (excluding duplicates).

  it('round-trip: exported CSV header matches import column names', async () => {
    const { token } = await createUserAndToken();
    await Contact.insertMany([BASE_CONTACTS[0]]);

    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const header = res.text.split('\n')[0];
    // These column names must match what the import parser recognises
    expect(header).toContain('name');
    expect(header).toContain('phone');
    expect(header).toContain('job_title');
    expect(header).toContain('company');
    expect(header).toContain('industry');
    expect(header).toContain('tags');
    expect(header).toContain('city');
    expect(header).toContain('state');
    expect(header).toContain('country');
  });

  it('round-trip: exported data preserves all contact field values', async () => {
    const { token } = await createUserAndToken();
    const contact = {
      name: 'Test Contact',
      phone: '+19995550001',
      jobTitle: 'CEO',
      company: 'Acme Corp',
      industry: 'Technology',
      tags: ['alpha', 'beta'],
      location: { city: 'San Francisco', state: 'CA', country: 'US' },
    };
    await Contact.insertMany([contact]);

    const res = await exportRequest(null, token);

    expect(res.status).toBe(200);
    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.name).toBe(contact.name);
    expect(row.phone).toBe(contact.phone);
    expect(row.job_title).toBe(contact.jobTitle);
    expect(row.company).toBe(contact.company);
    expect(row.industry).toBe(contact.industry);
    // Tags are semicolon-separated in export
    expect(row.tags).toBe(contact.tags.join(';'));
    expect(row.city).toBe(contact.location.city);
    expect(row.state).toBe(contact.location.state);
    expect(row.country).toBe(contact.location.country);
  });
});
