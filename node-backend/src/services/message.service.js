/**
 * Message Service
 * Handles WhatsApp message sending, personalization, queue management, and retry logic.
 * Full implementation: Tasks 5.2 – 5.6
 */

const mongoose = require('mongoose');
const { renderTemplate } = require('./templateParser.service');
const twilioService = require('./twilio.service');
const Message = require('../models/Message');
const logger = require('../utils/logger');

/**
 * Send a WhatsApp message to a recipient via the Twilio service.
 *
 * Requirements: 5.6, 5.7, 5.9
 *
 * @param {string} phoneNumber - Recipient phone number in E.164 format
 * @param {string} content     - Message body text
 * @param {string} [mediaUrl]  - Optional public URL of a media attachment
 * @returns {Promise<{ externalMessageId: string, status: string }>}
 * @throws Re-throws TwilioServiceError so callers can handle retry logic
 */
const sendMessage = async (phoneNumber, content, mediaUrl) => {
  try {
    const { sid, status } = await twilioService.sendWhatsAppMessage(phoneNumber, content, mediaUrl);
    // Requirement 5.9: return 'sent' status immediately after successful API submission
    return { externalMessageId: sid, status: 'sent' };
  } catch (err) {
    // Requirement 5.7: log the failure
    logger.error(
      'message.service: sendMessage failed for %s — %s',
      phoneNumber,
      err.message
    );
    // Re-throw so callers can handle retry logic
    throw err;
  }
};

/**
 * Personalize a message template for a specific contact.
 *
 * Replaces all {{variable}} and {{nested.dot.notation}} placeholders with
 * the corresponding values from the contact object.
 *
 * Requirements: 5.2, 13.4
 *
 * @param {string} template - Raw template string with {{...}} placeholders
 * @param {object} contact  - Contact data object (may include nested fields)
 * @returns {Promise<string>} Personalized message string
 */
const personalizeMessage = async (template, contact) => {
  return renderTemplate(template, contact);
};

/**
 * Send a WhatsApp message and persist the result to the Message document.
 *
 * Bridges the Twilio API call with Message model persistence:
 * - On success: sets status to 'sent', records externalMessageId and sentAt, saves the document.
 * - On failure: sets status to 'failed', records errorCode, errorMessage, failedAt, increments
 *   retryCount, saves the document, then re-throws the error so callers can handle retry logic.
 *
 * Requirement 5.7 — Log failure and increment retry counter.
 * Requirement 5.9 — Update Delivery_Status to "sent" immediately after successful API submission.
 *
 * @param {import('../models/Message').default} messageDoc - Mongoose Message document (status: 'queued')
 * @param {string} [mediaUrl] - Optional public URL of a media attachment
 * @returns {Promise<import('../models/Message').default>} Updated Message document on success
 * @throws Re-throws TwilioServiceError so callers can handle retry logic
 */
const sendAndUpdateMessage = async (messageDoc, mediaUrl) => {
  try {
    const { sid } = await twilioService.sendWhatsAppMessage(
      messageDoc.phoneNumber,
      messageDoc.messageContent,
      mediaUrl
    );

    // Requirement 5.9: update status to 'sent' immediately after successful API submission
    messageDoc.status = 'sent';
    messageDoc.externalMessageId = sid;
    messageDoc.sentAt = new Date();
    await messageDoc.save();

    logger.info(
      'message.service: Message sent and persisted — SID: %s, phoneNumber: %s',
      sid,
      messageDoc.phoneNumber
    );

    return messageDoc;
  } catch (err) {
    // Requirement 5.7: log the failure and increment the retry counter
    messageDoc.status = 'failed';
    messageDoc.errorCode = err.code;
    messageDoc.errorMessage = err.message;
    messageDoc.failedAt = new Date();
    messageDoc.retryCount = (messageDoc.retryCount || 0) + 1;
    await messageDoc.save();

    logger.error(
      'message.service: sendAndUpdateMessage failed for %s — code: %s, error: %s',
      messageDoc.phoneNumber,
      err.code,
      err.message
    );

    // Re-throw so callers can handle retry logic
    throw err;
  }
};

const queueCampaignMessages = async (_campaignId, _contacts) => {
  throw new Error('Not implemented yet');
};

const retryFailedMessage = async (_messageId) => {
  throw new Error('Not implemented yet');
};

/**
 * Retrieve the current status and delivery details of a message by its ID.
 *
 * Requirement 5.9 — Update and expose delivery status fields.
 *
 * @param {string} messageId - MongoDB ObjectId string of the Message document
 * @returns {Promise<object>} Message document with status fields
 * @throws {Error} 400 if messageId is not a valid ObjectId
 * @throws {Error} 404 if no message is found with the given ID
 */
const getMessageStatus = async (messageId) => {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    const err = new Error('Invalid message ID');
    err.statusCode = 400;
    throw err;
  }

  const message = await Message.findById(messageId).select(
    'status externalMessageId sentAt deliveredAt readAt failedAt repliedAt errorCode errorMessage retryCount'
  );

  if (!message) {
    const err = new Error('Message not found');
    err.statusCode = 404;
    throw err;
  }

  logger.info('message.service: getMessageStatus — messageId: %s, status: %s', messageId, message.status);

  return message;
};

module.exports = {
  sendMessage,
  personalizeMessage,
  sendAndUpdateMessage,
  getMessageStatus,
  queueCampaignMessages,
  retryFailedMessage,
};
