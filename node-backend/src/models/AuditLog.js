const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'login',
  'logout',
  'user_created',
  'user_updated',
  'user_deleted',
  'contact_created',
  'contact_updated',
  'contact_deleted',
  'contact_imported',
  'campaign_created',
  'campaign_updated',
  'campaign_deleted',
  'campaign_executed',
  'segment_created',
  'segment_updated',
  'segment_deleted',
  'workflow_created',
  'workflow_updated',
  'workflow_deleted',
  'workflow_executed',
];

const AuditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    action: {
      type: String,
      required: true,
      enum: AUDIT_ACTIONS,
    },
    resourceType: {
      type: String,
      enum: ['User', 'Contact', 'Campaign', 'Segment', 'Workflow', 'System'],
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      // Null for system-level actions (e.g. org creation)
      default: null,
    },
  },
  { timestamps: false }
);

// Indexes — supports audit log queries and filtering (Req 9.3, 10.11)
AuditLogSchema.index({ organization: 1 });
AuditLogSchema.index({ user: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1 });
AuditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
