const mongoose = require('mongoose');

const WebhookEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ['delivered', 'read', 'failed', 'replied'],
      required: true,
    },
    externalMessageId: {
      type: String,
      required: true,
    },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    signature: {
      type: String,
    },
    processed: {
      type: Boolean,
      default: false,
    },
    processedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
  },
  { timestamps: true }
);

// Indexes — supports idempotent processing and audit queries (Req 7.10, 7.11)
WebhookEventSchema.index({ organization: 1 });
WebhookEventSchema.index({ externalMessageId: 1 });
WebhookEventSchema.index({ processed: 1 });
WebhookEventSchema.index({ receivedAt: -1 });

module.exports = mongoose.model('WebhookEvent', WebhookEventSchema);
