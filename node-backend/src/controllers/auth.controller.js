const jwt = require('jsonwebtoken');
const { sendSuccess, sendCreated, sendError } = require('../utils/apiResponse');
const { isValidEmail, validatePasswordStrength } = require('../utils/validators');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');

const VALID_ROLES = ['Admin', 'Campaign_Manager', 'Support_Staff'];

const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!email || !password || !firstName || !lastName) {
      return sendError(res, 'email, password, firstName, and lastName are required', 400);
    }

    if (!isValidEmail(email)) {
      return sendError(res, 'Invalid email format', 400);
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return sendError(res, passwordCheck.message, 400);
    }

    if (typeof firstName !== 'string' || firstName.trim().length === 0) {
      return sendError(res, 'firstName must be a non-empty string', 400);
    }

    if (typeof lastName !== 'string' || lastName.trim().length === 0) {
      return sendError(res, 'lastName must be a non-empty string', 400);
    }

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return sendError(res, `role must be one of: ${VALID_ROLES.join(', ')}`, 400);
    }

    // ── Duplicate email check ─────────────────────────────────────────────
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return sendError(res, 'Email already registered', 409);
    }

    // ── Create user (pre-save hook will hash passwordHash) ────────────────
    // If this is the very first user (bootstrap), force Super_Admin role
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;
    const assignedRole = isFirstUser ? 'Super_Admin' : 'Org_Admin';

    let organizationId = null;

    if (!isFirstUser) {
      const Organization = require('../models/Organization');
      const baseSlug = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      // Create a pending organization for them
      const org = new Organization({
        name: `${firstName} ${lastName}'s Organization`,
        slug: `${baseSlug}-${Date.now()}`,
        contactEmail: email.trim().toLowerCase(),
        status: 'pending' // They can't log in until approved
      });
      await org.save();
      organizationId = org._id;
    }

    const user = new User({
      email: email.trim().toLowerCase(),
      passwordHash: password, // pre-save hook hashes this
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: assignedRole,
      organization: organizationId
    });

    await user.save();

    // ── Generate JWT ──────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // ── Return 201 ────────────────────────────────────────────────────────
    return sendCreated(res, {
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    }, 'User registered successfully');
  } catch (err) {
    logger.error('register error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

/**
 * POST /api/auth/login
 *
 * Validates credentials, enforces account lockout after 5 failed attempts
 * within 15 minutes, generates a JWT on success, and updates lastLogin.
 *
 * Security requirement: generic error messages must NOT reveal whether the
 * email or the password was incorrect (Requirement 1 – Security Property).
 */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const GENERIC_AUTH_ERROR = 'Invalid credentials';

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!email || !password) {
      return sendError(res, 'email and password are required', 400);
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return sendError(res, 'email and password must be strings', 400);
    }

    // ── Look up user ──────────────────────────────────────────────────────
    // Use a generic error for both "user not found" and "wrong password"
    // to avoid leaking whether the email exists (Security Property).
    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      // Don't reveal that the email doesn't exist
      return sendError(res, GENERIC_AUTH_ERROR, 401);
    }

    // ── Account lockout check ─────────────────────────────────────────────
    if (user.isLocked()) {
      const remainingMs = user.accountLockedUntil - Date.now();
      const remainingMins = Math.ceil(remainingMs / 60000);
      return sendError(
        res,
        `Account is temporarily locked. Please try again in ${remainingMins} minute(s).`,
        423
      );
    }

    // ── Password verification ─────────────────────────────────────────────
    const passwordMatch = await user.comparePassword(password);

    if (!passwordMatch) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.accountLockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        logger.warn(
          `Account locked for ${user.email} after ${user.failedLoginAttempts} failed attempts`
        );
      }

      await user.save();

      // Generic error – do not reveal whether email or password was wrong
      return sendError(res, GENERIC_AUTH_ERROR, 401);
    }

    // ── Inactive account check ────────────────────────────────────────────
    if (!user.isActive) {
      return sendError(res, 'Account is disabled. Please contact an administrator.', 403);
    }

    // ── Successful login – reset lockout state ────────────────────────────
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    // ── Generate JWT ──────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, orgId: user.organization },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    logger.info(`User ${user.email} logged in successfully`);

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          lastLogin: user.lastLogin,
        },
      },
      'Login successful'
    );
  } catch (err) {
    logger.error('login error:', err);
    return sendError(res, 'An unexpected error occurred', 500);
  }
};

const logout = async (_req, res) => {
  return sendSuccess(res, null, 'Logged out successfully');
};

const refresh = async (_req, res) => {
  return sendError(res, 'Not implemented yet', 501);
};

const getMe = async (req, res) => {
  const user = req.user;
  return sendSuccess(res, {
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      lastLogin: user.lastLogin,
      isActive: user.isActive,
    },
  });
};

const updateProfile = async (_req, res) => {
  return sendError(res, 'Not implemented yet', 501);
};

const changePassword = async (_req, res) => {
  return sendError(res, 'Not implemented yet', 501);
};

const getCredentials = async (req, res) => {
  try {
    if (req.user.role === 'Super_Admin') {
      return sendError(res, 'Super_Admin does not have Twilio credentials', 400);
    }

    const org = await require('../models/Organization').findById(req.user.organization);
    if (!org) return sendError(res, 'Organization not found', 404);
    
    // Mask auth token for security
    const credentials = {
      twilioAccountSid: org.twilioAccountSid,
      twilioAuthToken: org.twilioAuthToken,
      twilioWhatsappFrom: org.twilioWhatsappFrom
    };
    
    const maskedAuthToken = credentials.twilioAuthToken ? 
      credentials.twilioAuthToken.substring(0, 4) + '...'.padEnd(credentials.twilioAuthToken.length - 8, '*') + credentials.twilioAuthToken.substring(credentials.twilioAuthToken.length - 4) : '';

    return sendSuccess(res, {
      twilioAccountSid: credentials.twilioAccountSid || '',
      twilioAuthToken: maskedAuthToken,
      twilioWhatsappFrom: credentials.twilioWhatsappFrom || '',
    });
  } catch (err) {
    logger.error('getCredentials error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

const updateCredentials = async (req, res) => {
  try {
    if (req.user.role === 'Super_Admin') {
      return sendError(res, 'Super_Admin cannot set Twilio credentials', 400);
    }
    
    // Only Org_Admin can update org credentials
    if (req.user.role !== 'Org_Admin') {
      return sendError(res, 'Only Organization Admins can update credentials', 403);
    }

    const { twilioAccountSid, twilioAuthToken, twilioWhatsappFrom } = req.body;
    
    const org = await require('../models/Organization').findById(req.user.organization);
    if (!org) return sendError(res, 'Organization not found', 404);

    if (twilioAccountSid !== undefined) org.twilioAccountSid = twilioAccountSid;
    if (twilioWhatsappFrom !== undefined) org.twilioWhatsappFrom = twilioWhatsappFrom;
    
    // Only update auth token if it's not the masked version
    if (twilioAuthToken !== undefined && !twilioAuthToken.includes('*')) {
      org.twilioAuthToken = twilioAuthToken;
    }

    await org.save();
    return sendSuccess(res, null, 'Credentials updated successfully');
  } catch (err) {
    logger.error('updateCredentials error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

module.exports = { register, login, logout, refresh, getMe, updateProfile, changePassword, getCredentials, updateCredentials };
