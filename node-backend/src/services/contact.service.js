/**
 * Contact Service
 * Handles contact CRUD, CSV/Excel import, segmentation, and bulk operations.
 * Full implementation: Tasks 3.2 – 3.8
 */

const Contact = require('../models/Contact');
const { isValidE164Phone, normalizePhone, validatePhone } = require('../utils/validators');
const { normalizeIndianPhone } = require('../utils/phoneNormalizer');
const logger = require('../utils/logger');
const mlClassifier = require('./mlClassifier.service');

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * List contacts with pagination, filtering, and sorting.
 *
 * Supported filters (all use AND logic when combined):
 *   - industry: string or comma-separated list
 *   - tags: string or comma-separated list
 *   - location.city, location.state, location.country: exact match strings
 *   - search: text search on name, phone, company (case-insensitive regex)
 *
 * Pagination:
 *   - page (default 1), limit (default 20, max 100)
 *
 * Sorting:
 *   - sortBy (default 'createdAt'), sortOrder 'asc'|'desc' (default 'desc')
 *
 * @param {object} filters    - Filter parameters from query string
 * @param {object} pagination - { page, limit, sortBy, sortOrder }
 * @returns {Promise<{ contacts: Contact[], total: number, page: number, limit: number }>}
 */
const listContacts = async (filters, pagination) => {
  const safeFilters = filters || {};
  const safePagination = pagination || {};

  // ── Pagination defaults & bounds ──────────────────────────────────────────
  const page = Math.max(1, parseInt(safePagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(safePagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  // ── Sorting ───────────────────────────────────────────────────────────────
  const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'company', 'industry', 'phone'];
  const sortBy = allowedSortFields.includes(safePagination.sortBy)
    ? safePagination.sortBy
    : 'createdAt';
  const sortOrder = safePagination.sortOrder === 'asc' ? 1 : -1;

  // ── Build MongoDB query (AND logic) ───────────────────────────────────────
  const query = {};

  // industry: single value or comma-separated list → $in
  if (safeFilters.industry) {
    const industries = String(safeFilters.industry)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (industries.length === 1) {
      query.industry = industries[0];
    } else if (industries.length > 1) {
      query.industry = { $in: industries };
    }
  }

  // tags: single value or comma-separated list → $all (contact must have ALL specified tags)
  if (safeFilters.tags) {
    const tags = String(safeFilters.tags)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tags.length > 0) {
      query.tags = { $all: tags };
    }
  }

  // location filters (case-insensitive exact match)
  if (safeFilters['location.city']) {
    query['location.city'] = new RegExp('^' + escapeRegex(safeFilters['location.city']) + '$', 'i');
  }
  if (safeFilters['location.state']) {
    query['location.state'] = new RegExp(
      '^' + escapeRegex(safeFilters['location.state']) + '$',
      'i'
    );
  }
  if (safeFilters['location.country']) {
    query['location.country'] = new RegExp(
      '^' + escapeRegex(safeFilters['location.country']) + '$',
      'i'
    );
  }

  // plain `location` param: case-insensitive search across city, state, and country
  if (safeFilters.location) {
    const locationRegex = new RegExp(escapeRegex(String(safeFilters.location).trim()), 'i');
    const locationConditions = [
      { 'location.city': locationRegex },
      { 'location.state': locationRegex },
      { 'location.country': locationRegex },
    ];
    // Merge with existing $or if search is also active
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: locationConditions }];
      delete query.$or;
    } else {
      query.$or = locationConditions;
    }
  }

  // search: case-insensitive regex across name, phone, company
  if (safeFilters.search) {
    const searchRegex = new RegExp(escapeRegex(String(safeFilters.search).trim()), 'i');
    const searchConditions = [{ name: searchRegex }, { phone: searchRegex }, { company: searchRegex }];
    // Merge with existing $or (from location filter) if present
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchConditions }];
      delete query.$or;
    } else if (query.$and) {
      query.$and.push({ $or: searchConditions });
    } else {
      query.$or = searchConditions;
    }
  }

  // Inject organization filter if present
  if (safeFilters.organization) {
    query.organization = safeFilters.organization;
  }

  // ── Execute query ─────────────────────────────────────────────────────────
  const [contacts, total] = await Promise.all([
    Contact.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Contact.countDocuments(query),
  ]);

  return { contacts, total, page, limit };
};

/**
 * Create a new contact.
 *
 * Validates required fields, enforces E.164 phone format, checks for
 * duplicate phone numbers, and persists the contact to MongoDB.
 *
 * @param {object} contactData - Fields from the request body
 * @param {string} userId      - ID of the authenticated user creating the contact
 * @returns {Promise<Contact>} The saved Contact document
 * @throws {object} { statusCode, message } for validation / conflict errors
 */
const createContact = async (contactData, userId) => {
  const { name, phone, jobTitle, company, tags, location, customFields } = contactData;
  let { industry } = contactData;

  // ── Required field validation ─────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  if (!phone) {
    const err = new Error('phone is required');
    err.statusCode = 400;
    throw err;
  }

  if (!industry) {
    industry = 'Other';
  }

  // ── Auto-classify industry if not explicitly provided ───────────────────
  if (industry === 'Other' && (jobTitle || company)) {
    try {
      industry = await mlClassifier.classifyIndustry(jobTitle, company);
    } catch (e) {
      logger.warn('ML classification failed for contact, defaulting to Other');
    }
  }

  // ── Phone number validation (E.164) ──────────────────────────────────────
  // Normalize Indian phone numbers first, then validate the raw phone so
  // space/special-char errors are surfaced for non-Indian numbers,
  // then normalize (strip whitespace) for storage.
  let rawPhone = String(phone);
  rawPhone = normalizeIndianPhone(rawPhone);
  const phoneValidation = validatePhone(rawPhone);
  if (!phoneValidation.valid) {
    const err = new Error(phoneValidation.message);
    err.statusCode = 400;
    throw err;
  }
  const normalizedPhone = normalizePhone(rawPhone);

  // ── Industry enum validation ──────────────────────────────────────────────
  const { INDUSTRY_VALUES } = require('../models/Contact');
  if (!INDUSTRY_VALUES.includes(industry)) {
    const err = new Error('industry must be one of: ' + INDUSTRY_VALUES.join(', '));
    err.statusCode = 400;
    throw err;
  }

  // ── Duplicate phone check ─────────────────────────────────────────────────
  const query = { phone: normalizedPhone };
  if (contactData.organization) {
    query.organization = contactData.organization;
  }
  const existing = await Contact.findOne(query);
  if (existing) {
    const err = new Error('A contact with this phone number already exists');
    err.statusCode = 409;
    throw err;
  }

  // ── Build and save the contact ────────────────────────────────────────────
  const contact = new Contact({
    name: name.trim(),
    phone: normalizedPhone,
    jobTitle: jobTitle ? String(jobTitle).trim() : undefined,
    company: company ? String(company).trim() : undefined,
    industry,
    tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
    location: location && typeof location === 'object' ? location : undefined,
    customFields: customFields && typeof customFields === 'object' ? customFields : undefined,
    source: 'manual',
    createdBy: userId,
    organization: contactData.organization || undefined,
  });

  await contact.save();

  logger.info('Contact created: ' + contact._id + ' (phone: ' + normalizedPhone + ') by user ' + userId);

  return contact;
};

/**
 * Get a single contact by its MongoDB ObjectId.
 *
 * @param {string} id - The contact's MongoDB ObjectId as a string
 * @returns {Promise<object>} The contact document (lean plain object)
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no contact matches the id
 */
const getContactById = async (id) => {
  const mongoose = require('mongoose');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid contact ID format');
    err.statusCode = 400;
    throw err;
  }

  const contact = await Contact.findById(id).lean();

  if (!contact) {
    const err = new Error('Contact not found');
    err.statusCode = 404;
    throw err;
  }

  return contact;
};

/**
 * Update an existing contact by its MongoDB ObjectId.
 *
 * Only the fields explicitly provided in `updates` are changed.
 * The phone field, if provided, is validated for E.164 format and checked
 * for uniqueness against other contacts (excluding the contact being updated).
 * The industry field, if provided, is validated against the allowed enum values.
 *
 * @param {string} id      - The contact's MongoDB ObjectId as a string
 * @param {object} updates - Partial contact fields to update
 * @returns {Promise<object>} The updated contact document (lean plain object)
 * @throws {object} { statusCode: 400 } for invalid id format or validation errors
 * @throws {object} { statusCode: 404 } when no contact matches the id
 * @throws {object} { statusCode: 409 } when the new phone number is already in use
 */
const updateContact = async (id, updates) => {
  const mongoose = require('mongoose');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid contact ID format');
    err.statusCode = 400;
    throw err;
  }

  // Ensure the contact exists before attempting any update
  const existing = await Contact.findById(id);
  if (!existing) {
    const err = new Error('Contact not found');
    err.statusCode = 404;
    throw err;
  }

  // Build a sanitized update object — only allow known, mutable fields
  const allowedFields = ['name', 'phone', 'jobTitle', 'company', 'industry', 'tags', 'location', 'customFields'];
  const sanitized = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitized[field] = updates[field];
    }
  }

  // ── name validation ───────────────────────────────────────────────────────
  if (sanitized.name !== undefined) {
    if (typeof sanitized.name !== 'string' || sanitized.name.trim().length === 0) {
      const err = new Error('name must be a non-empty string');
      err.statusCode = 400;
      throw err;
    }
    sanitized.name = sanitized.name.trim();
  }

  // ── phone validation & uniqueness check ──────────────────────────────────
  if (sanitized.phone !== undefined) {
    let rawPhone = String(sanitized.phone);
    rawPhone = normalizeIndianPhone(rawPhone);
    const phoneValidation = validatePhone(rawPhone);
    if (!phoneValidation.valid) {
      const err = new Error(phoneValidation.message);
      err.statusCode = 400;
      throw err;
    }
    const normalizedPhone = normalizePhone(rawPhone);

    // Check uniqueness — exclude the current contact from the duplicate check
    const query = { phone: normalizedPhone, _id: { $ne: id } };
    if (existing.organization) {
      query.organization = existing.organization;
    }
    const duplicate = await Contact.findOne(query);
    if (duplicate) {
      const err = new Error('A contact with this phone number already exists');
      err.statusCode = 409;
      throw err;
    }

    sanitized.phone = normalizedPhone;
  }

  // ── industry validation ───────────────────────────────────────────────────
  if (sanitized.industry !== undefined) {
    const { INDUSTRY_VALUES } = require('../models/Contact');
    if (!INDUSTRY_VALUES.includes(sanitized.industry)) {
      const err = new Error('industry must be one of: ' + INDUSTRY_VALUES.join(', '));
      err.statusCode = 400;
      throw err;
    }
  }

  // ── tags normalization ────────────────────────────────────────────────────
  if (sanitized.tags !== undefined) {
    if (!Array.isArray(sanitized.tags)) {
      const err = new Error('tags must be an array of strings');
      err.statusCode = 400;
      throw err;
    }
    sanitized.tags = sanitized.tags.map((t) => String(t).trim()).filter(Boolean);
  }

  // ── Apply update ──────────────────────────────────────────────────────────
  const updated = await Contact.findByIdAndUpdate(
    id,
    { $set: sanitized },
    { new: true, runValidators: true }
  ).lean();

  logger.info('Contact updated: ' + id);

  return updated;
};

/**
 * Build a MongoDB query object from a segment's filterCriteria.
 * Used to recalculate contactCount after contact deletion.
 *
 * @param {object} filterCriteria - The segment's filterCriteria object
 * @returns {object} MongoDB query object
 */
const buildSegmentContactQuery = (filterCriteria, orgFilter = {}) => {
  const query = { ...orgFilter };
  if (!filterCriteria) {return query;}

  if (filterCriteria.industries && filterCriteria.industries.length > 0) {
    query.industry = { $in: filterCriteria.industries };
  }

  if (filterCriteria.tags && filterCriteria.tags.length > 0) {
    query.tags = { $all: filterCriteria.tags };
  }

  if (filterCriteria.locations && filterCriteria.locations.length > 0) {
    const locationConditions = filterCriteria.locations
      .filter((loc) => loc && (loc.city || loc.state || loc.country))
      .map((loc) => {
        const locQuery = {};
        if (loc.city) {locQuery['location.city'] = loc.city;}
        if (loc.state) {locQuery['location.state'] = loc.state;}
        if (loc.country) {locQuery['location.country'] = loc.country;}
        return locQuery;
      });

    if (locationConditions.length > 0) {
      query.$or = locationConditions;
    }
  }

  return query;
};

/**
 * Delete a contact by its MongoDB ObjectId.
 *
 * Removes the contact from the database and recalculates the contactCount
 * for any Segments whose filterCriteria may have included this contact,
 * satisfying Requirement 3.11 (remove contact from all Segments and future campaigns).
 *
 * @param {string} id - The contact's MongoDB ObjectId as a string
 * @returns {Promise<void>}
 * @throws {object} { statusCode: 400 } for invalid ObjectId format
 * @throws {object} { statusCode: 404 } when no contact matches the id
 */
const deleteContact = async (id) => {
  const mongoose = require('mongoose');
  const Segment = require('../models/Segment');

  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid contact ID format');
    err.statusCode = 400;
    throw err;
  }

  const contact = await Contact.findById(id);
  if (!contact) {
    const err = new Error('Contact not found');
    err.statusCode = 404;
    throw err;
  }

  // Delete the contact from the database
  await Contact.findByIdAndDelete(id);

  logger.info('Contact deleted: ' + id + ' (phone: ' + contact.phone + ')');

  // Recalculate contactCount for segments that may have included this contact.
  // Segments use dynamic filter criteria (industries, tags, locations) rather than
  // storing explicit contact IDs, so we update the cached count for affected segments.
  try {
    // Find segments that could have matched this contact based on industry or tags
    const segmentQuery = {};
    const orConditions = [];

    if (contact.industry) {
      orConditions.push({ 'filterCriteria.industries': contact.industry });
    }
    if (contact.tags && contact.tags.length > 0) {
      orConditions.push({ 'filterCriteria.tags': { $in: contact.tags } });
    }
    // Also include segments with no filter criteria (they match all contacts)
    orConditions.push({
      'filterCriteria.industries': { $exists: true, $size: 0 },
      'filterCriteria.tags': { $exists: true, $size: 0 },
    });

    if (orConditions.length > 0) {
      segmentQuery.$or = orConditions;
    }

    if (contact.organization) {
      segmentQuery.organization = contact.organization;
    }

    const affectedSegments = await Segment.find(segmentQuery).select('_id filterCriteria organization');

    // Recalculate contactCount for each affected segment
    for (const segment of affectedSegments) {
      const contactQuery = buildSegmentContactQuery(segment.filterCriteria, { organization: segment.organization });
      const count = await Contact.countDocuments(contactQuery);
      await Segment.findByIdAndUpdate(segment._id, { contactCount: count });
    }
  } catch (segmentErr) {
    // Log but don't fail the delete operation if segment update fails
    logger.warn('Failed to update segment counts after contact deletion: ' + segmentErr.message);
  }
};

/**
 * Column name mappings for flexible CSV header detection.
 * Maps normalized (lowercase, trimmed) header names to canonical field names.
 *
 * Supports all common column name variations including:
 * - Space-separated variants (e.g. "full name", "phone number")
 * - Underscore-separated variants (e.g. "full_name", "phone_number")
 * - Concatenated variants (e.g. "fullname", "phonenumber")
 * - Synonym variants (e.g. "mobile", "telephone", "cell" for phone)
 *
 * All keys are lowercase — normalizeHeader() lowercases before lookup.
 */
const COLUMN_MAPPINGS = {
  // ── name ──────────────────────────────────────────────────────────────────
  name: 'name',
  'full name': 'name',
  fullname: 'name',
  full_name: 'name',
  'contact name': 'name',
  contactname: 'name',
  contact_name: 'name',
  'first name': 'name',
  firstname: 'name',
  first_name: 'name',

  // ── phone ─────────────────────────────────────────────────────────────────
  phone: 'phone',
  'phone number': 'phone',
  phonenumber: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  'mobile number': 'phone',
  mobilenumber: 'phone',
  mobile_number: 'phone',
  telephone: 'phone',
  tel: 'phone',
  cell: 'phone',
  whatsapp: 'phone',

  // ── jobTitle ──────────────────────────────────────────────────────────────
  jobtitle: 'jobTitle',
  'job title': 'jobTitle',
  job_title: 'jobTitle',
  title: 'jobTitle',
  position: 'jobTitle',
  role: 'jobTitle',
  designation: 'jobTitle',

  // ── company ───────────────────────────────────────────────────────────────
  company: 'company',
  'company name': 'company',
  companyname: 'company',
  company_name: 'company',
  organization: 'company',
  organisation: 'company',
  business: 'company',
  employer: 'company',
  org: 'company',

  // ── industry ──────────────────────────────────────────────────────────────
  industry: 'industry',
  sector: 'industry',
  'industry sector': 'industry',
  'business type': 'industry',
  business_type: 'industry',
  'industry type': 'industry',
  industry_type: 'industry',

  // ── tags ──────────────────────────────────────────────────────────────────
  tags: 'tags',
  tag: 'tags',
  labels: 'tags',
  categories: 'tags',
  category: 'tags',

  // ── location: city ────────────────────────────────────────────────────────
  city: 'location.city',
  location: 'location.city',
  town: 'location.city',
  'location city': 'location.city',

  // ── location: state ───────────────────────────────────────────────────────
  state: 'location.state',
  province: 'location.state',
  region: 'location.state',
  'location state': 'location.state',

  // ── location: country ─────────────────────────────────────────────────────
  country: 'location.country',
  nation: 'location.country',
  'location country': 'location.country',
};

/**
 * Normalize a CSV header to a canonical field name.
 * @param {string} header
 * @returns {string|null} canonical field name or null if unrecognized
 */
const normalizeHeader = (header) => {
  if (!header || typeof header !== 'string') {return null;}
  const normalized = header.toLowerCase().trim();
  return COLUMN_MAPPINGS[normalized] || null;
};

/**
 * Parse a CSV buffer into an array of row objects.
 * Handles flexible column names, quoted fields, and multiple encodings
 * (UTF-8, UTF-16 LE/BE, ISO-8859-1).
 *
 * Uses detectAndDecodeBuffer() to automatically detect and convert the
 * file encoding to UTF-8 before parsing.
 *
 * @param {Buffer} buffer - Raw file buffer
 * @returns {Promise<{ rows: object[], headers: string[] }>}
 */
const parseCSVBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    const csvParser = require('csv-parser');
    const { Readable } = require('stream');
    const { detectAndDecodeBuffer } = require('../utils/encodingDetector');

    // Detect encoding (UTF-8, UTF-16 LE/BE, ISO-8859-1) and decode to UTF-8 string.
    // BOM characters are stripped automatically by detectAndDecodeBuffer.
    let csvContent;
    try {
      csvContent = detectAndDecodeBuffer(buffer);
    } catch (_e) {
      // Last-resort fallback: treat as Latin-1 (ISO-8859-1)
      csvContent = buffer.toString('latin1');
    }

    const rows = [];
    const headers = [];

    const stream = Readable.from([csvContent]);

    stream
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => {
            const canonical = normalizeHeader(header);
            if (!headers.includes(header)) {
              headers.push(header);
            }
            return canonical || header; // keep original if unrecognized
          },
          skipEmptyLines: true,
        })
      )
      .on('data', (row) => {
        // Filter out rows where all values are empty strings (truly empty rows).
        // csv-parser's skipEmptyLines may still emit empty objects for blank lines.
        const hasAnyValue = Object.values(row).some(
          (v) => v !== null && v !== undefined && String(v).trim() !== ''
        );
        if (hasAnyValue) {
          rows.push(row);
        }
      })
      .on('end', () => {
        resolve({ rows, headers });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
};

/**
 * Parse an Excel (.xlsx or .xls) buffer into an array of row objects.
 * Uses the same flexible column name detection as the CSV parser.
 *
 * Note: The xlsx library handles encoding internally for Excel files.
 * Excel files (.xlsx) are ZIP archives with XML content encoded in UTF-8.
 * Older .xls files use the BIFF format which the xlsx library also handles.
 * For any BOM stripping needs, detectAndDecodeBuffer is available but not
 * required here since xlsx reads directly from the binary buffer.
 *
 * @param {Buffer} buffer - Raw Excel file buffer
 * @returns {{ rows: object[], headers: string[] }}
 */
const parseXLSXBuffer = (buffer) => {
  const XLSX = require('xlsx');

  // Read workbook from buffer; cellDates converts date cells to JS Date objects.
  // The xlsx library handles encoding internally for both .xlsx (UTF-8 XML)
  // and .xls (BIFF binary format) files.
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file contains no sheets');
  }

  const worksheet = workbook.Sheets[sheetName];

  // Convert sheet to array of arrays (raw rows including header)
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,       // return array-of-arrays so we control header mapping
    defval: '',      // empty cells become empty string
    blankrows: false, // skip entirely blank rows
  });

  if (rawRows.length === 0) {
    return { rows: [], headers: [] };
  }

  // First row is the header
  const rawHeaders = rawRows[0].map((h) => (h !== null && h !== undefined ? String(h).trim() : ''));
  const headers = [...rawHeaders];

  // Map raw headers to canonical field names
  const canonicalHeaders = rawHeaders.map((h) => normalizeHeader(h) || h);

  const rows = [];
  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];

    // Build row object using canonical header names
    const rowObj = {};
    for (let j = 0; j < canonicalHeaders.length; j++) {
      const key = canonicalHeaders[j];
      const cellValue = rawRow[j];

      // Convert cell value to string, handling Date objects and nulls
      let strValue = '';
      if (cellValue instanceof Date) {
        strValue = cellValue.toISOString();
      } else if (cellValue !== null && cellValue !== undefined) {
        strValue = String(cellValue).trim();
      }

      rowObj[key] = strValue;
    }

    // Skip rows where all values are empty
    const hasAnyValue = Object.values(rowObj).some((v) => v !== '');
    if (hasAnyValue) {
      rows.push(rowObj);
    }
  }

  return { rows, headers };
};


/**
 * Import contacts from a CSV or Excel file buffer.
 *
 * Processing steps:
 * 1. Parse CSV or Excel with flexible column detection
 * 2. Validate each row (required fields, phone format)
 * 3. Classify industry using ML model (if not provided)
 * 4. Check for duplicates (skip if phone already exists)
 * 5. Bulk insert valid contacts
 * 6. Return import summary with success/error counts and error report
 *
 * @param {Buffer} fileBuffer    - Raw file buffer (CSV or Excel)
 * @param {string} userId        - ID of the authenticated user performing the import
 * @param {string} [fileExt]     - File extension hint ('.csv', '.xlsx', '.xls'). Defaults to CSV parsing.
 * @returns {Promise<{
 *   totalRows: number,
 *   successCount: number,
 *   duplicateCount: number,
 *   errorCount: number,
 *   errors: Array<{row: number, data: object, reason: string}>,
 *   importedContacts: object[]
 * }>}
 */
const importContacts = async (fileBuffer, userId, fileExt, user) => {
  const mlClassifier = require('./mlClassifier.service');
  const { INDUSTRY_VALUES } = require('../models/Contact');
  
  const orgFilter = user.role === 'Super_Admin' ? {} : { organization: user.organization._id };

  // ── Step 1: Parse file (CSV or Excel) ─────────────────────────────────────
  let rows;
  const isExcel = fileExt === '.xlsx' || fileExt === '.xls';

  try {
    if (isExcel) {
      const parsed = parseXLSXBuffer(fileBuffer);
      rows = parsed.rows;
    } else {
      const parsed = await parseCSVBuffer(fileBuffer);
      rows = parsed.rows;
    }
  } catch (parseErr) {
    const fileType = isExcel ? 'Excel' : 'CSV';
    const err = new Error(`Failed to parse ${fileType} file: ` + parseErr.message);
    err.statusCode = 400;
    throw err;
  }

  if (rows.length === 0) {
    const fileType = isExcel ? 'Excel' : 'CSV';
    const err = new Error(`${fileType} file is empty or contains no data rows`);
    err.statusCode = 400;
    throw err;
  }

  // ── Step 2: Collect all existing phone numbers for duplicate detection ────
  // Normalize phone numbers for case-insensitive, whitespace-normalized comparison
  const existingPhones = new Set();
  const existingContacts = await Contact.find(orgFilter, { phone: 1 }).lean();
  for (const c of existingContacts) {
    existingPhones.add(normalizePhone(c.phone).toLowerCase());
  }

  // Track phones seen in this import batch to detect intra-batch duplicates
  const seenInBatch = new Set();

  const errors = [];
  const validRows = [];
  const rowsNeedingClassification = [];
  let normalizedCount = 0;

  // ── Step 3: Validate each row ─────────────────────────────────────────────
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // 1-indexed, +1 for header row
    const row = rows[i];

    // Extract fields (csv-parser already mapped headers to canonical names)
    const name = (row.name || '').trim();
    let rawPhone = (row.phone || '').trim();
    const jobTitle = (row.jobTitle || '').trim();
    const company = (row.company || '').trim();
    const industry = (row.industry || '').trim();
    const tagsRaw = (row.tags || '').trim();
    const locationCity = (row['location.city'] || '').trim();
    const locationState = (row['location.state'] || '').trim();
    const locationCountry = (row['location.country'] || '').trim();

    // Validate required: name
    if (!name) {
      errors.push({ row: rowNum, data: row, reason: 'Missing required field: name' });
      continue;
    }

    // Validate required: phone
    if (!rawPhone) {
      errors.push({ row: rowNum, data: row, reason: 'Missing required field: phone' });
      continue;
    }

    // Normalize Indian phone numbers
    const originalPhone = rawPhone;
    rawPhone = normalizeIndianPhone(rawPhone);
    if (originalPhone !== rawPhone) {
      normalizedCount++;
    }

    // Validate phone format
    const normalizedPhone = normalizePhone(rawPhone);
    const phoneValidation = validatePhone(normalizedPhone);
    if (!phoneValidation.valid) {
      errors.push({ row: rowNum, data: row, reason: 'Invalid phone number: ' + phoneValidation.message });
      continue;
    }

    // Duplicate detection: case-insensitive, whitespace-normalized
    const phoneKey = normalizedPhone.toLowerCase();

    if (existingPhones.has(phoneKey)) {
      errors.push({ row: rowNum, data: row, reason: 'Duplicate phone number: contact already exists in database' });
      continue;
    }

    if (seenInBatch.has(phoneKey)) {
      errors.push({ row: rowNum, data: row, reason: 'Duplicate phone number: appears multiple times in this import file' });
      continue;
    }

    seenInBatch.add(phoneKey);

    // Parse tags (comma-separated string)
    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // Build location object
    const location = {};
    if (locationCity) {location.city = locationCity;}
    if (locationState) {location.state = locationState;}
    if (locationCountry) {location.country = locationCountry;}

    // Validate industry if provided
    let resolvedIndustry = industry;
    if (industry === 'Other' || (industry && !INDUSTRY_VALUES.includes(industry))) {
      // Industry provided but invalid or is 'Other' — will try ML classification
      resolvedIndustry = null;
    }

    const rowData = {
      rowNum,
      name,
      phone: normalizedPhone,
      jobTitle: jobTitle || undefined,
      company: company || undefined,
      industry: resolvedIndustry || undefined,
      tags,
      location: Object.keys(location).length > 0 ? location : undefined,
      needsClassification: !resolvedIndustry,
    };

    validRows.push(rowData);

    if (rowData.needsClassification) {
      rowsNeedingClassification.push({ index: validRows.length - 1, jobTitle, company });
    }
  }

  // ── Step 4: Batch ML classification for rows without industry ─────────────
  if (rowsNeedingClassification.length > 0) {
    try {
      const industries = await mlClassifier.classifyBatch(
        rowsNeedingClassification.map((r) => ({ jobTitle: r.jobTitle, company: r.company }))
      );
      for (let i = 0; i < rowsNeedingClassification.length; i++) {
        const { index } = rowsNeedingClassification[i];
        validRows[index].industry = industries[i] || 'Other';
      }
    } catch (_classifyErr) {
      // Fallback: assign 'Other' to all rows needing classification
      for (const { index } of rowsNeedingClassification) {
        validRows[index].industry = 'Other';
      }
    }
  }

  // ── Step 5: Insert valid contacts ─────────────────────────────────────────
  const importedContacts = [];
  const insertErrors = [];
  const importSource = isExcel ? 'excel_import' : 'csv_import';

  for (const rowData of validRows) {
    try {
      const contactDoc = {
        name: rowData.name,
        phone: rowData.phone,
        jobTitle: rowData.jobTitle,
        company: rowData.company,
        industry: rowData.industry,
        tags: rowData.tags,
        location: rowData.location,
        source: importSource,
        createdBy: userId,
      };

      if (user.role !== 'Super_Admin') {
        contactDoc.organization = user.organization._id;
      }

      const contact = new Contact(contactDoc);

      await contact.save();
      importedContacts.push(contact.toObject());
    } catch (saveErr) {
      // Handle race condition: duplicate key error from MongoDB
      if (saveErr.code === 11000) {
        insertErrors.push({
          row: rowData.rowNum,
          data: rowData,
          reason: 'Duplicate phone number: contact was inserted by a concurrent request',
        });
      } else {
        insertErrors.push({
          row: rowData.rowNum,
          data: rowData,
          reason: 'Failed to save contact: ' + saveErr.message,
        });
      }
    }
  }

  const allErrors = [...errors, ...insertErrors];

  logger.info(
    `${isExcel ? 'Excel' : 'CSV'} import completed by user ${userId}: ` +
    `${importedContacts.length} imported, ` +
    `${allErrors.filter((e) => e.reason.startsWith('Duplicate')).length} duplicates skipped, ` +
    `${allErrors.filter((e) => !e.reason.startsWith('Duplicate')).length} errors`
  );

  return {
    totalRows: rows.length,
    successCount: importedContacts.length,
    duplicateCount: allErrors.filter((e) => e.reason.toLowerCase().includes('duplicate')).length,
    errorCount: allErrors.filter((e) => !e.reason.toLowerCase().includes('duplicate')).length,
    normalizedCount,
    invalidCount: allErrors.filter((e) => e.reason.toLowerCase().includes('invalid phone number')).length,
    errors: allErrors,
    importedContacts,
  };
};

/**
 * Generate a CSV string from an array of import errors.
 * Each row contains: row_number, reason, name, phone, job_title, company, industry, tags
 *
 * @param {Array<{row: number, data: object, reason: string}>} errors
 * @returns {string} CSV content as a string
 */
const generateErrorReportCSV = (errors) => {
  if (!errors || errors.length === 0) {
    return 'row_number,reason,name,phone,job_title,company,industry,tags\n';
  }

  const escapeCSVField = (value) => {
    if (value === null || value === undefined) {return '';}
    const str = String(value);
    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const header = 'row_number,reason,name,phone,job_title,company,industry,tags';
  const rows = errors.map((e) => {
    const data = e.data || {};
    return [
      escapeCSVField(e.row),
      escapeCSVField(e.reason),
      escapeCSVField(data.name || ''),
      escapeCSVField(data.phone || ''),
      escapeCSVField(data.jobTitle || data['job_title'] || data['job title'] || ''),
      escapeCSVField(data.company || ''),
      escapeCSVField(data.industry || ''),
      escapeCSVField(Array.isArray(data.tags) ? data.tags.join(';') : (data.tags || '')),
    ].join(',');
  });

  return header + '\n' + rows.join('\n') + '\n';
};

/**
 * Escape a single CSV field value.
 * Wraps in double-quotes if the value contains a comma, double-quote, or newline.
 * Double-quotes inside the value are escaped by doubling them.
 *
 * @param {*} value
 * @returns {string}
 */
const escapeCSVField = (value) => {
  if (value === null || value === undefined) {return '';}
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

/**
 * Export contacts to a CSV string.
 *
 * Accepts the same filter parameters as listContacts (industry, tags,
 * location.city, location.state, location.country) and returns a CSV
 * string whose column names match the import format so that the
 * round-trip property holds (export → re-import produces identical records).
 *
 * CSV columns (in order):
 *   name, phone, job_title, company, industry, tags, city, state, country
 *
 * Tags are serialised as a semicolon-separated list so that commas inside
 * tag values do not break the CSV structure.  The import parser already
 * splits on commas, so tags must not contain commas; semicolons are used
 * as an intra-field separator that survives the round-trip.
 *
 * @param {object} [filters] - Optional filter parameters:
 *   industry, tags, 'location.city', 'location.state', 'location.country'
 * @returns {Promise<string>} CSV content as a UTF-8 string
 */
const exportContacts = async (filters) => {
  const safeFilters = filters || {};

  // ── Build MongoDB query (same logic as listContacts) ──────────────────────
  const query = {};

  if (safeFilters.industry) {
    const industries = String(safeFilters.industry)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (industries.length === 1) {
      query.industry = industries[0];
    } else if (industries.length > 1) {
      query.industry = { $in: industries };
    }
  }

  if (safeFilters.tags) {
    const tags = String(safeFilters.tags)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tags.length > 0) {
      query.tags = { $all: tags };
    }
  }

  if (safeFilters['location.city']) {
    query['location.city'] = new RegExp('^' + escapeRegex(safeFilters['location.city']) + '$', 'i');
  }
  if (safeFilters['location.state']) {
    query['location.state'] = new RegExp('^' + escapeRegex(safeFilters['location.state']) + '$', 'i');
  }
  if (safeFilters['location.country']) {
    query['location.country'] = new RegExp('^' + escapeRegex(safeFilters['location.country']) + '$', 'i');
  }

  // search: case-insensitive regex across name, phone, company (same as listContacts)
  if (safeFilters.search) {
    const searchRegex = new RegExp(escapeRegex(String(safeFilters.search).trim()), 'i');
    query.$or = [{ name: searchRegex }, { phone: searchRegex }, { company: searchRegex }];
  }

  // Inject organization filter if present
  if (safeFilters.organization) {
    query.organization = safeFilters.organization;
  }

  // ── Fetch matching contacts (no pagination — export all) ──────────────────
  const contacts = await Contact.find(query)
    .sort({ createdAt: -1 })
    .lean();

  // ── Build CSV ─────────────────────────────────────────────────────────────
  // Column names match the COLUMN_MAPPINGS keys used by the import parser so
  // that a re-import of the exported file produces identical records.
  const CSV_HEADER = 'name,phone,job_title,company,industry,tags,city,state,country';

  const rows = contacts.map((contact) => {
    const tagsStr = Array.isArray(contact.tags) ? contact.tags.join(';') : '';
    const city = (contact.location && contact.location.city) ? contact.location.city : '';
    const state = (contact.location && contact.location.state) ? contact.location.state : '';
    const country = (contact.location && contact.location.country) ? contact.location.country : '';

    return [
      escapeCSVField(contact.name),
      escapeCSVField(contact.phone),
      escapeCSVField(contact.jobTitle || ''),
      escapeCSVField(contact.company || ''),
      escapeCSVField(contact.industry),
      escapeCSVField(tagsStr),
      escapeCSVField(city),
      escapeCSVField(state),
      escapeCSVField(country),
    ].join(',');
  });

  return CSV_HEADER + '\n' + rows.join('\n') + (rows.length > 0 ? '\n' : '');
};

/**
 * Bulk assign tags to a set of contacts.
 *
 * Adds each tag in `tags` to every contact in `contactIds` using $addToSet
 * to avoid duplicates. Contacts not in the selection are NOT modified.
 *
 * @param {string[]} contactIds - Array of MongoDB ObjectId strings
 * @param {string[]} tags       - Array of tag strings to add
 * @returns {Promise<{ modifiedCount: number, matchedCount: number }>}
 * @throws {{ statusCode: 400 }} for invalid input
 */
const bulkTag = async (contactIds, tags) => {
  const mongoose = require('mongoose');

  // ── Validate contactIds ───────────────────────────────────────────────────
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    const err = new Error('contactIds must be a non-empty array');
    err.statusCode = 400;
    throw err;
  }

  for (const id of contactIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('Invalid contact ID: ' + id);
      err.statusCode = 400;
      throw err;
    }
  }

  // ── Validate tags ─────────────────────────────────────────────────────────
  if (!Array.isArray(tags) || tags.length === 0) {
    const err = new Error('tags must be a non-empty array');
    err.statusCode = 400;
    throw err;
  }

  // Sanitize: trim whitespace, filter empty strings, deduplicate
  const sanitizedTags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];

  if (sanitizedTags.length === 0) {
    const err = new Error('tags must contain at least one non-empty string');
    err.statusCode = 400;
    throw err;
  }

  // ── Perform bulk update ───────────────────────────────────────────────────
  const result = await Contact.updateMany(
    { _id: { $in: contactIds } },
    { $addToSet: { tags: { $each: sanitizedTags } } }
  );

  logger.info(
    'Bulk tag: added tags [' + sanitizedTags.join(', ') + '] to ' +
    result.modifiedCount + '/' + result.matchedCount + ' contacts (selected: ' + contactIds.length + ')'
  );

  return { modifiedCount: result.modifiedCount, matchedCount: result.matchedCount };
};

/**
 * Bulk delete contacts by their MongoDB ObjectIds.
 *
 * Validates the input array, deletes all matching contacts, and recalculates
 * contactCount for any segments that may have included the deleted contacts.
 *
 * @param {string[]} contactIds - Array of contact MongoDB ObjectIds to delete
 * @returns {Promise<{ deletedCount: number }>}
 * @throws {object} { statusCode: 400 } for validation errors
 */
const bulkDelete = async (contactIds) => {
  const mongoose = require('mongoose');
  const Segment = require('../models/Segment');

  // ── Validate contactIds ───────────────────────────────────────────────────
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    const err = new Error('contactIds must be a non-empty array');
    err.statusCode = 400;
    throw err;
  }

  for (const id of contactIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('Invalid contact ID: ' + id);
      err.statusCode = 400;
      throw err;
    }
  }

  // ── Fetch contacts before deletion (for segment recalculation) ────────────
  const contactsToDelete = await Contact.find(
    { _id: { $in: contactIds } },
    { industry: 1, tags: 1 }
  ).lean();

  // ── Perform bulk delete ───────────────────────────────────────────────────
  const result = await Contact.deleteMany({ _id: { $in: contactIds } });

  logger.info(
    'Bulk delete: removed ' + result.deletedCount + ' contact(s) (requested: ' + contactIds.length + ')'
  );

  // ── Recalculate segment contactCounts ─────────────────────────────────────
  if (contactsToDelete.length > 0) {
    try {
      // Collect all industries and tags from deleted contacts
      const deletedIndustries = [...new Set(contactsToDelete.map((c) => c.industry).filter(Boolean))];
      const deletedTags = [...new Set(contactsToDelete.flatMap((c) => c.tags || []))];

      // Find segments that could have matched any of the deleted contacts
      const orConditions = [];

      if (deletedIndustries.length > 0) {
        orConditions.push({ 'filterCriteria.industries': { $in: deletedIndustries } });
      }
      if (deletedTags.length > 0) {
        orConditions.push({ 'filterCriteria.tags': { $in: deletedTags } });
      }
      // Also include segments with empty filter criteria (they match all contacts)
      orConditions.push({
        'filterCriteria.industries': { $exists: true, $size: 0 },
        'filterCriteria.tags': { $exists: true, $size: 0 },
      });

      const affectedSegments = await Segment.find(
        { $or: orConditions },
        { _id: 1, filterCriteria: 1 }
      );

      // Recalculate contactCount for each affected segment
      for (const segment of affectedSegments) {
        const contactQuery = buildSegmentContactQuery(segment.filterCriteria);
        const count = await Contact.countDocuments(contactQuery);
        await Segment.findByIdAndUpdate(segment._id, { contactCount: count });
      }
    } catch (segmentErr) {
      // Log but don't fail the delete operation if segment update fails
      logger.warn('Failed to update segment counts after bulk contact deletion: ' + segmentErr.message);
    }
  }

  return { deletedCount: result.deletedCount };
};

/**
 * Create a new contact segment with filter criteria.
 *
 * Validates the segment name, builds a MongoDB query from the provided
 * filterCriteria, counts matching contacts, and persists the segment.
 *
 * @param {object} segmentData - Fields from the request body
 * @param {string} segmentData.name - Required. Segment display name.
 * @param {string} [segmentData.description] - Optional description.
 * @param {object} [segmentData.filterCriteria] - Optional filter criteria:
 *   { industries: string[], tags: string[], locations: [{city,state,country}], customFilters: object }
 * @param {string} userId - ID of the authenticated user creating the segment
 * @returns {Promise<object>} The saved Segment document (lean plain object)
 * @throws {object} { statusCode: 400 } for validation errors
 * @throws {object} { statusCode: 500 } for unexpected errors
 */
const createSegment = async (segmentData, userId) => {
  const Segment = require('../models/Segment');

  const { name, description, filterCriteria, organization } = segmentData || {};

  // ── Required field validation ─────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  // ── Sanitize filterCriteria ───────────────────────────────────────────────
  const sanitizedCriteria = {};

  if (filterCriteria && typeof filterCriteria === 'object') {
    // industries: must be an array of strings
    if (Array.isArray(filterCriteria.industries)) {
      sanitizedCriteria.industries = filterCriteria.industries
        .map((i) => (typeof i === 'string' ? i.trim() : ''))
        .filter(Boolean);
    }

    // tags: must be an array of strings
    if (Array.isArray(filterCriteria.tags)) {
      sanitizedCriteria.tags = filterCriteria.tags
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter(Boolean);
    }

    // locations: array of { city, state, country } objects
    if (Array.isArray(filterCriteria.locations)) {
      sanitizedCriteria.locations = filterCriteria.locations
        .filter((loc) => loc && typeof loc === 'object')
        .map((loc) => ({
          city: loc.city ? String(loc.city).trim() : undefined,
          state: loc.state ? String(loc.state).trim() : undefined,
          country: loc.country ? String(loc.country).trim() : undefined,
        }))
        .filter((loc) => loc.city || loc.state || loc.country);
    }

    // customFilters: pass through as-is (Map-compatible plain object)
    if (filterCriteria.customFilters && typeof filterCriteria.customFilters === 'object') {
      sanitizedCriteria.customFilters = filterCriteria.customFilters;
    }
  }

  // ── Calculate contactCount by querying matching contacts ──────────────────
  const contactQuery = buildSegmentContactQuery(sanitizedCriteria);
  const contactCount = await Contact.countDocuments(contactQuery);

  // ── Build and save the segment ────────────────────────────────────────────
  const segment = new Segment({
    name: name.trim(),
    description: description ? String(description).trim() : undefined,
    filterCriteria: sanitizedCriteria,
    contactCount,
    createdBy: userId,
    organization: organization || undefined,
  });

  await segment.save();

  logger.info('Segment created: ' + segment._id + ' ("' + segment.name + '") by user ' + userId + ' — ' + contactCount + ' matching contacts');

  return segment.toObject();
};

/**
 * Preview a segment's contact count without saving it.
 */
const previewSegment = async (filterCriteria, organization) => {
  const sanitizedCriteria = {};

  if (filterCriteria && typeof filterCriteria === 'object') {
    if (Array.isArray(filterCriteria.industries)) {
      sanitizedCriteria.industries = filterCriteria.industries.map((i) => (typeof i === 'string' ? i.trim() : '')).filter(Boolean);
    }
    if (Array.isArray(filterCriteria.tags)) {
      sanitizedCriteria.tags = filterCriteria.tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
    }
    if (Array.isArray(filterCriteria.locations)) {
      sanitizedCriteria.locations = filterCriteria.locations
        .filter((loc) => loc && typeof loc === 'object')
        .map((loc) => ({
          city: loc.city ? String(loc.city).trim() : undefined,
          state: loc.state ? String(loc.state).trim() : undefined,
          country: loc.country ? String(loc.country).trim() : undefined,
        }))
        .filter((loc) => loc.city || loc.state || loc.country);
    }
    if (filterCriteria.customFilters && typeof filterCriteria.customFilters === 'object') {
      sanitizedCriteria.customFilters = filterCriteria.customFilters;
    }
  }

  const contactQuery = buildSegmentContactQuery(sanitizedCriteria, { organization });
  return await Contact.countDocuments(contactQuery);
};

module.exports = {
  listContacts,
  createContact,
  getContactById,
  updateContact,
  deleteContact,
  importContacts,
  exportContacts,
  bulkTag,
  bulkDelete,
  generateErrorReportCSV,
  createSegment,
  previewSegment,
  buildSegmentContactQuery,
  // Exported for testing
  normalizeHeader,
  parseCSVBuffer,
};
