const express = require('express');
const router = express.Router();
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/audit.middleware');

const contactController = require('../controllers/contact.controller');

// ── Segment routes (must come before /:id to avoid conflicts) ─────────────────

// GET /api/contacts/segments – All authenticated roles
router.get('/segments', authenticate, orgScope, contactController.listSegments);

// POST /api/contacts/segments – Admin, Campaign_Manager
router.post(
  '/segments',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.createSegment
);

// POST /api/contacts/segments/preview – Admin, Campaign_Manager
router.post(
  '/segments/preview',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.previewSegment
);

// GET /api/contacts/segments/:id – All authenticated roles
router.get('/segments/:id', authenticate, orgScope, contactController.getSegment);

// PUT /api/contacts/segments/:id – Admin, Campaign_Manager
router.put(
  '/segments/:id',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.updateSegment
);

// DELETE /api/contacts/segments/:id – Admin, Campaign_Manager
router.delete(
  '/segments/:id',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.deleteSegment
);

// ── Bulk operations ───────────────────────────────────────────────────────────

// POST /api/contacts/bulk-tag – Admin, Campaign_Manager
router.post(
  '/bulk-tag',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.bulkTag
);

// POST /api/contacts/bulk-delete – Admin only (high-risk bulk operation)
router.post(
  '/bulk-delete',
  authenticate,
  orgScope,
  authorize('Admin'),
  contactController.bulkDelete
);

// ── Import / Export ───────────────────────────────────────────────────────────

// POST /api/contacts/import/error-report – Admin, Campaign_Manager
router.post(
  '/import/error-report',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.downloadImportErrorReport
);

// POST /api/contacts/import – Admin, Campaign_Manager
router.post(
  '/import',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  uploadLimiter,
  auditLog('contact_imported', 'Contact'),
  ...contactController.importContacts
);

// GET /api/contacts/export – Admin, Campaign_Manager
router.get(
  '/export',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.exportContacts
);

// ── CRUD ──────────────────────────────────────────────────────────────────────

// GET /api/contacts – All authenticated roles
router.get('/', authenticate, orgScope, contactController.listContacts);

// POST /api/contacts – Admin, Campaign_Manager
router.post(
  '/',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('contact_created', 'Contact'),
  contactController.createContact
);

// GET /api/contacts/:id – All authenticated roles
router.get('/:id', authenticate, orgScope, contactController.getContact);

// PUT /api/contacts/:id – Admin, Campaign_Manager
router.put(
  '/:id',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  contactController.updateContact
);

// DELETE /api/contacts/:id – Admin, Campaign_Manager
router.delete(
  '/:id',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('contact_deleted', 'Contact'),
  contactController.deleteContact
);

module.exports = router;
