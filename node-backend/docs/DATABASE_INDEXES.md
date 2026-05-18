# Database Indexes Documentation

## Overview

This document describes the database indexes implemented for the WhatsApp Campaign Automation Platform. All indexes are defined in the Mongoose schemas and are automatically created when the application starts through the `ensureIndexes()` function in `src/config/database.js`.

## Index Creation Process

### Automatic Index Creation

When the application starts, the database connection module (`src/config/database.js`) calls the `ensureIndexes()` function, which:

1. Loads all Mongoose models
2. Calls `syncIndexes()` on each model
3. Creates or updates indexes in MongoDB based on the schema definitions
4. Logs successful index creation

```javascript
const ensureIndexes = async () => {
  const models = [
    require('../models/User'),
    require('../models/Contact'),
    require('../models/Campaign'),
    require('../models/Message'),
    require('../models/MessageTemplate'),
    require('../models/Segment'),
    require('../models/WebhookEvent'),
    require('../models/Workflow'),
    require('../models/AuditLog'),
  ];

  await Promise.all(models.map((Model) => Model.syncIndexes()));
  logger.info('MongoDB indexes ensured for all models');
};
```

### Index Definitions by Model

## 1. User Model (`src/models/User.js`)

**Purpose**: Optimize user authentication and role-based queries

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `email_1` | email (ASC) | Unique | Fast user lookup by email, enforce uniqueness |
| `role_1` | role (ASC) | Regular | Filter users by role (Admin, Campaign_Manager, Support_Staff) |

**Validates Requirements**: 1.1, 1.5, 1.6

**Schema Definition**:
```javascript
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
```

**Note**: The `email` field also has `unique: true` in the schema definition, which automatically creates a unique index.

---

## 2. Contact Model (`src/models/Contact.js`)

**Purpose**: Optimize contact filtering, segmentation, and duplicate prevention

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `phone_1` | phone (ASC) | Unique | Fast contact lookup by phone, enforce uniqueness |
| `industry_1` | industry (ASC) | Regular | Filter contacts by industry classification |
| `tags_1` | tags (ASC) | Regular | Filter contacts by tags (array index) |
| `location.country_1` | location.country (ASC) | Regular | Filter contacts by country |
| `createdAt_-1` | createdAt (DESC) | Regular | Sort contacts by creation date (newest first) |

**Validates Requirements**: 3.3, 3.6, 3.9, 11.6

**Schema Definition**:
```javascript
ContactSchema.index({ phone: 1 });
ContactSchema.index({ industry: 1 });
ContactSchema.index({ tags: 1 });
ContactSchema.index({ 'location.country': 1 });
ContactSchema.index({ createdAt: -1 });
```

**Note**: The `phone` field also has `unique: true` in the schema definition.

---

## 3. Segment Model (`src/models/Segment.js`)

**Purpose**: Optimize segment queries and user-specific segment listings

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `createdBy_1` | createdBy (ASC) | Regular | List segments created by a specific user |
| `name_1` | name (ASC) | Regular | Search segments by name |

**Validates Requirements**: 3.6

**Schema Definition**:
```javascript
SegmentSchema.index({ createdBy: 1 });
SegmentSchema.index({ name: 1 });
```

---

## 4. Campaign Model (`src/models/Campaign.js`)

**Purpose**: Optimize campaign scheduling, filtering, and performance queries

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `status_1` | status (ASC) | Regular | Filter campaigns by status (draft, scheduled, executing, completed, archived) |
| `scheduledAt_1` | scheduledAt (ASC) | Regular | Find campaigns scheduled for execution |
| `createdBy_1` | createdBy (ASC) | Regular | List campaigns created by a specific user |
| `type_1` | type (ASC) | Regular | Filter campaigns by type (promotional, reminder, festival, etc.) |
| `createdAt_-1` | createdAt (DESC) | Regular | Sort campaigns by creation date (newest first) |

**Validates Requirements**: 4.7, 6.1, 11.6

**Schema Definition**:
```javascript
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ scheduledAt: 1 });
CampaignSchema.index({ createdBy: 1 });
CampaignSchema.index({ type: 1 });
CampaignSchema.index({ createdAt: -1 });
```

---

## 5. Message Model (`src/models/Message.js`)

**Purpose**: Optimize message delivery tracking and campaign progress queries

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `campaign_1` | campaign (ASC) | Regular | Get all messages for a specific campaign |
| `contact_1` | contact (ASC) | Regular | Get all messages sent to a specific contact |
| `status_1` | status (ASC) | Regular | Filter messages by delivery status |
| `externalMessageId_1` | externalMessageId (ASC) | Regular | Fast lookup for webhook processing |
| `createdAt_-1` | createdAt (DESC) | Regular | Sort messages by creation date (newest first) |

**Validates Requirements**: 5.9, 7.3, 11.6

**Schema Definition**:
```javascript
MessageSchema.index({ campaign: 1 });
MessageSchema.index({ contact: 1 });
MessageSchema.index({ status: 1 });
MessageSchema.index({ externalMessageId: 1 });
MessageSchema.index({ createdAt: -1 });
```

---

## 6. WebhookEvent Model (`src/models/WebhookEvent.js`)

**Purpose**: Optimize webhook event processing and audit queries

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `externalMessageId_1` | externalMessageId (ASC) | Regular | Link webhook events to messages |
| `processed_1` | processed (ASC) | Regular | Find unprocessed webhook events |
| `receivedAt_-1` | receivedAt (DESC) | Regular | Sort events by receipt time (newest first) |

**Validates Requirements**: 7.10, 7.11

**Schema Definition**:
```javascript
WebhookEventSchema.index({ externalMessageId: 1 });
WebhookEventSchema.index({ processed: 1 });
WebhookEventSchema.index({ receivedAt: -1 });
```

---

## 7. Workflow Model (`src/models/Workflow.js`)

**Purpose**: Optimize workflow queries and trigger event processing

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `isActive_1` | isActive (ASC) | Regular | Find active workflows for execution |
| `triggerType_1` | triggerType (ASC) | Regular | Filter workflows by trigger type |
| `createdBy_1` | createdBy (ASC) | Regular | List workflows created by a specific user |

**Validates Requirements**: 6.6

**Schema Definition**:
```javascript
WorkflowSchema.index({ isActive: 1 });
WorkflowSchema.index({ triggerType: 1 });
WorkflowSchema.index({ createdBy: 1 });
```

---

## 8. AuditLog Model (`src/models/AuditLog.js`)

**Purpose**: Optimize audit log queries and compliance reporting

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `user_1` | user (ASC) | Regular | Find all actions by a specific user |
| `action_1` | action (ASC) | Regular | Filter audit logs by action type |
| `resourceType_1_resourceId_1` | resourceType (ASC), resourceId (ASC) | Compound | Find all actions on a specific resource |
| `timestamp_-1` | timestamp (DESC) | Regular | Sort audit logs by time (newest first) |

**Validates Requirements**: 9.3, 10.11

**Schema Definition**:
```javascript
AuditLogSchema.index({ user: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1 });
AuditLogSchema.index({ timestamp: -1 });
```

---

## Performance Considerations

### Index Benefits

1. **Query Performance**: Indexes significantly improve query performance for filtered and sorted operations
2. **Uniqueness Enforcement**: Unique indexes prevent duplicate data (email, phone)
3. **Compound Indexes**: The `resourceType_1_resourceId_1` compound index optimizes queries that filter by both fields
4. **Descending Indexes**: Descending indexes (`createdAt_-1`, `timestamp_-1`) optimize "newest first" queries

### Index Overhead

1. **Write Performance**: Indexes add overhead to write operations (insert, update, delete)
2. **Storage**: Indexes consume additional disk space
3. **Memory**: Indexes are loaded into memory for optimal performance

### Best Practices

1. **Selective Indexing**: Only index fields that are frequently queried or used for sorting
2. **Index Monitoring**: Monitor index usage with MongoDB's `explain()` command
3. **Index Maintenance**: Periodically review and remove unused indexes
4. **Background Creation**: Indexes are created in the background to avoid blocking operations

---

## Verification

### Manual Verification

To verify that indexes are created, you can use the MongoDB shell:

```javascript
// Connect to MongoDB
use whatsapp_campaign_db

// List indexes for a collection
db.users.getIndexes()
db.contacts.getIndexes()
db.campaigns.getIndexes()
// ... etc
```

### Programmatic Verification

The application logs index creation on startup:

```
[INFO] MongoDB connected successfully
[INFO] MongoDB indexes ensured for all models
```

### Index Usage Analysis

To verify that indexes are being used for queries:

```javascript
// In MongoDB shell
db.contacts.find({ industry: 'Technology' }).explain('executionStats')

// Look for:
// - executionStages.inputStage.stage: "IXSCAN" (index scan)
// - executionStages.inputStage.indexName: "industry_1"
```

---

## Troubleshooting

### Index Creation Failures

If index creation fails, check the logs for error messages:

```
[ERROR] MongoDB connection failed: An existing index has the same name as the requested index
```

**Solution**: This usually means an index with a different definition already exists. Drop the old index and restart the application:

```javascript
// In MongoDB shell
db.users.dropIndex('email_1')
```

### Performance Issues

If queries are slow despite indexes:

1. Check if the index is being used with `explain()`
2. Verify the index covers the query fields
3. Consider adding compound indexes for multi-field queries
4. Monitor index size and memory usage

---

## Maintenance

### Index Rebuild

To rebuild all indexes (useful after data corruption or migration):

```javascript
// In MongoDB shell
db.users.reIndex()
db.contacts.reIndex()
// ... etc
```

### Index Statistics

To view index statistics:

```javascript
// In MongoDB shell
db.contacts.stats().indexSizes
```

---

## Compliance

These indexes satisfy the following requirements from the design document:

- **Requirement 11.6**: Database indexing on frequently queried fields
- **Performance Property**: Contact list queries with filters complete in under 2 seconds for databases up to 100,000 contacts
- **Scalability Property**: Support contact databases containing up to 500,000 records

---

## Summary

All required database indexes are defined in the Mongoose schemas and are automatically created when the application starts. The indexes optimize query performance for:

- User authentication and role-based access control
- Contact filtering and segmentation
- Campaign scheduling and execution
- Message delivery tracking
- Webhook event processing
- Workflow automation
- Audit logging and compliance

The implementation follows MongoDB best practices and satisfies all performance requirements specified in the design document.
