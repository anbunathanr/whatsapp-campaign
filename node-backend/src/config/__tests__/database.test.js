'use strict';

const mongoose = require('mongoose');
const { connectDB, disconnectDB, ensureIndexes, getConnectionStatus } = require('../database');
const config = require('../index');

// Mock logger to avoid console output during tests
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Database Connection and Index Creation', () => {
  beforeAll(async () => {
    // Connect to test database
    await connectDB();
  });

  afterAll(async () => {
    // Clean up and disconnect
    await disconnectDB();
  });

  describe('Connection Status', () => {
    it('should be connected to MongoDB', () => {
      const status = getConnectionStatus();
      expect(status.isConnected).toBe(true);
      expect(status.readyState).toBe(1);
    });
  });

  describe('Index Creation', () => {
    it('should create indexes for User model', async () => {
      const User = require('../../models/User');
      const indexes = await User.collection.getIndexes();
      
      // Check for email index
      expect(indexes).toHaveProperty('email_1');
      
      // Check for role index
      expect(indexes).toHaveProperty('role_1');
    });

    it('should create indexes for Contact model', async () => {
      const Contact = require('../../models/Contact');
      const indexes = await Contact.collection.getIndexes();
      
      // Check for phone index (unique)
      expect(indexes).toHaveProperty('phone_1');
      
      // Check for industry index
      expect(indexes).toHaveProperty('industry_1');
      
      // Check for tags index
      expect(indexes).toHaveProperty('tags_1');
      
      // Check for location.country index
      expect(indexes).toHaveProperty('location.country_1');
      
      // Check for createdAt index (descending)
      expect(indexes).toHaveProperty('createdAt_-1');
    });

    it('should create indexes for Segment model', async () => {
      const Segment = require('../../models/Segment');
      const indexes = await Segment.collection.getIndexes();
      
      // Check for createdBy index
      expect(indexes).toHaveProperty('createdBy_1');
      
      // Check for name index
      expect(indexes).toHaveProperty('name_1');
    });

    it('should create indexes for Campaign model', async () => {
      const Campaign = require('../../models/Campaign');
      const indexes = await Campaign.collection.getIndexes();
      
      // Check for status index
      expect(indexes).toHaveProperty('status_1');
      
      // Check for scheduledAt index
      expect(indexes).toHaveProperty('scheduledAt_1');
      
      // Check for createdBy index
      expect(indexes).toHaveProperty('createdBy_1');
      
      // Check for type index
      expect(indexes).toHaveProperty('type_1');
      
      // Check for createdAt index (descending)
      expect(indexes).toHaveProperty('createdAt_-1');
    });

    it('should create indexes for Message model', async () => {
      const Message = require('../../models/Message');
      const indexes = await Message.collection.getIndexes();
      
      // Check for campaign index
      expect(indexes).toHaveProperty('campaign_1');
      
      // Check for contact index
      expect(indexes).toHaveProperty('contact_1');
      
      // Check for status index
      expect(indexes).toHaveProperty('status_1');
      
      // Check for externalMessageId index
      expect(indexes).toHaveProperty('externalMessageId_1');
      
      // Check for createdAt index (descending)
      expect(indexes).toHaveProperty('createdAt_-1');
    });

    it('should create indexes for WebhookEvent model', async () => {
      const WebhookEvent = require('../../models/WebhookEvent');
      const indexes = await WebhookEvent.collection.getIndexes();
      
      // Check for externalMessageId index
      expect(indexes).toHaveProperty('externalMessageId_1');
      
      // Check for processed index
      expect(indexes).toHaveProperty('processed_1');
      
      // Check for receivedAt index (descending)
      expect(indexes).toHaveProperty('receivedAt_-1');
    });

    it('should create indexes for Workflow model', async () => {
      const Workflow = require('../../models/Workflow');
      const indexes = await Workflow.collection.getIndexes();
      
      // Check for isActive index
      expect(indexes).toHaveProperty('isActive_1');
      
      // Check for triggerType index
      expect(indexes).toHaveProperty('triggerType_1');
      
      // Check for createdBy index
      expect(indexes).toHaveProperty('createdBy_1');
    });

    it('should create indexes for AuditLog model', async () => {
      const AuditLog = require('../../models/AuditLog');
      const indexes = await AuditLog.collection.getIndexes();
      
      // Check for user index
      expect(indexes).toHaveProperty('user_1');
      
      // Check for action index
      expect(indexes).toHaveProperty('action_1');
      
      // Check for compound index (resourceType + resourceId)
      expect(indexes).toHaveProperty('resourceType_1_resourceId_1');
      
      // Check for timestamp index (descending)
      expect(indexes).toHaveProperty('timestamp_-1');
    });

    it('should verify unique indexes are properly configured', async () => {
      const User = require('../../models/User');
      const Contact = require('../../models/Contact');
      
      const userIndexes = await User.collection.getIndexes();
      const contactIndexes = await Contact.collection.getIndexes();
      
      // Verify email is unique in User model
      expect(userIndexes.email_1.unique).toBe(true);
      
      // Verify phone is unique in Contact model
      expect(contactIndexes.phone_1.unique).toBe(true);
    });
  });

  describe('Index Performance', () => {
    it('should use indexes for common queries', async () => {
      const Contact = require('../../models/Contact');
      
      // Create a sample contact for testing
      const testContact = await Contact.create({
        name: 'Test User',
        phone: '+1234567890',
        industry: 'Technology',
        tags: ['test'],
        location: { country: 'USA' },
      });

      // Query by industry (should use index)
      const explainResult = await Contact.find({ industry: 'Technology' }).explain('executionStats');
      
      // Check if index was used
      expect(explainResult.executionStats.executionStages.inputStage.stage).toBe('IXSCAN');
      expect(explainResult.executionStats.executionStages.inputStage.indexName).toBe('industry_1');

      // Clean up
      await Contact.deleteOne({ _id: testContact._id });
    });
  });
});
