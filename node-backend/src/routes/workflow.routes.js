const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit.middleware');

const workflowController = require('../controllers/workflow.controller');

// GET /api/workflows – Admin, Campaign_Manager
router.get(
  '/',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  workflowController.listWorkflows
);

// POST /api/workflows – Admin, Campaign_Manager
router.post(
  '/',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('workflow_created', 'Workflow'),
  workflowController.createWorkflow
);

// GET /api/workflows/:id – Admin, Campaign_Manager
router.get(
  '/:id',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  workflowController.getWorkflow
);

// PUT /api/workflows/:id – Admin, Campaign_Manager
router.put(
  '/:id',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  workflowController.updateWorkflow
);

// DELETE /api/workflows/:id – Admin, Campaign_Manager
router.delete(
  '/:id',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  workflowController.deleteWorkflow
);

// POST /api/workflows/:id/execute – Admin, Campaign_Manager
router.post(
  '/:id/execute',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('workflow_executed', 'Workflow'),
  workflowController.executeWorkflow
);

// GET /api/workflows/:id/logs – Admin, Campaign_Manager
router.get(
  '/:id/logs',
  authenticate,
  authorize('Admin', 'Campaign_Manager'),
  workflowController.getWorkflowLogs
);

module.exports = router;
