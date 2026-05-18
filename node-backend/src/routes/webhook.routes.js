const express = require('express');
const router = express.Router();

// Placeholder controller — will be implemented in Task 6.2+
const webhookController = require('../controllers/webhook.controller');

// Note: webhook endpoints intentionally do NOT use authenticate middleware
// because they are called by external services (WhatsApp/Twilio).
// Authenticity is verified via HMAC signature validation inside the controller.
router.post('/whatsapp', webhookController.receiveWhatsApp);
router.get('/verify', webhookController.verify);

module.exports = router;
