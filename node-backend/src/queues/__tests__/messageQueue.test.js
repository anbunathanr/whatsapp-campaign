/**
 * Message Queue Tests
 * Tests for Bull queue setup and basic operations
 */

const {
  messageQueue,
  enqueueMessage,
  enqueueBatch,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  closeQueue,
} = require('../messageQueue');

describe('Message Queue', () => {
  afterAll(async () => {
    // Clean up and close queue after tests
    await messageQueue.empty();
    await closeQueue();
  });

  describe('Queue Configuration', () => {
    it('should have correct queue name', () => {
      expect(messageQueue.name).toBe('whatsapp-messages');
    });

    it('should have retry configuration', () => {
      const opts = messageQueue.defaultJobOptions;
      expect(opts.attempts).toBe(3);
      expect(opts.backoff.type).toBe('exponential');
      expect(opts.backoff.delay).toBe(1000);
    });

    it('should have rate limiter configured', () => {
      expect(messageQueue.limiter).toBeDefined();
      expect(messageQueue.limiter.max).toBe(80);
      expect(messageQueue.limiter.duration).toBe(1000);
    });
  });

  describe('enqueueMessage', () => {
    it('should enqueue a single message', async () => {
      const messageData = {
        messageId: 'test-msg-1',
        campaignId: 'campaign-1',
        contactId: 'contact-1',
        phoneNumber: '+1234567890',
        content: 'Test message',
        mediaUrl: null,
      };

      const job = await enqueueMessage(messageData);

      expect(job).toBeDefined();
      expect(job.id).toBe('test-msg-1');
      expect(job.data).toEqual(messageData);
    });

    it('should prevent duplicate messages with same messageId', async () => {
      const messageData = {
        messageId: 'test-msg-duplicate',
        campaignId: 'campaign-1',
        contactId: 'contact-1',
        phoneNumber: '+1234567890',
        content: 'Test message',
        mediaUrl: null,
      };

      const job1 = await enqueueMessage(messageData);
      const job2 = await enqueueMessage(messageData);

      // Both should return the same job (idempotent)
      expect(job1.id).toBe(job2.id);
    });
  });

  describe('enqueueBatch', () => {
    it('should enqueue multiple messages', async () => {
      const messages = [
        {
          messageId: 'batch-msg-1',
          campaignId: 'campaign-2',
          contactId: 'contact-1',
          phoneNumber: '+1111111111',
          content: 'Batch message 1',
          mediaUrl: null,
        },
        {
          messageId: 'batch-msg-2',
          campaignId: 'campaign-2',
          contactId: 'contact-2',
          phoneNumber: '+2222222222',
          content: 'Batch message 2',
          mediaUrl: null,
        },
        {
          messageId: 'batch-msg-3',
          campaignId: 'campaign-2',
          contactId: 'contact-3',
          phoneNumber: '+3333333333',
          content: 'Batch message 3',
          mediaUrl: null,
        },
      ];

      const jobs = await enqueueBatch(messages);

      expect(jobs).toHaveLength(3);
      expect(jobs[0].data.messageId).toBe('batch-msg-1');
      expect(jobs[1].data.messageId).toBe('batch-msg-2');
      expect(jobs[2].data.messageId).toBe('batch-msg-3');
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await getQueueStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');
      expect(stats).toHaveProperty('total');

      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.delayed).toBe('number');
      expect(typeof stats.total).toBe('number');
    });
  });

  describe('Queue Control', () => {
    it('should pause and resume queue', async () => {
      await pauseQueue();
      expect(await messageQueue.isPaused()).toBe(true);

      await resumeQueue();
      expect(await messageQueue.isPaused()).toBe(false);
    });

    it('should clean old jobs', async () => {
      // This test just verifies the function doesn't throw
      await expect(cleanQueue(1000)).resolves.not.toThrow();
    });
  });

  describe('Queue Processing', () => {
    it('should process a message job', async () => {
      const messageData = {
        messageId: 'process-test-1',
        campaignId: 'campaign-3',
        contactId: 'contact-1',
        phoneNumber: '+9999999999',
        content: 'Processing test',
        mediaUrl: null,
      };

      const job = await enqueueMessage(messageData);

      // Wait for job to be processed
      const result = await job.finished();

      expect(result).toBeDefined();
      expect(result.messageId).toBe('process-test-1');
      expect(result.phoneNumber).toBe('+9999999999');
      expect(result.status).toBe('queued');
    });
  });
});
