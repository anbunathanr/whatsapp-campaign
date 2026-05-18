const mongoose = require('mongoose');

/**
 * Organization Model
 * Represents a tenant (company/business) that uses the platform.
 * All data (contacts, campaigns, messages) is scoped to an organization.
 */
const OrganizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended'],
      default: 'pending',
    },
    contactEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // The Super Admin who approved/created this org
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    suspendedAt: {
      type: Date,
    },
    suspendedReason: {
      type: String,
    },
    // Org-level Twilio credentials (override per-user settings)
    twilioAccountSid: { type: String, trim: true },
    twilioAuthToken: { type: String, trim: true },
    twilioWhatsappFrom: { type: String, trim: true },
  },
  { timestamps: true }
);

OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ slug: 1 });

module.exports = mongoose.model('Organization', OrganizationSchema);
