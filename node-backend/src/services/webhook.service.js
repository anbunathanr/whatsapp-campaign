/**
 * Webhook Service
 * Handles WhatsApp delivery status event processing, signature validation, and status updates.
 * Full implementation: Tasks 6.2 – 6.4
 */

const twilio = require('twilio');
const Message = require('../models/Message');
const Campaign = require('../models/Campaign');
const WebhookEvent = require('../models/WebhookEvent');
const logger = require('../utils/logger');
const workflowService = require('./workflow.service');

const validateSignature = (url, params, signature, authToken) => {
  if (!signature || !authToken) {return false;}
  return twilio.validateRequest(authToken, signature, url, params);
};

const processWebhookEvent = async (eventPayload) => {
  const { MessageSid, MessageStatus, Body, From, ErrorCode, ErrorMessage } = eventPayload;

  if (!MessageSid) {
    logger.warn('Webhook payload missing MessageSid');
    return;
  }

  let eventType = MessageStatus;
  // If MessageStatus is not present, it is an incoming reply from the user
  if (!MessageStatus && Body) {
    eventType = 'replied';
  }

  if (!eventType) {
    eventType = 'unknown';
  }

  // Idempotency: skip if already processed in WebhookEvent
  const existingEvent = await WebhookEvent.findOne({ externalMessageId: MessageSid, eventType });
  if (existingEvent) {
    logger.debug(`Webhook event already processed for MessageSid ${MessageSid} and eventType ${eventType}`);
    return;
  }

  const message = await Message.findOne({ externalMessageId: MessageSid }).populate('campaign');

  const whEvent = new WebhookEvent({
    eventType,
    externalMessageId: MessageSid,
    message: message ? message._id : undefined,
    payload: eventPayload,
  });
  await whEvent.save();

  // ── Handle auto-reply for incoming messages ──────────────────────────────────
  // This runs whether or not we have a matching outbound message record.
  // Supports fresh inbound messages from numbers not in any campaign.
  if (eventType === 'replied' && Body && From) {
    try {
      // Determine organization from the matched campaign message if available
      const organizationId = message?.campaign?.organization || message?.organization || null;

      const matchedWf = await workflowService.matchAutoResponse(Body, organizationId);
      if (matchedWf) {
        // Normalize sender's number — Twilio sends "whatsapp:+91xxx"
        const senderPhone = From.replace(/^whatsapp:/i, '');

        if (matchedWf.triggerConfig.autoResponse) {
          // Direct text auto-reply — no n8n needed
          const twilioService = require('./twilio.service');
          await twilioService.sendWhatsAppMessage(senderPhone, matchedWf.triggerConfig.autoResponse);
          logger.info(`Auto-reply sent to ${senderPhone} for keyword "${matchedWf.triggerConfig.keyword}"`);
        } else if (matchedWf.n8nWorkflowId) {
          // Forward to n8n for complex workflows
          await workflowService.executeN8nWorkflow(matchedWf.n8nWorkflowId, {
            incomingMessage: Body,
            from: senderPhone,
            organizationId,
          });
          logger.info(`n8n workflow ${matchedWf.n8nWorkflowId} triggered for keyword "${matchedWf.triggerConfig.keyword}"`);
        }

        matchedWf.executionCount += 1;
        matchedWf.lastExecutedAt = new Date();
        await matchedWf.save();
      }
    } catch (err) {
      logger.error('Failed to process auto-response workflow: ' + err.message);
    }
  }

  // ── If no outbound message record found, nothing more to update ──────────────
  if (!message) {
    logger.warn(`No outbound message record found for MessageSid ${MessageSid} — skipping status update`);
    whEvent.processed = true;
    whEvent.processedAt = new Date();
    await whEvent.save();
    return;
  }

  const oldStatus = message.status;

  if (eventType === 'delivered') {
    message.status = 'delivered';
    message.deliveredAt = new Date();
  } else if (eventType === 'read') {
    message.status = 'read';
    message.readAt = new Date();
  } else if (eventType === 'failed' || eventType === 'undelivered') {
    message.status = 'failed';
    message.failedAt = new Date();
    message.errorCode = ErrorCode;
    message.errorMessage = ErrorMessage;
  } else if (eventType === 'replied') {
    message.status = 'replied';
    message.repliedAt = new Date();
    message.replyContent = Body;
  }

  await message.save();

  // Update campaign metrics
  if (message.campaign) {
    const incObj = {};
    if (eventType === 'delivered' && oldStatus !== 'delivered' && oldStatus !== 'read' && oldStatus !== 'replied') {
      incObj.messagesDelivered = 1;
    } else if (eventType === 'read' && oldStatus !== 'read' && oldStatus !== 'replied') {
      incObj.messagesRead = 1;
    } else if ((eventType === 'failed' || eventType === 'undelivered') && oldStatus !== 'failed') {
      incObj.messagesFailed = 1;
    } else if (eventType === 'replied' && oldStatus !== 'replied') {
      incObj.messagesReplied = 1;
    }

    if (Object.keys(incObj).length > 0) {
      await Campaign.findByIdAndUpdate(message.campaign._id, { $inc: incObj });
    }
  }

  whEvent.processed = true;
  whEvent.processedAt = new Date();
  await whEvent.save();

  logger.info(`Processed webhook event for MessageSid ${MessageSid}: ${eventType}`);
};

module.exports = {
  validateSignature,
  processWebhookEvent,
};
