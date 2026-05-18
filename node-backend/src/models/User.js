const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const BCRYPT_COST_FACTOR = 10;

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['Super_Admin', 'Org_Admin', 'Campaign_Manager', 'Support_Staff'],
      required: true,
      default: 'Campaign_Manager',
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null, // null for Super_Admin
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    accountLockedUntil: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
    },
    // Invite token for email-based onboarding
    inviteToken: { type: String, default: null },
    inviteExpiry: { type: Date, default: null },
    inviteAccepted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
UserSchema.index({ role: 1 });

/**
 * Hash the password before saving when it has been modified.
 * Satisfies Requirement 1.3 and Correctness Property 1.
 */
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) {
    return next();
  }
  this.passwordHash = await bcrypt.hash(this.passwordHash, BCRYPT_COST_FACTOR);
  next();
});

/**
 * Compare a plaintext password against the stored hash.
 * @param {string} plaintext
 * @returns {Promise<boolean>}
 */
UserSchema.methods.comparePassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

/**
 * Check whether the account is currently locked.
 * @returns {boolean}
 */
UserSchema.methods.isLocked = function () {
  return this.accountLockedUntil && this.accountLockedUntil > new Date();
};

module.exports = mongoose.model('User', UserSchema);
