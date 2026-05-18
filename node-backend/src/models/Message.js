const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    messageContent: {
      type: String,
      required: true,
    },
    mediaUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed', 'replied'],
      default: 'queued',
    },
    // ID returned by WhatsApp / Twilio API after submission
    externalMessageId: {
      type: String,
    },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    failedAt: { type: Date },
    repliedAt: { type: Date },
    replyContent: { type: String },
    errorCode: { type: String },
    errorMessage: { type: String },
    retryCount: {
      type: Number,
      default: 0,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
  },
  { timestamps: true }
);

// Indexes — supports status queries, webhook lookups, and campaign progress (Req 11.6)
MessageSchema.index({ campaign: 1 });
MessageSchema.index({ contact: 1 });
MessageSchema.index({ status: 1 });
MessageSchema.index({ externalMessageId: 1 });
MessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
