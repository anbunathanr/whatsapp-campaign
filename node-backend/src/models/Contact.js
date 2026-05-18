const mongoose = require('mongoose');

const INDUSTRY_VALUES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Retail',
  'Manufacturing',
  'Real Estate',
  'Hospitality',
  'Transportation',
  'Energy',
  'Agriculture',
  'Construction',
  'Media',
  'Telecommunications',
  'Automotive',
  'Aerospace',
  'Pharmaceuticals',
  'Food & Beverage',
  'Fashion',
  'Entertainment',
  'Legal',
  'Consulting',
  'Insurance',
  'Banking',
  'E-commerce',
  'Logistics',
  'Marketing',
  'Non-Profit',
  'Energy and Utilities',
  'Transportation and Logistics',
  'Aerospace and Defense',
  'Banking and Financial Services',
  'Biotechnology',
  'Other',
];

const ContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    jobTitle: {
      type: String,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      required: true,
      enum: INDUSTRY_VALUES,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    location: {
      city: String,
      state: String,
      country: String,
    },
    customFields: {
      type: Map,
      of: String,
    },
    source: {
      type: String,
      enum: ['manual', 'csv_import', 'excel_import', 'api'],
      default: 'manual',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
  },
  { timestamps: true }
);

// Phone is unique per organization (partial — only enforced when organization is an ObjectId, not null)
ContactSchema.index(
  { phone: 1, organization: 1 },
  { unique: true, partialFilterExpression: { organization: { $exists: true, $type: 'objectId' } } }
);
ContactSchema.index({ organization: 1 });
ContactSchema.index({ industry: 1 });
ContactSchema.index({ tags: 1 });
ContactSchema.index({ 'location.country': 1 });
ContactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Contact', ContactSchema);
module.exports.INDUSTRY_VALUES = INDUSTRY_VALUES;
