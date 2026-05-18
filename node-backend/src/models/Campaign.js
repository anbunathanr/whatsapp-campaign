const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['promotional', 'reminder', 'festival', 'product_launch', 'follow_up'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'executing', 'completed', 'archived', 'cancelled'],
      default: 'draft',
    },
    targetSegment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Segment',
      required: true,
    },
    messageTemplate: {
      type: String,
      required: true,
    },
    mediaAttachment: {
      type: {
        type: String,
        enum: ['image', 'pdf', 'none'],
        default: 'none',
      },
      url: String,
      filename: String,
      size: Number,
    },
    scheduledAt: {
      type: Date,
    },
    executedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    estimatedRecipients: {
      type: Number,
      default: 0,
    },
    actualRecipients: {
      type: Number,
      default: 0,
    },
    // Delivery metrics — updated by webhook processing (Req 7.3, 8.1)
    messagesSent: { type: Number, default: 0 },
    messagesDelivered: { type: Number, default: 0 },
    messagesRead: { type: Number, default: 0 },
    messagesFailed: { type: Number, default: 0 },
    messagesReplied: { type: Number, default: 0 },
    errorMessage: { type: String },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    clonedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
    },
  },
  { timestamps: true }
);

// Indexes — supports scheduling, filtering, and performance requirements (Req 11.6)
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ scheduledAt: 1 });
CampaignSchema.index({ createdBy: 1 });
CampaignSchema.index({ type: 1 });
CampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Campaign', CampaignSchema);
