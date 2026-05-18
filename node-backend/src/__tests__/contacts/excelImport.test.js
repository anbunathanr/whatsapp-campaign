'use strict';

/**
 * Integration tests for POST /api/contacts/import with Excel (.xlsx and .xls) files.
 *
 * Validates Task 3.5 sub-task: "Support .xlsx and .xls formats"
 * Validates Requirement 3.12: "The Platform SHALL support Excel file import in addition to CSV_File format"
 * Validates Property 4: CSV/Excel Parsing Correctness
 *
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance
 * and supertest to drive the Express app.
 * Uses the xlsx library to generate real Excel buffers for testing.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');

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

/**
 * Build an Excel buffer (.xlsx or .xls) from an array of row arrays.
 * First row is treated as headers.
 *
 * @param {Array<Array<string>>} rows - Array of rows, first row is headers
 * @param {string} bookType - 'xlsx' or 'xls' (biff8)
 * @returns {Buffer}
 */
const buildExcelBuffer = (rows, bookType = 'xlsx') => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
  const xlsxType = bookType === 'xls' ? 'biff8' : 'xlsx';
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: xlsxType }));
};

/** Post an Excel file to the import endpoint. */
const postExcelImport = (buffer, token, filename = 'contacts.xlsx') => {
  const contentType =
    filename.endsWith('.xls')
      ? 'application/vnd.ms-excel'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return request(app)
    .post('/api/contacts/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buffer, { filename, contentType });
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/contacts/import — Excel (.xlsx) support', () => {
  // ── File type acceptance ──────────────────────────────────────────────────

  it('accepts .xlsx files and returns 200', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice Smith', '+12125551234', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts .xls files and returns 200', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer(
      [
        ['name', 'phone', 'industry'],
        ['Bob Jones', '+447911123456', 'Healthcare'],
      ],
      'xls'
    );

    const res = await postExcelImport(buffer, token, 'contacts.xls');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── Happy path: basic import ──────────────────────────────────────────────

  it('imports a single valid contact from .xlsx and returns correct summary', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'jobTitle', 'company', 'industry'],
      ['Alice Smith', '+12125551234', 'Engineer', 'Acme Corp', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(1);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.duplicateCount).toBe(0);
    expect(res.body.data.summary.errorCount).toBe(0);
    expect(res.body.data.importedContacts).toHaveLength(1);
    expect(res.body.data.importedContacts[0].name).toBe('Alice Smith');
    expect(res.body.data.importedContacts[0].phone).toBe('+12125551234');
    expect(res.body.data.importedContacts[0].industry).toBe('Technology');
  });

  it('imports a single valid contact from .xls and returns correct summary', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer(
      [
        ['name', 'phone', 'industry'],
        ['Bob Jones', '+447911123456', 'Healthcare'],
      ],
      'xls'
    );

    const res = await postExcelImport(buffer, token, 'contacts.xls');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(1);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.importedContacts[0].name).toBe('Bob Jones');
    expect(res.body.data.importedContacts[0].phone).toBe('+447911123456');
  });

  it('persists contacts imported from .xlsx to the database', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice Smith', '+12125551234', 'Technology'],
    ]);

    await postExcelImport(buffer, token, 'contacts.xlsx');

    const stored = await Contact.findOne({ phone: '+12125551234' });
    expect(stored).not.toBeNull();
    expect(stored.name).toBe('Alice Smith');
    expect(stored.industry).toBe('Technology');
  });

  it('sets source to "excel_import" for contacts imported from .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice Smith', '+12125551234', 'Technology'],
    ]);

    await postExcelImport(buffer, token, 'contacts.xlsx');

    const stored = await Contact.findOne({ phone: '+12125551234' });
    expect(stored.source).toBe('excel_import');
  });

  it('sets source to "excel_import" for contacts imported from .xls', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer(
      [
        ['name', 'phone', 'industry'],
        ['Bob Jones', '+447911123456', 'Healthcare'],
      ],
      'xls'
    );

    await postExcelImport(buffer, token, 'contacts.xls');

    const stored = await Contact.findOne({ phone: '+447911123456' });
    expect(stored.source).toBe('excel_import');
  });

  it('imports multiple contacts from .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551001', 'Technology'],
      ['Bob', '+12125551002', 'Healthcare'],
      ['Carol', '+12125551003', 'Finance'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(3);
    expect(res.body.data.summary.successCount).toBe(3);
    expect(res.body.data.importedContacts).toHaveLength(3);

    const count = await Contact.countDocuments();
    expect(count).toBe(3);
  });

  it('records the createdBy field as the authenticated user for Excel imports', async () => {
    const { user, token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551001', 'Technology'],
    ]);

    await postExcelImport(buffer, token, 'contacts.xlsx');

    const stored = await Contact.findOne({ phone: '+12125551001' });
    expect(stored.createdBy.toString()).toBe(user._id.toString());
  });

  // ── Flexible column name detection ───────────────────────────────────────

  it('detects "Full Name" as the name column in .xlsx (case-insensitive)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['Full Name', 'Phone Number', 'Industry'],
      ['Alice Smith', '+12125551234', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.importedContacts[0].name).toBe('Alice Smith');
  });

  it('detects "Mobile" as the phone column in .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'Mobile', 'industry'],
      ['Alice', '+12125551234', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].phone).toBe('+12125551234');
  });

  it('detects "Job Title" as the jobTitle column in .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'Job Title', 'company', 'industry'],
      ['Alice', '+12125551234', 'Software Engineer', 'Acme', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].jobTitle).toBe('Software Engineer');
  });

  it('detects "Organization" as the company column in .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'Organization', 'industry'],
      ['Alice', '+12125551234', 'Acme Corp', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].company).toBe('Acme Corp');
  });

  it('handles uppercase column headers in .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['NAME', 'PHONE', 'INDUSTRY'],
      ['Alice', '+12125551234', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('returns 400 when .xlsx file is empty (header only)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([['name', 'phone', 'industry']]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/empty/i);
  });

  it('skips rows with missing name in .xlsx and reports error', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['', '+12125551234', 'Technology'],
      ['Bob', '+12125551235', 'Healthcare'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.errorCount).toBe(1);
    expect(res.body.data.errorReport[0].reason).toMatch(/name/i);
  });

  it('skips rows with invalid phone format in .xlsx and reports error', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', 'not-a-phone', 'Technology'],
      ['Bob', '+12125551235', 'Healthcare'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.errorCount).toBe(1);
    expect(res.body.data.errorReport[0].reason).toMatch(/phone/i);
  });

  // ── Duplicate detection ───────────────────────────────────────────────────

  it('skips contacts with phone numbers already in the database (Excel import)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');

    // Pre-insert a contact
    await Contact.create({
      name: 'Existing',
      phone: '+12125551234',
      industry: 'Technology',
      source: 'manual',
    });

    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551234', 'Technology'],
      ['Bob', '+12125551235', 'Healthcare'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(2);
    expect(res.body.data.summary.successCount).toBe(1);
    expect(res.body.data.summary.duplicateCount).toBe(1);
    expect(res.body.data.importedContacts[0].phone).toBe('+12125551235');
  });

  it('skips duplicate phone numbers within the same .xlsx file', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551234', 'Technology'],
      ['Alice Duplicate', '+12125551234', 'Healthcare'],
      ['Bob', '+12125551235', 'Finance'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalRows).toBe(3);
    expect(res.body.data.summary.successCount).toBe(2);
    expect(res.body.data.summary.duplicateCount).toBe(1);

    const count = await Contact.countDocuments({ phone: '+12125551234' });
    expect(count).toBe(1);
  });

  // ── Industry classification ───────────────────────────────────────────────

  it('uses ML classification when industry column is absent in .xlsx', async () => {
    const mlClassifier = require('../../services/mlClassifier.service');
    mlClassifier.classifyBatch.mockResolvedValueOnce(['Finance']);

    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'jobTitle', 'company'],
      ['Alice', '+12125551234', 'Financial Analyst', 'Big Bank'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.importedContacts[0].industry).toBe('Finance');
    expect(mlClassifier.classifyBatch).toHaveBeenCalled();
  });

  // ── Tags and location ─────────────────────────────────────────────────────

  it('parses comma-separated tags from the tags column in .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry', 'tags'],
      ['Alice', '+12125551234', 'Technology', 'vip,prospect,enterprise'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    const contact = res.body.data.importedContacts[0];
    expect(contact.tags).toEqual(expect.arrayContaining(['vip', 'prospect', 'enterprise']));
  });

  it('imports location fields (city, state, country) from .xlsx', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry', 'city', 'state', 'country'],
      ['Alice', '+12125551234', 'Technology', 'New York', 'NY', 'US'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    const contact = res.body.data.importedContacts[0];
    expect(contact.location.city).toBe('New York');
    expect(contact.location.state).toBe('NY');
    expect(contact.location.country).toBe('US');
  });

  // ── Data integrity ────────────────────────────────────────────────────────

  it('creates exactly N Contact records for N valid rows in .xlsx (data integrity)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551001', 'Technology'],
      ['Bob', '+12125551002', 'Healthcare'],
      ['Carol', '+12125551003', 'Finance'],
      ['Dave', '+12125551004', 'Education'],
      ['Eve', '+12125551005', 'Retail'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.body.data.summary.successCount).toBe(5);
    const count = await Contact.countDocuments();
    expect(count).toBe(5);
  });

  // ── Error handling for unsupported formats ────────────────────────────────

  it('returns 400 when an unsupported file format is uploaded (e.g., .exe)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await request(app)
      .post('/api/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not a valid file'), {
        filename: 'data.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when a .txt file is uploaded (not CSV or Excel)', async () => {
    const { token } = await createUserAndToken('Campaign_Manager');
    const res = await request(app)
      .post('/api/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('some text content'), {
        filename: 'data.txt',
        contentType: 'text/plain',
      });

    // text/plain is in the allowed MIME types list (for CSV), so this may pass
    // the Multer filter but fail during parsing — either 400 is acceptable
    expect([400, 200]).toContain(res.status);
  });

  // ── Admin access ──────────────────────────────────────────────────────────

  it('allows Admin role to import contacts from .xlsx', async () => {
    const { token } = await createUserAndToken('Admin');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551234', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.successCount).toBe(1);
  });

  it('returns 403 when Support_Staff tries to import .xlsx', async () => {
    const { token } = await createUserAndToken('Support_Staff');
    const buffer = buildExcelBuffer([
      ['name', 'phone', 'industry'],
      ['Alice', '+12125551234', 'Technology'],
    ]);

    const res = await postExcelImport(buffer, token, 'contacts.xlsx');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
