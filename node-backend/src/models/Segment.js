const mongoose = require('mongoose');

const SegmentSchema = new mongoose.Schema(
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
    filterCriteria: {
      industries: [String],
      tags: [String],
      locations: [
        {
          city: String,
          state: String,
          country: String,
        },
      ],
      customFilters: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
      },
    },
    contactCount: {
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
      required: true,
    },
  },
  { timestamps: true }
);

// Indexes
SegmentSchema.index({ organization: 1 });
SegmentSchema.index({ createdBy: 1 });
SegmentSchema.index({ name: 1 });

module.exports = mongoose.model('Segment', SegmentSchema);
