const mongoose = require('mongoose');

const WorkflowSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Optional — only required when integrating with n8n.
    // Pure keyword auto-replies do not need an n8n workflow.
    n8nWorkflowId: {
      type: String,
      default: null,
    },
    triggerType: {
      type: String,
      enum: ['manual', 'scheduled', 'event', 'keyword'],
      required: true,
    },
    triggerConfig: {
      schedule: String,     // cron expression for scheduled triggers
      event: String,        // event name for event triggers
      keyword: String,      // keyword for auto-response triggers
      autoResponse: String, // direct reply text (no n8n needed)
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastExecutedAt: {
      type: Date,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
WorkflowSchema.index({ isActive: 1 });
WorkflowSchema.index({ triggerType: 1 });
WorkflowSchema.index({ createdBy: 1 });
WorkflowSchema.index({ organization: 1, isActive: 1 });

module.exports = mongoose.model('Workflow', WorkflowSchema);
