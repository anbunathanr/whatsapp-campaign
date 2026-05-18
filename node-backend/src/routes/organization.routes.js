const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const organizationController = require('../controllers/organization.controller');

// ── Super Admin Routes ──
router.get('/', authenticate, authorize('Super_Admin'), organizationController.listOrganizations);
router.post('/', authenticate, authorize('Super_Admin'), organizationController.createOrganization);
router.put('/:id/approve', authenticate, authorize('Super_Admin'), organizationController.approveOrganization);
router.put('/:id/suspend', authenticate, authorize('Super_Admin'), organizationController.suspendOrganization);

// ── Org Admin Routes ──
router.get('/me', authenticate, authorize('Org_Admin'), organizationController.getMyOrganization);
router.put('/me', authenticate, authorize('Org_Admin'), organizationController.updateMyOrganization);

module.exports = router;
