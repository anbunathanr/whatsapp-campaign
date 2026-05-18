const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const contactRoutes = require('./contact.routes');
const campaignRoutes = require('./campaign.routes');
const templateRoutes = require('./template.routes');
const analyticsRoutes = require('./analytics.routes');
const webhookRoutes = require('./webhook.routes');
const workflowRoutes = require('./workflow.routes');
const adminRoutes = require('./admin.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/contacts', contactRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/templates', templateRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/workflows', workflowRoutes);
router.use('/admin', adminRoutes);
router.use('/organizations', require('./organization.routes'));

module.exports = router;
