const path = require('path');
const multer = require('multer');
const { sendSuccess, sendCreated, sendError } = require('../utils/apiResponse');
const contactService = require('../services/contact.service');
const logger = require('../utils/logger');
const config = require('../config');

// ── Multer configuration for CSV and Excel file uploads ──────────────────────

const contactFileStorage = multer.memoryStorage(); // store in memory for processing

const contactFileFilter = (_req, file, cb) => {
  const allowedMimeTypes = [
    // CSV
    'text/csv',
    'application/csv',
    'text/plain',
    'text/x-csv',
    'application/x-csv',
    // Excel
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.csv', '.xlsx', '.xls'];

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel (.xlsx, .xls) files are allowed'), false);
  }
};

const contactFileUpload = multer({
  storage: contactFileStorage,
  fileFilter: contactFileFilter,
  limits: {
    fileSize: (config.upload.maxFileSizeMb || 5) * 1024 * 1024, // default 5MB
  },
});

/**
 * POST /api/contacts/import
 * Import contacts from a CSV file.
 *
 * Accepts multipart/form-data with a 'file' field containing a CSV file.
 * Performs:
 *   - Flexible column name detection (case-insensitive)
 *   - Phone number validation (E.164 format)
 *   - Industry classification via ML model (if not provided in CSV)
 *   - Duplicate detection and skipping
 *   - Returns import summary with success/error counts
 *   - Returns downloadable error report for failed rows
 *
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const importContacts = [
  // Multer middleware to handle file upload
  (req, res, next) => {
    contactFileUpload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return sendError(
            res,
            `File too large. Maximum allowed size is ${config.upload.maxFileSizeMb || 5}MB`,
            400
          );
        }
        return sendError(res, err.message || 'File upload error', 400);
      }
      next();
    });
  },
  // Main handler
  async (req, res) => {
    try {
      if (!req.file) {
        return sendError(
          res,
          'No file uploaded. Please provide a CSV or Excel (.xlsx, .xls) file in the "file" field',
          400
        );
      }

      const fileBuffer = req.file.buffer;
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      const userId = req.user._id;

      const result = await contactService.importContacts(fileBuffer, userId, fileExtension, req.user);

      // Build response
      const responseData = {
        summary: {
          totalRows: result.totalRows,
          successCount: result.successCount,
          duplicateCount: result.duplicateCount,
          errorCount: result.errorCount,
          normalizedCount: result.normalizedCount,
          invalidCount: result.invalidCount,
        },
        importedContacts: result.importedContacts,
      };

      // Include error report if there were any failures
      if (result.errors && result.errors.length > 0) {
        responseData.errorReport = result.errors.map((e) => ({
          row: e.row,
          reason: e.reason,
          data: e.data,
        }));
        responseData.errorReportDownloadUrl = '/api/contacts/import/error-report';
        responseData.errorReportNote =
          'POST the errorReport array to errorReportDownloadUrl to download a CSV file of failed rows';
      }

      const message =
        result.successCount > 0
          ? `Import completed: ${result.successCount} contacts imported successfully`
          : 'Import completed with no new contacts added';

      return sendSuccess(res, responseData, message, 200);
    } catch (err) {
      if (err.statusCode) {
        return sendError(res, err.message, err.statusCode);
      }
      logger.error('importContacts error:', err);
      return sendError(res, 'An unexpected error occurred during import', 500);
    }
  },
];

/**
 * GET /api/contacts
 * List contacts with pagination, filtering, and sorting.
 *
 * Query parameters:
 *   page, limit, sortBy, sortOrder
 *   industry, tags, location.city, location.state, location.country, search
 */
const listContacts = async (req, res) => {
  try {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      industry,
      tags,
      search,
      location,
      'location.city': locationCity,
      'location.state': locationState,
      'location.country': locationCountry,
    } = req.query;

    const filters = {};
    if (industry !== undefined) {filters.industry = industry;}
    if (tags !== undefined) {filters.tags = tags;}
    if (search !== undefined) {filters.search = search;}
    // Support plain `location` param (searches across city, state, country)
    if (location !== undefined) {filters.location = location;}
    // Also support granular location params
    if (locationCity !== undefined) {filters['location.city'] = locationCity;}
    if (locationState !== undefined) {filters['location.state'] = locationState;}
    if (locationCountry !== undefined) {filters['location.country'] = locationCountry;}

    // Inject org-scoping filter
    Object.assign(filters, req.orgFilter);

    const pagination = { page, limit, sortBy, sortOrder };

    const { contacts, total, page: currentPage, limit: currentLimit } = await contactService.listContacts(filters, pagination);

    const totalPages = Math.ceil(total / currentLimit);

    return sendSuccess(
      res,
      {
        contacts,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1,
        },
      },
      'Contacts retrieved successfully'
    );
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('listContacts error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * POST /api/contacts
 * Create a new contact manually.
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const createContact = async (req, res) => {
  try {
    const contactData = { ...req.body };
    if (req.user.role !== 'Super_Admin') {
      contactData.organization = req.user.organization._id;
    }
    const contact = await contactService.createContact(contactData, req.user._id);

    return sendCreated(res, { contact }, 'Contact created successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('createContact error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * GET /api/contacts/:id
 * Retrieve a single contact by its MongoDB ObjectId.
 * All authenticated roles may access this endpoint.
 */
const getContact = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await contactService.getContactById(id);
    
    // Org authorization check
    if (req.user.role !== 'Super_Admin' && String(contact.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Contact not found', 404);
    }
    
    return sendSuccess(res, { contact }, 'Contact retrieved successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('getContact error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * PUT /api/contacts/:id
 * Update an existing contact's details.
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    
    // First verify org authorization
    const contact = await contactService.getContactById(id);
    if (req.user.role !== 'Super_Admin' && String(contact.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Contact not found', 404);
    }

    const updated = await contactService.updateContact(id, req.body);
    return sendSuccess(res, { contact: updated }, 'Contact updated successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('updateContact error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * DELETE /api/contacts/:id
 * Delete a contact by its MongoDB ObjectId.
 * Removes the contact from the database and updates segment contact counts.
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    
    // First verify org authorization
    const contact = await contactService.getContactById(id);
    if (req.user.role !== 'Super_Admin' && String(contact.organization) !== String(req.user.organization._id)) {
      return sendError(res, 'Contact not found', 404);
    }

    await contactService.deleteContact(id);
    return sendSuccess(res, null, 'Contact deleted successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('deleteContact error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * POST /api/contacts/import/error-report
 * Generate and download a CSV error report for failed import rows.
 *
 * Accepts a JSON body with an `errors` array (same shape returned by the import endpoint).
 * Returns a downloadable CSV file.
 *
 * Request body:
 *   { errors: Array<{ row: number, reason: string, data: object }> }
 *
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const downloadImportErrorReport = async (req, res) => {
  try {
    const { errors } = req.body;

    if (!Array.isArray(errors)) {
      return sendError(res, 'Request body must contain an "errors" array', 400);
    }

    // Validate each error entry has the expected shape
    const sanitizedErrors = errors.map((e, i) => ({
      row: typeof e.row === 'number' ? e.row : i + 2,
      reason: typeof e.reason === 'string' ? e.reason : 'Unknown error',
      data: e.data && typeof e.data === 'object' ? e.data : {},
    }));

    const csvContent = contactService.generateErrorReportCSV(sanitizedErrors);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `import-errors-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    return res.status(200).send(csvContent);
  } catch (err) {
    logger.error('downloadImportErrorReport error:', err);
    return sendError(res, 'An unexpected error occurred while generating the error report', 500);
  }
};

/**
 * GET /api/contacts/segments
 * List all saved segments with pagination and optional name search.
 *
 * Query parameters:
 *   page   - Page number (default: 1)
 *   limit  - Items per page (default: 20, max: 100)
 *   search - Case-insensitive partial match on segment name (optional)
 *
 * Response:
 *   { success: true, data: { segments: [...], pagination: { total, page, limit, pages } } }
 *
 * Requires: any authenticated role (enforced in router).
 */
const listSegments = async (req, res) => {
  try {
    const Segment = require('../models/Segment');

    // ── Pagination ──────────────────────────────────────────────────────────
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // ── Build query ─────────────────────────────────────────────────────────
    const query = { ...req.orgFilter };

    if (req.query.search && req.query.search.trim()) {
      // Case-insensitive partial match on segment name
      const escapedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.name = new RegExp(escapedSearch, 'i');
    }

    // ── Execute query ───────────────────────────────────────────────────────
    const [segments, total] = await Promise.all([
      Segment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Segment.countDocuments(query),
    ]);

    const pages = Math.ceil(total / limit);

    return sendSuccess(
      res,
      {
        segments,
        pagination: {
          total,
          page,
          limit,
          pages,
        },
      },
      'Segments retrieved successfully'
    );
  } catch (err) {
    logger.error('listSegments error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * POST /api/contacts/segments
 * Create a new contact segment with filter criteria.
 *
 * Request body:
 *   name         {string}  Required. Segment display name.
 *   description  {string}  Optional. Human-readable description.
 *   filterCriteria {object} Optional. Filter criteria:
 *     industries   {string[]}  Industry names to include
 *     tags         {string[]}  Tags contacts must have (AND logic)
 *     locations    {Array<{city,state,country}>}  Location filters (OR logic)
 *     customFilters {object}  Arbitrary key-value filters
 *
 * Response (201):
 *   { success: true, data: { segment: {...} }, message: '...' }
 *
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const createSegment = async (req, res) => {
  try {
    const segmentData = { ...req.body };
    if (req.user.role !== 'Super_Admin') {
      segmentData.organization = req.user.organization._id;
    }
    const segment = await contactService.createSegment(segmentData, req.user._id);
    return sendCreated(res, { segment }, 'Segment created successfully');
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('createSegment error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * POST /api/contacts/segments/preview
 * Preview a segment's contact count.
 */
const previewSegment = async (req, res) => {
  try {
    const { filterCriteria } = req.body;
    let organization;
    if (req.user.role !== 'Super_Admin') {
      organization = req.user.organization._id || req.user.organization;
    }
    const count = await contactService.previewSegment(filterCriteria, organization);
    return sendSuccess(res, { contactCount: count }, 'Segment preview successful');
  } catch (err) {
    logger.error('previewSegment error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * GET /api/contacts/export
 * Export contacts to a downloadable CSV file.
 *
 * Accepts the same optional query parameters as GET /api/contacts for filtering:
 *   - industry: single value or comma-separated list
 *   - tags: single value or comma-separated list (contacts must have ALL specified tags)
 *   - location.city, location.state, location.country: case-insensitive exact match
 *   - search: text search across name, phone, company, jobTitle
 *
 * Returns a CSV file with columns:
 *   name, phone, job_title, company, industry, tags, city, state, country
 *
 * The CSV format is compatible with the import endpoint so that the
 * round-trip property holds (export → re-import produces identical records).
 *
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const exportContacts = async (req, res) => {
  try {
    const {
      industry,
      tags,
      search,
      'location.city': locationCity,
      'location.state': locationState,
      'location.country': locationCountry,
    } = req.query;

    const filters = {};
    if (industry !== undefined) {filters.industry = industry;}
    if (tags !== undefined) {filters.tags = tags;}
    if (search !== undefined) {filters.search = search;}
    if (locationCity !== undefined) {filters['location.city'] = locationCity;}
    if (locationState !== undefined) {filters['location.state'] = locationState;}
    if (locationCountry !== undefined) {filters['location.country'] = locationCountry;}

    Object.assign(filters, req.orgFilter);

    const csvContent = await contactService.exportContacts(filters);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `contacts-export-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    return res.status(200).send(csvContent);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('exportContacts error:', err);
    return sendError(res, 'An unexpected error occurred during export', 500);
  }
};

/**
 * POST /api/contacts/bulk-tag
 * Bulk assign tags to selected contacts.
 *
 * Request body:
 *   contactIds {string[]} Required. Array of contact MongoDB ObjectIds.
 *   tags       {string[]} Required. Array of tag strings to add.
 *
 * Response:
 *   { success: true, data: { modifiedCount, matchedCount }, message: '...' }
 *
 * Requires: Admin or Campaign_Manager role (enforced in router).
 */
const bulkTag = async (req, res) => {
  try {
    const { contactIds, tags } = req.body;
    const { modifiedCount, matchedCount } = await contactService.bulkTag(contactIds, tags);
    return sendSuccess(
      res,
      { modifiedCount, matchedCount },
      `Tags assigned to ${modifiedCount} contact(s) successfully`
    );
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('bulkTag error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * POST /api/contacts/bulk-delete
 * Bulk delete selected contacts.
 *
 * Request body:
 *   contactIds {string[]} Required. Array of contact MongoDB ObjectIds to delete.
 *
 * Response:
 *   { success: true, data: { deletedCount }, message: '...' }
 *
 * Requires: Admin role (enforced in router).
 */
const bulkDelete = async (req, res) => {
  try {
    const { contactIds } = req.body;
    const { deletedCount } = await contactService.bulkDelete(contactIds);
    return sendSuccess(
      res,
      { deletedCount },
      `${deletedCount} contact(s) deleted successfully`
    );
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, err.statusCode);
    }
    logger.error('bulkDelete error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

module.exports = {
  listContacts,
  createContact,
  getContact,
  updateContact,
  deleteContact,
  importContacts,
  downloadImportErrorReport,
  exportContacts,
  bulkTag,
  bulkDelete,
  listSegments,
  createSegment,
  previewSegment,
  getSegment: (_req, res) => sendError(res, 'Not implemented yet', 501),
  updateSegment: (_req, res) => sendError(res, 'Not implemented yet', 501),
  deleteSegment: (_req, res) => sendError(res, 'Not implemented yet', 501),
};
