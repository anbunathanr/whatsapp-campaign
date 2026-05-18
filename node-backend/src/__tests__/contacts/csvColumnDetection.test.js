'use strict';

/**
 * Unit tests for CSV flexible column name detection.
 *
 * Tests the normalizeHeader() function and parseCSVBuffer() to verify that
 * all supported column name variations are correctly mapped to canonical
 * field names, satisfying:
 *   - Requirement 3.1: Parse name, phone, job title, and company fields
 *   - Requirement 3 Correctness Property 4: CSV Parsing Correctness —
 *     detect and normalize column headers case-insensitively, handle
 *     quoted fields containing commas, handle different line endings.
 */

const { normalizeHeader, parseCSVBuffer } = require('../../services/contact.service');

// ── normalizeHeader unit tests ────────────────────────────────────────────────

describe('normalizeHeader()', () => {
  // ── name field ─────────────────────────────────────────────────────────────
  describe('name field detection', () => {
    const nameCases = [
      'name',
      'Name',
      'NAME',
      'full name',
      'Full Name',
      'FULL NAME',
      'fullname',
      'FullName',
      'full_name',
      'Full_Name',
      'FULL_NAME',
      'contact name',
      'Contact Name',
      'contactname',
      'contact_name',
      'Contact_Name',
      'first name',
      'First Name',
      'firstname',
      'first_name',
    ];

    test.each(nameCases)('"%s" maps to "name"', (header) => {
      expect(normalizeHeader(header)).toBe('name');
    });
  });

  // ── phone field ────────────────────────────────────────────────────────────
  describe('phone field detection', () => {
    const phoneCases = [
      'phone',
      'Phone',
      'PHONE',
      'phone number',
      'Phone Number',
      'PHONE NUMBER',
      'phone_number',
      'Phone_Number',
      'PHONE_NUMBER',
      'mobile',
      'Mobile',
      'MOBILE',
      'mobile number',
      'Mobile Number',
      'mobile_number',
      'Mobile_Number',
      'telephone',
      'Telephone',
      'TELEPHONE',
      'tel',
      'Tel',
      'TEL',
      'cell',
      'Cell',
      'CELL',
      'whatsapp',
      'WhatsApp',
      'WHATSAPP',
    ];

    test.each(phoneCases)('"%s" maps to "phone"', (header) => {
      expect(normalizeHeader(header)).toBe('phone');
    });
  });

  // ── jobTitle field ─────────────────────────────────────────────────────────
  describe('jobTitle field detection', () => {
    const jobTitleCases = [
      'job title',
      'Job Title',
      'JOB TITLE',
      'jobtitle',
      'JobTitle',
      'JOBTITLE',
      'job_title',
      'Job_Title',
      'JOB_TITLE',
      'title',
      'Title',
      'TITLE',
      'position',
      'Position',
      'POSITION',
      'role',
      'Role',
      'ROLE',
      'designation',
      'Designation',
      'DESIGNATION',
    ];

    test.each(jobTitleCases)('"%s" maps to "jobTitle"', (header) => {
      expect(normalizeHeader(header)).toBe('jobTitle');
    });
  });

  // ── company field ──────────────────────────────────────────────────────────
  describe('company field detection', () => {
    const companyCases = [
      'company',
      'Company',
      'COMPANY',
      'company name',
      'Company Name',
      'COMPANY NAME',
      'company_name',
      'Company_Name',
      'COMPANY_NAME',
      'organization',
      'Organization',
      'ORGANIZATION',
      'organisation',
      'Organisation',
      'ORGANISATION',
      'business',
      'Business',
      'BUSINESS',
      'employer',
      'Employer',
      'EMPLOYER',
      'org',
      'Org',
      'ORG',
    ];

    test.each(companyCases)('"%s" maps to "company"', (header) => {
      expect(normalizeHeader(header)).toBe('company');
    });
  });

  // ── industry field ─────────────────────────────────────────────────────────
  describe('industry field detection', () => {
    const industryCases = [
      'industry',
      'Industry',
      'INDUSTRY',
      'sector',
      'Sector',
      'SECTOR',
      'business type',
      'Business Type',
      'BUSINESS TYPE',
      'business_type',
      'Business_Type',
      'BUSINESS_TYPE',
      'industry type',
      'Industry Type',
      'INDUSTRY TYPE',
      'industry_type',
      'Industry_Type',
      'INDUSTRY_TYPE',
    ];

    test.each(industryCases)('"%s" maps to "industry"', (header) => {
      expect(normalizeHeader(header)).toBe('industry');
    });
  });

  // ── tags field ─────────────────────────────────────────────────────────────
  describe('tags field detection', () => {
    const tagsCases = [
      'tags',
      'Tags',
      'TAGS',
      'tag',
      'Tag',
      'TAG',
      'labels',
      'Labels',
      'LABELS',
      'categories',
      'Categories',
      'CATEGORIES',
      'category',
      'Category',
      'CATEGORY',
    ];

    test.each(tagsCases)('"%s" maps to "tags"', (header) => {
      expect(normalizeHeader(header)).toBe('tags');
    });
  });

  // ── location.city field ────────────────────────────────────────────────────
  describe('location.city field detection', () => {
    const cityCases = [
      'city',
      'City',
      'CITY',
      'location',
      'Location',
      'LOCATION',
      'town',
      'Town',
      'TOWN',
    ];

    test.each(cityCases)('"%s" maps to "location.city"', (header) => {
      expect(normalizeHeader(header)).toBe('location.city');
    });
  });

  // ── location.state field ───────────────────────────────────────────────────
  describe('location.state field detection', () => {
    const stateCases = [
      'state',
      'State',
      'STATE',
      'province',
      'Province',
      'PROVINCE',
      'region',
      'Region',
      'REGION',
    ];

    test.each(stateCases)('"%s" maps to "location.state"', (header) => {
      expect(normalizeHeader(header)).toBe('location.state');
    });
  });

  // ── location.country field ─────────────────────────────────────────────────
  describe('location.country field detection', () => {
    const countryCases = [
      'country',
      'Country',
      'COUNTRY',
      'nation',
      'Nation',
      'NATION',
    ];

    test.each(countryCases)('"%s" maps to "location.country"', (header) => {
      expect(normalizeHeader(header)).toBe('location.country');
    });
  });

  // ── unrecognized headers ───────────────────────────────────────────────────
  describe('unrecognized headers', () => {
    it('returns null for an unrecognized header', () => {
      expect(normalizeHeader('unknown_column')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(normalizeHeader('')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(normalizeHeader(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(normalizeHeader(undefined)).toBeNull();
    });

    it('returns null for a non-string input', () => {
      expect(normalizeHeader(42)).toBeNull();
    });
  });
});

// ── parseCSVBuffer unit tests ─────────────────────────────────────────────────

describe('parseCSVBuffer()', () => {
  const buildCSV = (rows) => Buffer.from(rows.join('\n'), 'utf8');
  const buildCSVCRLF = (rows) => Buffer.from(rows.join('\r\n'), 'utf8');

  // ── Basic parsing ──────────────────────────────────────────────────────────
  it('parses a simple CSV with standard headers', async () => {
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].phone).toBe('+12125551234');
    expect(rows[0].industry).toBe('Technology');
  });

  it('returns an empty rows array for a header-only CSV', async () => {
    const csv = buildCSV(['name,phone,industry']);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(0);
  });

  // ── Case-insensitive header detection ─────────────────────────────────────
  it('maps uppercase headers to canonical field names', async () => {
    const csv = buildCSV([
      'NAME,PHONE,INDUSTRY',
      'Alice,+12125551234,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].phone).toBe('+12125551234');
    expect(rows[0].industry).toBe('Technology');
  });

  it('maps mixed-case headers to canonical field names', async () => {
    const csv = buildCSV([
      'Full Name,Phone Number,Job Title,Company Name,Industry',
      'Alice Smith,+12125551234,Engineer,Acme Corp,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].name).toBe('Alice Smith');
    expect(rows[0].phone).toBe('+12125551234');
    expect(rows[0].jobTitle).toBe('Engineer');
    expect(rows[0].company).toBe('Acme Corp');
    expect(rows[0].industry).toBe('Technology');
  });

  // ── Underscore variant headers ─────────────────────────────────────────────
  it('maps underscore-variant headers (full_name, phone_number, job_title, company_name)', async () => {
    const csv = buildCSV([
      'full_name,phone_number,job_title,company_name,industry_type',
      'Alice Smith,+12125551234,Engineer,Acme Corp,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].name).toBe('Alice Smith');
    expect(rows[0].phone).toBe('+12125551234');
    expect(rows[0].jobTitle).toBe('Engineer');
    expect(rows[0].company).toBe('Acme Corp');
    expect(rows[0].industry).toBe('Technology');
  });

  it('maps "whatsapp" header to phone field', async () => {
    const csv = buildCSV([
      'name,whatsapp,industry',
      'Alice,+12125551234,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].phone).toBe('+12125551234');
  });

  it('maps "mobile_number" header to phone field', async () => {
    const csv = buildCSV([
      'name,mobile_number,industry',
      'Alice,+12125551234,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].phone).toBe('+12125551234');
  });

  it('maps "org" header to company field', async () => {
    const csv = buildCSV([
      'name,phone,org,industry',
      'Alice,+12125551234,Acme Corp,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].company).toBe('Acme Corp');
  });

  it('maps "business" header to company field', async () => {
    const csv = buildCSV([
      'name,phone,business,industry',
      'Alice,+12125551234,Acme Corp,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].company).toBe('Acme Corp');
  });

  it('maps "business_type" header to industry field', async () => {
    const csv = buildCSV([
      'name,phone,business_type',
      'Alice,+12125551234,Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].industry).toBe('Technology');
  });

  it('maps "sector" header to industry field', async () => {
    const csv = buildCSV([
      'name,phone,sector',
      'Alice,+12125551234,Healthcare',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].industry).toBe('Healthcare');
  });

  it('maps "categories" header to tags field', async () => {
    const csv = buildCSV([
      'name,phone,industry,categories',
      'Alice,+12125551234,Technology,vip',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].tags).toBe('vip');
  });

  it('maps "category" header to tags field', async () => {
    const csv = buildCSV([
      'name,phone,industry,category',
      'Alice,+12125551234,Technology,prospect',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].tags).toBe('prospect');
  });

  it('maps "town" header to location.city field', async () => {
    const csv = buildCSV([
      'name,phone,industry,town',
      'Alice,+12125551234,Technology,Springfield',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0]['location.city']).toBe('Springfield');
  });

  it('maps "region" header to location.state field', async () => {
    const csv = buildCSV([
      'name,phone,industry,region',
      'Alice,+12125551234,Technology,Midwest',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0]['location.state']).toBe('Midwest');
  });

  it('maps "province" header to location.state field', async () => {
    const csv = buildCSV([
      'name,phone,industry,province',
      'Alice,+12125551234,Technology,Ontario',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0]['location.state']).toBe('Ontario');
  });

  // ── Quoted fields with commas ──────────────────────────────────────────────
  it('correctly parses quoted fields containing commas', async () => {
    const csv = buildCSV([
      'name,phone,company,industry',
      '"Smith, John",+12125551234,"Acme, Inc.",Technology',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows[0].name).toBe('Smith, John');
    expect(rows[0].company).toBe('Acme, Inc.');
  });

  it('correctly parses quoted fields with embedded newlines', async () => {
    // csv-parser handles quoted fields with embedded newlines
    const csv = Buffer.from(
      'name,phone,industry\n"Alice\nSmith",+12125551234,Technology\n',
      'utf8'
    );
    const { rows } = await parseCSVBuffer(csv);
    // The name should contain the embedded newline
    expect(rows[0].phone).toBe('+12125551234');
  });

  // ── Line ending handling ───────────────────────────────────────────────────
  it('handles CRLF line endings', async () => {
    const csv = buildCSVCRLF([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
      'Bob,+12125551235,Healthcare',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alice');
    expect(rows[1].name).toBe('Bob');
  });

  it('handles LF line endings', async () => {
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551234,Technology',
      'Bob,+12125551235,Healthcare',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alice');
    expect(rows[1].name).toBe('Bob');
  });

  // ── Empty rows ─────────────────────────────────────────────────────────────
  it('skips empty rows', async () => {
    const csv = Buffer.from(
      'name,phone,industry\nAlice,+12125551234,Technology\n\nBob,+12125551235,Healthcare\n',
      'utf8'
    );
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(2);
  });

  // ── UTF-8 BOM handling ─────────────────────────────────────────────────────
  it('strips UTF-8 BOM from the beginning of the file', async () => {
    // UTF-8 BOM is 0xEF 0xBB 0xBF
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from('name,phone,industry\nAlice,+12125551234,Technology\n', 'utf8');
    const csv = Buffer.concat([bom, content]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
  });

  // ── Multiple rows ──────────────────────────────────────────────────────────
  it('parses multiple rows correctly', async () => {
    const csv = buildCSV([
      'name,phone,industry',
      'Alice,+12125551001,Technology',
      'Bob,+12125551002,Healthcare',
      'Carol,+12125551003,Finance',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].name).toBe('Alice');
    expect(rows[1].name).toBe('Bob');
    expect(rows[2].name).toBe('Carol');
  });

  // ── Unrecognized columns are preserved ────────────────────────────────────
  it('preserves unrecognized column headers as-is', async () => {
    const csv = buildCSV([
      'name,phone,industry,custom_field',
      'Alice,+12125551234,Technology,some_value',
    ]);
    const { rows } = await parseCSVBuffer(csv);
    // Unrecognized headers are kept with their original name
    expect(rows[0]['custom_field']).toBe('some_value');
  });
});
