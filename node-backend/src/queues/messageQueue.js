/**
 * Message Queue
 * Bull queue for processing outbound WhatsApp messages with rate limiting and retry logic.
 * Full implementation: Tasks 5.3, 5.6
 */
const Bull = require('bull');
const config = require('../config');
const logger = require('../utils/logger');
const { sendWhatsAppMessage } = require('../services/twilio.service');

const MESSAGE_QUEUE_NAME = 'whatsapp-messages';

/**
 * Build the Redis connection options for Bull.
 * Supports plain Redis URL and ElastiCache with AUTH + optional TLS.
 * Passing an options object (instead of a raw URL string) avoids ioredis
 * URL-parsing quirks with passwords that contain special characters.
 */
const buildRedisOptions = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const parsed = new URL(redisUrl);
    const opts = {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      db: parsed.pathname ? parseInt(parsed.pathname.replace('/', ''), 10) || 0 : 0,
    };
    // Support Redis AUTH password (redis://:password@host:port)
    if (parsed.password) {
      opts.password = decodeURIComponent(parsed.password);
    }
    // Enable TLS for rediss:// (AWS ElastiCache in-transit encryption)
    if (parsed.protocol === 'rediss:') {
      opts.tls = {};
    }
    return opts;
  } catch (_) {
    // Fallback to defaults if URL parsing fails
    return { host: 'localhost', port: 6379 };
  }
};

// Create Bull queue backed by Redis
const messageQueue = new Bull(MESSAGE_QUEUE_NAME, {
  redis: buildRedisOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000, // 2^retryCount seconds (1s, 2s, 4s)
    },
    removeOnComplete: 100, // keep last 100 completed jobs
    removeOnFail: 500, // keep last 500 failed jobs for inspection
  },
  limiter: {
    max: 80, // Maximum 80 messages per duration
    duration: 1000, // Per 1 second (WhatsApp API rate limit compliance)
  },
});

// ─── Queue Processor ──────────────────────────────────────────────────────────

/**
 * Process message jobs from the queue.
 * This processor will be enhanced in Task 5.2 to integrate with Twilio WhatsApp API.
 * For now, it provides the infrastructure for message processing.
 */
messageQueue.process(async (job) => {
  const { messageId, campaignId, contactId, phoneNumber, content, mediaUrl, userId } = job.data;

  logger.info(`Processing message job ${job.id} for ${phoneNumber}`, {
    messageId,
    campaignId,
    contactId,
    attempt: job.attemptsMade + 1,
  });

  try {
    let credentials = null;
    if (userId) {
      const User = require('../models/User');
      const user = await User.findById(userId).lean();
      if (user && user.organization) {
        const Organization = require('../models/Organization');
        const org = await Organization.findById(user.organization).lean();
        if (org && org.twilioAccountSid && org.twilioAuthToken && org.twilioWhatsappFrom) {
          credentials = {
            accountSid: org.twilioAccountSid,
            authToken: org.twilioAuthToken,
            whatsappFrom: org.twilioWhatsappFrom,
          };
        }
      }
    }

    // Integrate with Twilio WhatsApp API
    let absoluteMediaUrl = mediaUrl;
    if (mediaUrl && mediaUrl.startsWith('/')) {
      const baseUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
      absoluteMediaUrl = `${baseUrl}${mediaUrl}`;
    }

    // Twilio cannot download media from localhost — skip the media attachment
    // to avoid message delivery failure. Set PUBLIC_APP_URL in .env to a
    // publicly reachable URL (e.g. an ngrok tunnel) to enable media delivery.
    const isLocalUrl = absoluteMediaUrl && (
      absoluteMediaUrl.includes('localhost') ||
      absoluteMediaUrl.includes('127.0.0.1')
    );
    if (isLocalUrl) {
      logger.warn(
        `Message ${messageId}: media URL "${absoluteMediaUrl}" is not publicly accessible. ` +
        `Sending text-only message. Set PUBLIC_APP_URL in .env to enable media attachments.`
      );
      absoluteMediaUrl = undefined;
    }

    const result = await sendWhatsAppMessage(phoneNumber, content, absoluteMediaUrl, credentials);

    logger.info(`Message ${messageId} sent to Twilio successfully`, {
      phoneNumber,
      sid: result.sid,
    });

    // Return job result for tracking
    return {
      messageId,
      phoneNumber,
      externalMessageId: result.sid,
      status: 'sent',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Failed to process message ${messageId}:`, {
      error: error.message,
      phoneNumber,
      attempt: job.attemptsMade + 1,
    });

    // Re-throw to trigger Bull's retry mechanism
    throw error;
  }
});

// ─── Queue Event Handlers ─────────────────────────────────────────────────────

/**
 * Helper to check if a campaign has finished processing all its messages.
 * Transitions the campaign status to 'completed' if so.
 */
const checkCampaignCompletion = async (campaignId) => {
  if (!campaignId) return;
  try {
    const Campaign = require('../models/Campaign');
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'executing') return;

    const totalProcessed = (campaign.messagesSent || 0) + (campaign.messagesFailed || 0);
    if (totalProcessed >= campaign.actualRecipients) {
      await Campaign.findByIdAndUpdate(campaignId, {
        status: 'completed',
        completedAt: new Date(),
      });
      logger.info(`Campaign ${campaignId} has completed processing.`);
    }
  } catch (error) {
    logger.error(`Failed to check campaign completion for ${campaignId}:`, error.message);
  }
};

/**
 * Event handler for successfully completed jobs.
 * Updates message status and campaign metrics in the database.
 */
messageQueue.on('completed', async (job, result) => {
  logger.info(`Message job ${job.id} completed successfully`, {
    messageId: job.data.messageId,
    phoneNumber: job.data.phoneNumber,
    result,
  });

  try {
    // Import Message model dynamically to avoid circular dependencies
    const Message = require('../models/Message');
    const Campaign = require('../models/Campaign');

    // Update message status to 'sent' (will be updated to 'delivered' by webhook)
    await Message.findByIdAndUpdate(job.data.messageId, {
      status: 'sent',
      sentAt: new Date(),
      externalMessageId: result?.externalMessageId,
      retryCount: job.attemptsMade,
    });

    // Increment campaign messagesSent counter
    if (job.data.campaignId) {
      await Campaign.findByIdAndUpdate(job.data.campaignId, {
        $inc: { messagesSent: 1 },
      });
      await checkCampaignCompletion(job.data.campaignId);
    }

    logger.debug(`Message ${job.data.messageId} status updated to 'sent'`);
  } catch (error) {
    logger.error(`Failed to update message status after completion:`, {
      messageId: job.data.messageId,
      error: error.message,
    });
  }
});

/**
 * Event handler for failed jobs.
 * Updates message status to 'failed' after max retries and increments campaign failure counter.
 */
messageQueue.on('failed', async (job, err) => {
  const isFinalAttempt = job.attemptsMade >= 3;

  logger.error(`Message job ${job.id} failed after ${job.attemptsMade} attempts`, {
    messageId: job.data.messageId,
    phoneNumber: job.data.phoneNumber,
    error: err.message,
    finalAttempt: isFinalAttempt,
  });

  // Only update database on final failure (after all retries exhausted)
  if (isFinalAttempt) {
    try {
      const Message = require('../models/Message');
      const Campaign = require('../models/Campaign');

      // Update message status to 'failed' with error details
      await Message.findByIdAndUpdate(job.data.messageId, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: job.attemptsMade,
        errorMessage: err.message,
        errorCode: err.code || 'UNKNOWN_ERROR',
      });

      // Increment campaign messagesFailed counter
      if (job.data.campaignId) {
        await Campaign.findByIdAndUpdate(job.data.campaignId, {
          $inc: { messagesFailed: 1 },
        });
        await checkCampaignCompletion(job.data.campaignId);
      }

      logger.info(`Message ${job.data.messageId} marked as failed in database`);
    } catch (error) {
      logger.error(`Failed to update message status after final failure:`, {
        messageId: job.data.messageId,
        error: error.message,
      });
    }
  }
});

/**
 * Event handler for stalled jobs.
 * Logs warning when a job has stalled (worker crashed or took too long).
 */
messageQueue.on('stalled', (job) => {
  logger.warn(`Message job ${job.id} has stalled`, {
    messageId: job.data.messageId,
    phoneNumber: job.data.phoneNumber,
    attemptsMade: job.attemptsMade,
  });
});

/**
 * Event handler for queue-level errors.
 * Logs critical errors that affect the entire queue.
 */
messageQueue.on('error', (err) => {
  logger.error('Message queue error:', {
    error: err.message,
    stack: err.stack,
  });
});

/**
 * Event handler for jobs entering waiting state.
 * Logs when a job is added to the queue and waiting to be processed.
 */
messageQueue.on('waiting', (jobId) => {
  logger.debug(`Job ${jobId} is waiting to be processed`);
});

/**
 * Event handler for jobs starting processing.
 * Logs when a job transitions from waiting to active state.
 */
messageQueue.on('active', (job) => {
  logger.debug(`Job ${job.id} has started processing`, {
    messageId: job.data.messageId,
    phoneNumber: job.data.phoneNumber,
    attempt: job.attemptsMade + 1,
  });
});

/**
 * Event handler for job progress updates.
 * Logs progress percentage for long-running jobs.
 */
messageQueue.on('progress', (job, progress) => {
  logger.debug(`Job ${job.id} progress: ${progress}%`, {
    messageId: job.data.messageId,
  });
});

/**
 * Event handler for jobs being removed from the queue.
 * Logs when completed or failed jobs are cleaned up.
 */
messageQueue.on('removed', (job) => {
  logger.debug(`Job ${job.id} removed from queue`, {
    messageId: job.data.messageId,
    status: job.finishedOn ? 'completed' : 'failed',
  });
});

/**
 * Event handler for queue being drained (all jobs completed).
 * Useful for detecting when a campaign has finished processing.
 */
messageQueue.on('drained', () => {
  logger.info('Message queue drained - all jobs completed');
});

/**
 * Event handler for queue being paused.
 * Logs when queue processing is paused.
 */
messageQueue.on('paused', () => {
  logger.info('Message queue has been paused');
});

/**
 * Event handler for queue being resumed.
 * Logs when queue processing is resumed after pause.
 */
messageQueue.on('resumed', () => {
  logger.info('Message queue has been resumed');
});

/**
 * Event handler for queue being cleaned.
 * Logs when old jobs are removed from the queue.
 */
messageQueue.on('cleaned', (jobs, type) => {
  logger.info(`Queue cleaned: ${jobs.length} ${type} jobs removed`);
});

/**
 * Add a single message job to the queue.
 * @param {object} messageData - { messageId, campaignId, contactId, phoneNumber, content, mediaUrl }
 * @returns {Promise<Bull.Job>}
 */
const enqueueMessage = async (messageData) => {
  try {
    const job = await messageQueue.add(messageData, {
      jobId: messageData.messageId, // idempotent job ID prevents duplicates
    });

    logger.info(`Message enqueued: ${messageData.messageId}`, {
      jobId: job.id,
      phoneNumber: messageData.phoneNumber,
    });

    return job;
  } catch (error) {
    logger.error(`Failed to enqueue message ${messageData.messageId}:`, {
      error: error.message,
      phoneNumber: messageData.phoneNumber,
    });
    throw error;
  }
};

/**
 * Add multiple message jobs to the queue in bulk.
 * @param {object[]} messages - Array of message data objects
 * @returns {Promise<Bull.Job[]>}
 */
const enqueueBatch = async (messages) => {
  try {
    const jobs = messages.map((msg) => ({
      data: msg,
      opts: { jobId: msg.messageId },
    }));

    const enqueuedJobs = await messageQueue.addBulk(jobs);

    logger.info(`Batch enqueued: ${enqueuedJobs.length} messages`, {
      campaignId: messages[0]?.campaignId,
    });

    return enqueuedJobs;
  } catch (error) {
    logger.error('Failed to enqueue batch:', {
      error: error.message,
      count: messages.length,
    });
    throw error;
  }
};

/**
 * Get queue statistics and health information.
 * @returns {Promise<object>} Queue statistics
 */
const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      messageQueue.getWaitingCount(),
      messageQueue.getActiveCount(),
      messageQueue.getCompletedCount(),
      messageQueue.getFailedCount(),
      messageQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    logger.error('Failed to get queue stats:', error.message);
    throw error;
  }
};

/**
 * Pause the queue (stop processing new jobs).
 * @returns {Promise<void>}
 */
const pauseQueue = async () => {
  await messageQueue.pause();
  logger.info('Message queue paused');
};

/**
 * Resume the queue (start processing jobs again).
 * @returns {Promise<void>}
 */
const resumeQueue = async () => {
  await messageQueue.resume();
  logger.info('Message queue resumed');
};

/**
 * Clean old completed and failed jobs from the queue.
 * @param {number} gracePeriod - Age in milliseconds (default: 24 hours)
 * @returns {Promise<void>}
 */
const cleanQueue = async (gracePeriod = 24 * 60 * 60 * 1000) => {
  try {
    await messageQueue.clean(gracePeriod, 'completed');
    await messageQueue.clean(gracePeriod, 'failed');
    logger.info(`Queue cleaned: removed jobs older than ${gracePeriod}ms`);
  } catch (error) {
    logger.error('Failed to clean queue:', error.message);
    throw error;
  }
};

/**
 * Gracefully close the queue connection.
 * @returns {Promise<void>}
 */
const closeQueue = async () => {
  await messageQueue.close();
  logger.info('Message queue connection closed');
};

module.exports = {
  messageQueue,
  enqueueMessage,
  enqueueBatch,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  closeQueue,
};
