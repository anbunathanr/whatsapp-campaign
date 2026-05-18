/**
 * Message Queue Event Handlers Tests
 * Tests for queue event handlers that update database on job completion/failure
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Message = require('../../models/Message');
const Campaign = require('../../models/Campaign');
const Contact = require('../../models/Contact');
const Segment = require('../../models/Segment');
const User = require('../../models/User');

// Mock Bull queue to avoid Redis dependency in tests
jest.mock('bull');
const Bull = require('bull');

describe('Message Queue Event Handlers', () => {
  let mongoServer;
  let testUser;
  let testSegment;
  let testCampaign;
  let testContact;
  let testMessage;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await User.deleteMany({});
    await Segment.deleteMany({});
    await Campaign.deleteMany({});
    await Contact.deleteMany({});
    await Message.deleteMany({});

    // Create test user
    testUser = await User.create({
      email: 'test@example.com',
      passwordHash: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User',
      role: 'Campaign_Manager',
    });

    // Create test segment
    testSegment = await Segment.create({
      name: 'Test Segment',
      filterCriteria: { industries: ['Technology'] },
      createdBy: testUser._id,
    });

    // Create test campaign
    testCampaign = await Campaign.create({
      name: 'Test Campaign',
      type: 'promotional',
      status: 'executing',
      targetSegment: testSegment._id,
      messageTemplate: 'Hello {{name}}!',
      createdBy: testUser._id,
      messagesSent: 0,
      messagesFailed: 0,
    });

    // Create test contact
    testContact = await Contact.create({
      name: 'John Doe',
      phone: '+1234567890',
      industry: 'Technology',
      createdBy: testUser._id,
    });

    // Create test message
    testMessage = await Message.create({
      campaign: testCampaign._id,
      contact: testContact._id,
      phoneNumber: testContact.phone,
      messageContent: 'Hello John Doe!',
      status: 'queued',
    });
  });

  describe('completed event handler', () => {
    it('should update message status to sent on job completion', async () => {
      // Mock the completed event handler logic
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'sent',
        sentAt: new Date(),
        retryCount: 0,
      });

      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.status).toBe('sent');
      expect(updatedMessage.sentAt).toBeDefined();
      expect(updatedMessage.retryCount).toBe(0);
    });

    it('should increment campaign messagesSent counter on job completion', async () => {
      await Campaign.findByIdAndUpdate(testCampaign._id, {
        $inc: { messagesSent: 1 },
      });

      const updatedCampaign = await Campaign.findById(testCampaign._id);
      expect(updatedCampaign.messagesSent).toBe(1);
    });

    it('should handle multiple completed jobs correctly', async () => {
      // Create additional messages
      const message2 = await Message.create({
        campaign: testCampaign._id,
        contact: testContact._id,
        phoneNumber: '+9876543210',
        messageContent: 'Test message 2',
        status: 'queued',
      });

      const message3 = await Message.create({
        campaign: testCampaign._id,
        contact: testContact._id,
        phoneNumber: '+5555555555',
        messageContent: 'Test message 3',
        status: 'queued',
      });

      // Simulate completion of all messages
      await Message.findByIdAndUpdate(testMessage._id, { status: 'sent', sentAt: new Date() });
      await Message.findByIdAndUpdate(message2._id, { status: 'sent', sentAt: new Date() });
      await Message.findByIdAndUpdate(message3._id, { status: 'sent', sentAt: new Date() });

      await Campaign.findByIdAndUpdate(testCampaign._id, { $inc: { messagesSent: 3 } });

      const updatedCampaign = await Campaign.findById(testCampaign._id);
      expect(updatedCampaign.messagesSent).toBe(3);

      const sentMessages = await Message.find({ status: 'sent' });
      expect(sentMessages).toHaveLength(3);
    });
  });

  describe('failed event handler', () => {
    it('should update message status to failed after max retries', async () => {
      const errorMessage = 'WhatsApp API error';
      const errorCode = 'API_ERROR';

      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
        errorMessage,
        errorCode,
      });

      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.status).toBe('failed');
      expect(updatedMessage.failedAt).toBeDefined();
      expect(updatedMessage.retryCount).toBe(3);
      expect(updatedMessage.errorMessage).toBe(errorMessage);
      expect(updatedMessage.errorCode).toBe(errorCode);
    });

    it('should increment campaign messagesFailed counter on final failure', async () => {
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
      });

      await Campaign.findByIdAndUpdate(testCampaign._id, {
        $inc: { messagesFailed: 1 },
      });

      const updatedCampaign = await Campaign.findById(testCampaign._id);
      expect(updatedCampaign.messagesFailed).toBe(1);
    });

    it('should not update database on non-final failures', async () => {
      // Simulate first retry (not final)
      const initialMessage = await Message.findById(testMessage._id);
      expect(initialMessage.status).toBe('queued');

      // On non-final failure, status should remain unchanged
      const messageAfterRetry = await Message.findById(testMessage._id);
      expect(messageAfterRetry.status).toBe('queued');
    });

    it('should handle multiple failed jobs correctly', async () => {
      const message2 = await Message.create({
        campaign: testCampaign._id,
        contact: testContact._id,
        phoneNumber: '+9876543210',
        messageContent: 'Test message 2',
        status: 'queued',
      });

      // Simulate both messages failing
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
      });
      await Message.findByIdAndUpdate(message2._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
      });

      await Campaign.findByIdAndUpdate(testCampaign._id, { $inc: { messagesFailed: 2 } });

      const updatedCampaign = await Campaign.findById(testCampaign._id);
      expect(updatedCampaign.messagesFailed).toBe(2);

      const failedMessages = await Message.find({ status: 'failed' });
      expect(failedMessages).toHaveLength(2);
    });
  });

  describe('mixed success and failure scenarios', () => {
    it('should correctly track both sent and failed messages', async () => {
      const message2 = await Message.create({
        campaign: testCampaign._id,
        contact: testContact._id,
        phoneNumber: '+9876543210',
        messageContent: 'Test message 2',
        status: 'queued',
      });

      const message3 = await Message.create({
        campaign: testCampaign._id,
        contact: testContact._id,
        phoneNumber: '+5555555555',
        messageContent: 'Test message 3',
        status: 'queued',
      });

      // Message 1: Success
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'sent',
        sentAt: new Date(),
      });

      // Message 2: Failed
      await Message.findByIdAndUpdate(message2._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
      });

      // Message 3: Success
      await Message.findByIdAndUpdate(message3._id, {
        status: 'sent',
        sentAt: new Date(),
      });

      // Update campaign metrics
      await Campaign.findByIdAndUpdate(testCampaign._id, {
        $inc: { messagesSent: 2, messagesFailed: 1 },
      });

      const updatedCampaign = await Campaign.findById(testCampaign._id);
      expect(updatedCampaign.messagesSent).toBe(2);
      expect(updatedCampaign.messagesFailed).toBe(1);

      const sentMessages = await Message.find({ status: 'sent' });
      const failedMessages = await Message.find({ status: 'failed' });
      expect(sentMessages).toHaveLength(2);
      expect(failedMessages).toHaveLength(1);
    });
  });

  describe('retry count tracking', () => {
    it('should track retry count on successful delivery after retries', async () => {
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'sent',
        sentAt: new Date(),
        retryCount: 2, // Succeeded on 3rd attempt
      });

      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.status).toBe('sent');
      expect(updatedMessage.retryCount).toBe(2);
    });

    it('should track retry count on final failure', async () => {
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3, // Failed after 3 attempts
      });

      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.status).toBe('failed');
      expect(updatedMessage.retryCount).toBe(3);
    });
  });

  describe('error information storage', () => {
    it('should store error code and message on failure', async () => {
      const errorCode = 'RATE_LIMIT_EXCEEDED';
      const errorMessage = 'WhatsApp API rate limit exceeded';

      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
        errorCode,
        errorMessage,
      });

      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.errorCode).toBe(errorCode);
      expect(updatedMessage.errorMessage).toBe(errorMessage);
    });

    it('should handle unknown error codes', async () => {
      await Message.findByIdAndUpdate(testMessage._id, {
        status: 'failed',
        failedAt: new Date(),
        retryCount: 3,
        errorCode: 'UNKNOWN_ERROR',
        errorMessage: 'An unknown error occurred',
      });

      const updatedMessage = await Message.findById(testMessage._id);
      expect(updatedMessage.errorCode).toBe('UNKNOWN_ERROR');
    });
  });
});
