const mongoose = require('mongoose');

/**
 * MessageTemplate Schema
 *
 * Stores reusable message templates with Dynamic_Variable placeholders.
 * Supports template validation, preview, and metadata tracking.
 *
 * Requirements: 4.3, 13.1–13.9
 */
const MessageTemplateSchema = new mongoose.Schema(
  {
    // Human-readable template name for identification in the UI
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // The raw template content containing {{variable}} placeholders (Req 13.1, 13.2)
    content: {
      type: String,
      required: true,
    },

    // Optional description to help users understand the template's purpose
    description: {
      type: String,
      trim: true,
    },

    // Campaign type this template is suited for (mirrors Campaign.type enum)
    category: {
      type: String,
      enum: ['promotional', 'reminder', 'festival', 'product_launch', 'follow_up', 'general'],
      default: 'general',
    },

    // Extracted list of {{variable_name}} placeholders found in content (Req 13.1)
    // Populated automatically by the template parser service before save
    variables: [
      {
        type: String,
        trim: true,
      },
    ],

    // Optional media attachment associated with this template (Req 4.4)
    mediaAttachment: {
      type: {
        type: String,
        enum: ['image', 'pdf', 'none'],
        default: 'none',
      },
      url: {
        type: String,
        trim: true,
      },
      filename: {
        type: String,
        trim: true,
      },
      // File size in bytes — enforced ≤ 5 MB at the service layer (Req 4.4)
      size: {
        type: Number,
        min: 0,
      },
    },

    // Whether this template is available for use in new campaigns
    isActive: {
      type: Boolean,
      default: true,
    },

    // Tracks how many campaigns have used this template (informational)
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // User who created the template
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // User who last modified the template (Req 15.11)
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// --- Indexes ---
// Support listing templates by creator and filtering by category/status (Req 11.6)
MessageTemplateSchema.index({ createdBy: 1 });
MessageTemplateSchema.index({ name: 1 });
MessageTemplateSchema.index({ category: 1 });
MessageTemplateSchema.index({ isActive: 1 });
MessageTemplateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MessageTemplate', MessageTemplateSchema);
