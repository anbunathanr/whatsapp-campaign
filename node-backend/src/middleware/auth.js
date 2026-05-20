const jwt = require('jsonwebtoken');
const config = require('../config');
const { sendError } = require('../utils/apiResponse');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware: verify JWT token, fetch the full user from the database,
 * and attach the user document to req.user.
 *
 * Returns 401 if:
 *   - No / malformed Authorization header
 *   - Token signature is invalid
 *   - Token has expired
 *   - The user referenced by the token no longer exists in the database
 *   - The user account is deactivated (isActive: false)
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  logger.debug(`[Auth] ${req.method} ${req.originalUrl}`);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.debug('[Auth] Blocked — no Bearer token provided.');
    return sendError(res, 'No token provided', 401);
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Token expired', 401);
    }
    return sendError(res, 'Invalid token', 401);
  }

  try {
    const user = await User.findById(decoded.id)
      .select('-passwordHash')
      .populate('organization'); // populate to check status

    if (!user) {
      return sendError(res, 'User not found', 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Account is disabled', 401);
    }

    if (user.role !== 'Super_Admin') {
      if (!user.organization) {
        return sendError(res, 'User is not assigned to an organization', 401);
      }
      if (user.organization.status === 'suspended') {
        return sendError(res, 'Your organization has been suspended', 403);
      }
      if (user.organization.status === 'pending') {
        return sendError(res, 'Your organization is pending approval', 403);
      }
    }

    req.user = user;
    return next();
  } catch (err) {
    return sendError(res, 'Authentication error', 401);
  }
};

/**
 * Middleware: restrict access to specific roles.
 * Allows access if user has one of the required roles.
 * Supports legacy 'Admin' by mapping it to ['Super_Admin', 'Org_Admin'] implicitly.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401);
    }

    // Map 'Admin' to Super_Admin or Org_Admin for backward compatibility in routes
    const expandedRoles = roles.flatMap(r => r === 'Admin' ? ['Super_Admin', 'Org_Admin'] : [r]);

    if (!expandedRoles.includes(req.user.role)) {
      return sendError(res, 'Forbidden: insufficient permissions', 403);
    }

    return next();
  };
};

/**
 * Middleware: injects `req.orgFilter` to be used in database queries.
 * Super_Admin gets {} (all data), others get { organization: req.user.organization._id }
 */
const orgScope = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'Not authenticated', 401);
  }
  
  if (req.user.role === 'Super_Admin') {
    req.orgFilter = {};
  } else {
    req.orgFilter = { organization: req.user.organization._id };
  }
  
  return next();
};

module.exports = { authenticate, authorize, orgScope };
