const express = require('express');
const router = express.Router();
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit.middleware');

const campaignController = require('../controllers/campaign.controller');

// GET /api/campaigns – All authenticated roles
router.get('/', authenticate, orgScope, campaignController.listCampaigns);

// POST /api/campaigns – Admin, Campaign_Manager
router.post(
  '/',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('campaign_created', 'Campaign'),
  campaignController.createCampaign
);

// POST /api/campaigns/media – Admin, Campaign_Manager (media file upload)
router.post(
  '/media',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  campaignController.uploadCampaignMedia
);

// GET /api/campaigns/best-time – All authenticated roles (AI recommendation)
router.get(
  '/best-time',
  authenticate,
  orgScope,
  campaignController.getBestTimeToSend
);

// GET /api/campaigns/:id – All authenticated roles
router.get('/:id', authenticate, orgScope, campaignController.getCampaign);

// PUT /api/campaigns/:id – Admin, Campaign_Manager
router.put(
  '/:id',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('campaign_updated', 'Campaign'),
  campaignController.updateCampaign
);

// DELETE /api/campaigns/:id – Admin, Campaign_Manager (archives the campaign)
router.delete(
  '/:id',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  campaignController.archiveCampaign
);

// POST /api/campaigns/:id/clone – Admin, Campaign_Manager
router.post(
  '/:id/clone',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  campaignController.cloneCampaign
);

// POST /api/campaigns/:id/schedule – Admin, Campaign_Manager
router.post(
  '/:id/schedule',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  campaignController.scheduleCampaign
);

// POST /api/campaigns/:id/media – Admin, Campaign_Manager (attach media to campaign)
router.post(
  '/:id/media',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  campaignController.attachCampaignMedia
);

// POST /api/campaigns/:id/execute – Admin, Campaign_Manager
router.post(
  '/:id/execute',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  auditLog('campaign_executed', 'Campaign'),
  campaignController.executeCampaign
);

// POST /api/campaigns/:id/cancel – Admin, Campaign_Manager
router.post(
  '/:id/cancel',
  authenticate,
  orgScope,
  authorize('Admin', 'Campaign_Manager'),
  campaignController.cancelCampaign
);

// GET /api/campaigns/:id/preview – All authenticated roles
router.get('/:id/preview', authenticate, orgScope, campaignController.previewCampaign);

// GET /api/campaigns/:id/status – All authenticated roles
router.get('/:id/status', authenticate, orgScope, campaignController.getCampaignStatus);

module.exports = router;
