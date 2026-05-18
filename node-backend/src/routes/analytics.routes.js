const express = require('express');
const router = express.Router();
const { authenticate, authorize, orgScope } = require('../middleware/auth');

// Placeholder controller — will be implemented in Task 7.1+
const analyticsController = require('../controllers/analytics.controller');

// GET /api/analytics/dashboard – All authenticated roles
router.get('/dashboard', authenticate, orgScope, analyticsController.getDashboard);

// GET /api/analytics/campaigns/:id – All authenticated roles
router.get('/campaigns/:id', authenticate, orgScope, analyticsController.getCampaignAnalytics);

// GET /api/analytics/industry – All authenticated roles
router.get('/industry', authenticate, orgScope, analyticsController.getIndustryAnalytics);

// GET /api/analytics/trends – All authenticated roles (supports ?days=30)
router.get('/trends', authenticate, orgScope, analyticsController.getTrends);

// GET /api/analytics/summary – All authenticated roles
router.get('/summary', authenticate, orgScope, analyticsController.getCampaignSummary);

// GET /api/analytics/campaign/:id – All authenticated roles
router.get('/campaign/:id', authenticate, orgScope, analyticsController.getCampaignAnalytics);

// POST /api/analytics/reports – Admin, Campaign_Manager
router.post(
  '/reports',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  analyticsController.generateReport
);

// GET /api/analytics/engagement/:contactId – All authenticated roles
router.get('/engagement/:contactId', authenticate, orgScope, analyticsController.getContactEngagement);

// GET /api/analytics/message-status – All authenticated roles (all 6 Twilio statuses)
router.get('/message-status', authenticate, orgScope, analyticsController.getMessageStatusBreakdown);

module.exports = router;
