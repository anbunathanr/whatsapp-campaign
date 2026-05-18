const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// Placeholder controller — will be implemented in Task 4.6+
const templateController = require('../controllers/template.controller');

// GET /api/templates – All authenticated roles
router.get('/', authenticate, templateController.listTemplates);

// POST /api/templates – Admin, Campaign_Manager
router.post(
  '/',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  templateController.createTemplate
);

// GET /api/templates/:id – All authenticated roles
router.get('/:id', authenticate, templateController.getTemplate);

// PUT /api/templates/:id – Admin, Campaign_Manager
router.put(
  '/:id',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  templateController.updateTemplate
);

// DELETE /api/templates/:id – Admin, Campaign_Manager
router.delete(
  '/:id',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  templateController.deleteTemplate
);

// POST /api/templates/validate – Admin, Campaign_Manager
// Note: must be defined before /:id to avoid route conflict
router.post(
  '/validate',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  templateController.validateTemplate
);

// POST /api/templates/preview – All authenticated roles
router.post('/preview', authenticate, templateController.previewTemplate);

module.exports = router;
