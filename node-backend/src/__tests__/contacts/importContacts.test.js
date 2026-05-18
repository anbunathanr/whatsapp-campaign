'use strict';

/**
 * Integration tests for POST /api/contacts/import
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

// ── Mock ML classifier to avoid network calls ─────────────────────────────────
jest.mock('../../services/mlClassifier.service', () => ({
  classifyIndustry: jest.fn().mockResolvedValue('Technology'),
  classifyBatch: jest.fn().mockImplementation((contacts) =>
    Promise.resolve(contacts.map(() => 'Technology'))
  ),
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

/** Build a CSV buffer from an array of rows (first row is headers). */
const buildCSV = (rows) => {
  return Buffer.from(rows.join('\n'), 'utf8');
};

const postImport = (csvBuffer, token, filename = 'contacts.csv') =>
  request(app)
    .post('/api/contacts/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', csvBuffer, { filename, contentType: 'text/csv' });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/contacts/import', () => {
  // ── Authentication & Authorization ────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    const csv = buildCSV(['name,phone,industry', 'Alice,+12125551234,Technology']);
    const res = await request(app)
      .post('/api/contacts/import')
      .attach('file', csv, { filename: 'contacts.csv', contentType: 'text/csv' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when a Support_Staff user tries to import', async () => {
    const { token } = await createUserAndToken('Support_Staff');
    const csv = buildCSV(['name,phone,industry', 'Alice,+12125551234,Technology']);
    const res = await postImport(csv, token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── File validation ───────────────────────────────────────────────────────

  it('returns 400 when no file is uploaded', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await request(app)
      .post('/api/contacts/import')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no file/i);
  });

  it('returns 400 when a non-CSV file is uploaded', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await request(app)
      .post('/api/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not a csv'), {
        filename: 'data.exe',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when the CSV file is empty', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    // Only headers, no data rows
    const csv = buildCSV(['name,phone,industry']);
    const res = await postImport(csv, token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/empty/i);
  });

  // ── Happy path: basic import ──────────────────────────────────────────────

  it('imports a single valid contact and returns 200 with summary', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,jobTitle,company,industry',
      'Alice Smith,+12125551234,Engineer,Acme Corp,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.totalRows).toBe(1);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.duplicateCount).toBe(0);
    expect(res.body.data.summary.errorCount).toBe(0);
    expect(res.body.data.importedContacts).toHaveLength(1);
    expect(res.body.data.importedContacts[0].name).toBe('Alice Smith');
    expect(res.body.data.importedContacts[0].phone).toBe('+12125551234');
    expect(res.body.data.importedContacts[0].industry).toBe('Technology');
  });

  it('persists imported contacts to the database', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Bob Jones,+447911123456,Healthcare',
    ]);

    await postImport(csv, token);

    const stored = await Contact.findOne({ phone: '+447911123456' });
    expect(stored).not.toBeNull();
    expect(stored.name).toBe('Bob Jones');
    expect(stored.industry).toBe('Healthcare');
    expect(stored.source).toBe('csv_import');
  });

  it('imports multiple valid contacts', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551001,Technology',
      'Bob,+12125551002,Healthcare',
      'Carol,+12125551003,Finance',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(3);
    expect(res.body.data.summary.successCount).toBe(3);
    expect(res.body.data.importedContacts).toHaveLength(3);

    const count = await Contact.countDocuments();
    expect(count).toBe(3);
  });

  it('sets source to "csv_import" for all imported contacts', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551001,Technology',
    ]);

    await postImport(csv, token);

    const stored = await Contact.findOne({ phone: '+12125551001' });
    expect(stored.source).toBe('csv_import');
  });

  it('records the createdBy field as the authenticated user', async () => {
    const { user, token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551001,Technology',
    ]);

    await postImport(csv, token);

    const stored = await Contact.findOne({ phone: '+12125551001' });
    expect(stored.createdBy.toString()).toBe(user._id.toString());
  });

  // ── Flexible column name detection ───────────────────────────────────────

  it('detects "Full Name" as the name column (case-insensitive)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'Full Name,Phone Number,industry',
      'Alice Smith,+12125551234,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.importedContacts[0].name).toBe('Alice Smith');
  });

  it('detects "Mobile" as the phone column', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,Mobile,industry',
      'Alice,+12125551234,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.importedContacts[0].phone).toBe('+12125551234');
  });

  it('detects "Job Title" as the jobTitle column', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,Job Title,company,industry',
      'Alice,+12125551234,Software Engineer,Acme,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].jobTitle).toBe('Software Engineer');
  });

  it('detects "Organization" as the company column', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,Organization,industry',
      'Alice,+12125551234,Acme Corp,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].company).toBe('Acme Corp');
  });

  it('handles uppercase column headers', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'NAME,PHONE,INDUSTRY',
      'Alice,+12125551234,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
  });

  // ── Industry classification ───────────────────────────────────────────────

  it('uses ML classification when industry column is absent', async () => {
    const mlClassifier = require('../../services/mlClassifier.service');
    mlClassifier.classifyBatch.mockResolvedValueOnce(['Finance']);

    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,jobTitle,company',
      'Alice,+12125551234,Financial Analyst,Big Bank',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].industry).toBe('Finance');
    expect(mlClassifier.classifyBatch).toHaveBeenCalled();
  });

  it('uses ML classification when industry value is invalid', async () => {
    const mlClassifier = require('../../services/mlClassifier.service');
    mlClassifier.classifyBatch.mockResolvedValueOnce(['Healthcare']);

    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,InvalidIndustryXYZ',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].industry).toBe('Healthcare');
  });

  it('falls back to "Other" when ML service fails', async () => {
    const mlClassifier = require('../../services/mlClassifier.service');
    mlClassifier.classifyBatch.mockRejectedValueOnce(new Error('ML service unavailable'));

    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,jobTitle',
      'Alice,+12125551234,Engineer',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].industry).toBe('Other');
  });

  // ── Duplicate detection ───────────────────────────────────────────────────

  it('skips contacts with phone numbers already in the database', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    // Pre-insert a contact
    await Contact.create({
      name: 'Existing',
      phone: '+12125551234',
      industry: 'Technology',
      source: 'manual',
    });

    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
      'Bob,+12125551235,Healthcare',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(2);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.duplicateCount).toBe(1);
    expect(res.body.data.importedContacts[0].phone).toBe('+12125551235');
  });

  it('skips duplicate phone numbers within the same CSV file', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
      'Alice Duplicate,+12125551234,Healthcare',
      'Bob,+12125551235,Finance',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(3);
    expect(res.body.data.summary.successCount).toBe(2);
    expect(res.body.data.summary.duplicateCount).toBe(1);

    const count = await Contact.countDocuments({ phone: '+12125551234' });
    expect(count).toBe(1);
  });

  it('logs duplicate occurrences in the error report', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    await Contact.create({
      name: 'Existing',
      phone: '+12125551234',
      industry: 'Technology',
      source: 'manual',
    });

    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.body.data.errorReport).toBeDefined();
    expect(res.body.data.errorReport).toHaveLength(1);
    expect(res.body.data.errorReport[0].reason).toMatch(/duplicate/i);
    expect(res.body.data.errorReport[0].row).toBe(2);
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('skips rows with missing name and reports error', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      ',+12125551234,Technology',
      'Bob,+12125551235,Healthcare',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.errorCount).toBe(1);
    expect(res.body.data.errorReport[0].reason).toMatch(/name/i);
  });

  it('skips rows with missing phone and reports error', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,,Technology',
      'Bob,+12125551235,Healthcare',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.errorCount).toBe(1);
    expect(res.body.data.errorReport[0].reason).toMatch(/phone/i);
  });

  it('skips rows with invalid phone format and reports error', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,not-a-phone,Technology',
      'Bob,+12125551235,Healthcare',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.errorCount).toBe(1);
    expect(res.body.data.errorReport[0].reason).toMatch(/phone/i);
  });

  // ── Import summary ────────────────────────────────────────────────────────

  it('returns correct summary counts for mixed valid/invalid/duplicate rows', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    // Pre-insert one contact for duplicate detection
    await Contact.create({
      name: 'Existing',
      phone: '+12125551001',
      industry: 'Technology',
      source: 'manual',
    });

    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551002,Technology',   // valid
      'Bob,+12125551003,Healthcare',     // valid
      ',+12125551004,Finance',           // error: missing name
      'Dave,invalid-phone,Retail',      // error: invalid phone
      'Eve,+12125551001,Technology',     // duplicate
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(5);
    expect(res.body.data.summary.successCount).toBe(2);
    expect(res.body.data.summary.duplicateCount).toBe(1);
    expect(res.body.data.summary.errorCount).toBe(2);
    expect(res.body.data.errorReport).toHaveLength(3); // 2 errors + 1 duplicate
  });

  it('returns no errorReport when all rows are valid', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551001,Technology',
      'Bob,+12125551002,Healthcare',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.errorReport).toBeUndefined();
  });

  // ── Data integrity ────────────────────────────────────────────────────────

  it('creates exactly N Contact records for N valid rows (data integrity)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551001,Technology',
      'Bob,+12125551002,Healthcare',
      'Carol,+12125551003,Finance',
      'Dave,+12125551004,Education',
      'Eve,+12125551005,Retail',
    ]);

    const res = await postImport(csv, token);

    expect(res.body.data.summary.successCount).toBe(5);
    const count = await Contact.countDocuments();
    expect(count).toBe(5);
  });

  // ── Tags and location ─────────────────────────────────────────────────────

  it('parses comma-separated tags from the tags column', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry,tags',
      'Alice,+12125551234,Technology,"vip,prospect,enterprise"',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    const contact = res.body.data.importedContacts[0];
    expect(contact.tags).toEqual(expect.arrayContaining(['vip', 'prospect', 'enterprise']));
  });

  it('imports location fields (city, state, country)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,industry,city,state,country',
      'Alice,+12125551234,Technology,New York,NY,US',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    const contact = res.body.data.importedContacts[0];
    expect(contact.location.city).toBe('New York');
    expect(contact.location.state).toBe('NY');
    expect(contact.location.country).toBe('US');
  });

  // ── Admin access ──────────────────────────────────────────────────────────

  it('allows Admin role to import contacts', async () => {
    const { token } = await createUserAndToken('Admin');
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
  });

  // ── Quoted fields with commas ─────────────────────────────────────────────

  it('correctly parses quoted fields containing commas', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const csv = buildCSV([
      'name,phone,company,industry',
      '"Smith, John",+12125551234,"Acme, Inc.",Technology',
    ]);

    const res = await postImport(csv, token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.importedContacts[0].name).toBe('Smith, John');
    expect(res.body.data.importedContacts[0].company).toBe('Acme, Inc.');
  });
});
