'use strict';

/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Defines the permission matrix for all three platform roles and exposes
 * middleware factories that enforce those permissions on API endpoints.
 *
 * Roles (from User model):
 *   - Admin           – full system access
 *   - Campaign_Manager – campaign, contact, template, analytics, workflow (no admin panel)
 *   - Support_Staff   – read-only access to contacts and campaigns
 *
 * Validates:
 *   - Requirement 1.5  : Role_Permission rules enforced for all API_Endpoint access
 *   - Requirement 1.6  : Three roles: Admin, Campaign_Manager, Support_Staff
 *   - Requirement 1.10 : 403 Forbidden for unauthorized access
 *   - Correctness Property 2: Role Permission Enforcement
 */

const { sendError } = require('../utils/apiResponse');

// ─── Permission Matrix ────────────────────────────────────────────────────────
//
// Each key is a logical "resource:action" permission string.
// Values are arrays of roles that hold that permission.
//
// Convention:
//   <resource>:read   – GET (list / single)
//   <resource>:write  – POST / PUT / PATCH
//   <resource>:delete – DELETE / archive
//   <resource>:admin  – privileged operations (bulk-delete, user management, etc.)

const PERMISSIONS = {
  // ── Authentication ────────────────────────────────────────────────────────
  // POST /api/auth/register – Admin only (creating new platform users)
  'auth:register': ['Admin'],
  // All other auth endpoints (login, logout, refresh, me, profile, password)
  // are either public or require only authentication (no role restriction).

  // ── Contacts ──────────────────────────────────────────────────────────────
  // GET /api/contacts, GET /api/contacts/:id – all authenticated roles
  'contacts:read': ['Admin', 'Campaign_Manager', 'Support_Staff'],
  // POST, PUT /api/contacts, POST /api/contacts/import, GET /api/contacts/export,
  // POST /api/contacts/bulk-tag – Admin and Campaign_Manager
  'contacts:write': ['Admin', 'Campaign_Manager'],
  // DELETE /api/contacts/:id – Admin and Campaign_Manager
  'contacts:delete': ['Admin', 'Campaign_Manager'],
  // POST /api/contacts/bulk-delete – Admin only (high-risk bulk operation)
  'contacts:bulk-delete': ['Admin'],

  // ── Segments ──────────────────────────────────────────────────────────────
  // GET /api/contacts/segments, GET /api/contacts/segments/:id – all authenticated
  'segments:read': ['Admin', 'Campaign_Manager', 'Support_Staff'],
  // POST, PUT /api/contacts/segments, POST /api/contacts/segments/:id – Admin and Campaign_Manager
  'segments:write': ['Admin', 'Campaign_Manager'],
  // DELETE /api/contacts/segments/:id – Admin and Campaign_Manager
  'segments:delete': ['Admin', 'Campaign_Manager'],

  // ── Campaigns ─────────────────────────────────────────────────────────────
  // GET /api/campaigns, GET /api/campaigns/:id,
  // GET /api/campaigns/:id/preview, GET /api/campaigns/:id/status – all authenticated
  'campaigns:read': ['Admin', 'Campaign_Manager', 'Support_Staff'],
  // POST, PUT /api/campaigns/:id, POST /api/campaigns/:id/clone,
  // POST /api/campaigns/:id/schedule, POST /api/campaigns/:id/cancel – Admin and Campaign_Manager
  'campaigns:write': ['Admin', 'Campaign_Manager'],
  // DELETE /api/campaigns/:id – Admin and Campaign_Manager
  'campaigns:delete': ['Admin', 'Campaign_Manager'],
  // POST /api/campaigns/:id/execute – Admin and Campaign_Manager
  'campaigns:execute': ['Admin', 'Campaign_Manager'],

  // ── Message Templates ─────────────────────────────────────────────────────
  // GET /api/templates, GET /api/templates/:id,
  // POST /api/templates/preview – all authenticated
  'templates:read': ['Admin', 'Campaign_Manager', 'Support_Staff'],
  // POST, PUT /api/templates/:id,
  // POST /api/templates/validate – Admin and Campaign_Manager
  'templates:write': ['Admin', 'Campaign_Manager'],
  // DELETE /api/templates/:id – Admin and Campaign_Manager
  'templates:delete': ['Admin', 'Campaign_Manager'],

  // ── Analytics ─────────────────────────────────────────────────────────────
  // GET /api/analytics/dashboard, GET /api/analytics/campaigns/:id,
  // GET /api/analytics/industry, GET /api/analytics/trends,
  // GET /api/analytics/engagement/:contactId – all authenticated
  'analytics:read': ['Admin', 'Campaign_Manager', 'Support_Staff'],
  // POST /api/analytics/reports – Admin and Campaign_Manager
  'analytics:write': ['Admin', 'Campaign_Manager'],

  // ── Workflows ─────────────────────────────────────────────────────────────
  // GET /api/workflows, GET /api/workflows/:id,
  // GET /api/workflows/:id/logs – all authenticated roles (read-only for Support_Staff)
  'workflows:read': ['Admin', 'Campaign_Manager', 'Support_Staff'],
  // POST, PUT /api/workflows/:id – Admin only
  'workflows:write': ['Admin'],
  // DELETE /api/workflows/:id – Admin only
  'workflows:delete': ['Admin'],
  // POST /api/workflows/:id/execute – Admin and Campaign_Manager
  'workflows:execute': ['Admin', 'Campaign_Manager'],

  // ── Admin Panel ───────────────────────────────────────────────────────────
  // GET /api/admin/users, GET /api/admin/audit-logs,
  // GET /api/admin/system-health – Admin only
  'admin:read': ['Admin'],
  // POST /api/admin/users, PUT /api/admin/users/:id – Admin only
  'admin:write': ['Admin'],
  // DELETE /api/admin/users/:id – Admin only
  'admin:delete': ['Admin'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check whether a role has a specific permission.
 *
 * @param {string} role       - One of 'Admin' | 'Campaign_Manager' | 'Support_Staff'
 * @param {string} permission - A key from the PERMISSIONS map (e.g. 'contacts:read')
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
  const allowed = PERMISSIONS[permission];
  if (!allowed) {return false;}
  return allowed.includes(role);
};

// ─── Middleware Factories ─────────────────────────────────────────────────────

/**
 * Middleware factory: require one or more specific permissions.
 *
 * The middleware passes when the authenticated user's role satisfies
 * AT LEAST ONE of the listed permissions (OR semantics).
 *
 * Usage:
 *   router.post('/contacts', authenticate, requirePermission('contacts:write'), handler)
 *
 * @param {...string} permissions - Permission strings from the PERMISSIONS map
 * @returns {Function} Express middleware
 */
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401);
    }

    const { role } = req.user;
    const granted = permissions.some((perm) => hasPermission(role, perm));

    if (!granted) {
      return sendError(
        res,
        `Forbidden: role '${role}' does not have permission for this action`,
        403
      );
    }

    return next();
  };
};

/**
 * Middleware factory: restrict access to specific roles (explicit allowlist).
 *
 * Prefer `requirePermission` for new code; use this when you need to gate
 * on a role directly rather than a logical permission.
 *
 * Usage:
 *   router.delete('/users/:id', authenticate, requireRole('Admin'), handler)
 *
 * @param {...string} roles - Allowed role names
 * @returns {Function} Express middleware
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401);
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `Forbidden: role '${req.user.role}' is not authorized for this resource`,
        403
      );
    }

    return next();
  };
};

/**
 * Middleware: allow only Admin role.
 * Convenience wrapper around requireRole('Admin').
 */
const adminOnly = requireRole('Admin');

module.exports = {
  PERMISSIONS,
  hasPermission,
  requirePermission,
  requireRole,
  adminOnly,
};
