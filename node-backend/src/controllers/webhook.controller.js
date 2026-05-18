const { sendSuccess, sendError } = require('../utils/apiResponse');
const webhookService = require('../services/webhook.service');
const config = require('../config');
const logger = require('../utils/logger');

const receiveWhatsApp = async (req, res) => {
  // Validate signature (Task 6.2 requirement)
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = config.appUrl + req.originalUrl;
  
  if (config.env === 'production' && twilioSignature) {
    const isValid = webhookService.validateSignature(url, req.body, twilioSignature, config.twilio.authToken);
    if (!isValid) {
      logger.warn('Invalid Twilio signature received.');
      return sendError(res, 'Invalid signature', 403);
    }
  }

  // Must respond within 2 seconds per spec requirement 7.9
  res.status(200).send('OK');

  try {
    // Process async
    await webhookService.processWebhookEvent(req.body);
  } catch (err) {
    logger.error('Error processing webhook event:', err);
  }
};

const verify = (req, res) => {
  return sendSuccess(res, null, 'Webhook endpoint is active.');
};

module.exports = { receiveWhatsApp, verify };
