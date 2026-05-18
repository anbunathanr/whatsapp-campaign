const { sendSuccess, sendError } = require('../utils/apiResponse');
const { validateTemplate: parseSyntax, extractVariables } = require('../services/templateParser.service');
const logger = require('../utils/logger');

// Stub implementations — full logic will be added in Tasks 4.6+
const stub = (_req, res) => sendError(res, 'Not implemented yet', 501);

// ---------------------------------------------------------------------------
// Valid Contact field paths
//
// These are the field paths that a template variable can reference.
// Matches the Contact Mongoose schema (Task 3.1 / design.md).
//
// Top-level scalar fields:
//   name, phone, jobTitle, company, industry, source
// Array field (treated as a valid reference):
//   tags
// Nested location sub-document:
//   location, location.city, location.state, location.country
// Dynamic map — any customFields.* key is allowed:
//   customFields (prefix match)
//
// Templates may also use a "contact." prefix (e.g. {{contact.name}}) which
// mirrors the nested-path convention used in the rest of the platform.
// ---------------------------------------------------------------------------
const VALID_CONTACT_FIELDS = new Set([
  'name',
  'phone',
  'jobTitle',
  'company',
  'industry',
  'tags',
  'source',
  'location',
  'location.city',
  'location.state',
  'location.country',
  'customFields',
]);

/**
 * Determine whether a variable path extracted from a template is a valid
 * reference to a Contact field.
 *
 * Supports two conventions:
 *   1. Direct field reference:  {{name}}, {{location.city}}, {{customFields.myKey}}
 *   2. contact. prefix:         {{contact.name}}, {{contact.location.city}}
 *
 * @param {string} variablePath  e.g. "name", "contact.company", "customFields.foo"
 * @returns {boolean}
 */
const isValidContactField = (variablePath) => {
  // Strip optional leading "contact." prefix
  const path = variablePath.startsWith('contact.')
    ? variablePath.slice('contact.'.length)
    : variablePath;

  // Exact match
  if (VALID_CONTACT_FIELDS.has(path)) {
    return true;
  }

  // customFields.* — any sub-key of the customFields map is valid
  if (path.startsWith('customFields.') && path.length > 'customFields.'.length) {
    return true;
  }

  return false;
};

/**
 * POST /api/templates/validate
 *
 * Validates a message template string for:
 *   1. Syntax correctness (matching braces, valid variable name format)
 *   2. Semantic correctness (all variable references correspond to Contact fields)
 *
 * Request body:
 *   { "template": "<template string>" }
 *
 * Success response (200):
 *   {
 *     "success": true,
 *     "message": "Template is valid",
 *     "data": {
 *       "valid": true,
 *       "variables": ["name", "company", ...]
 *     }
 *   }
 *
 * Validation error response (422):
 *   {
 *     "success": false,
 *     "message": "Template validation failed",
 *     "errors": [
 *       { "type": "syntax",   "message": "...", "position": 6, "context": "..." },
 *       { "type": "reference","message": "...", "variable": "unknownField" }
 *     ]
 *   }
 *
 * Requires: Admin or Campaign_Manager role (enforced by router middleware).
 */
const validateTemplate = (req, res) => {
  try {
    const { template } = req.body;

    // ── 1. Input presence check ──────────────────────────────────────────────
    if (template === undefined || template === null) {
      return sendError(res, 'Request body must include a "template" field', 400);
    }

    if (typeof template !== 'string') {
      return sendError(res, '"template" must be a string', 400);
    }

    const allErrors = [];

    // ── 2. Syntax validation ─────────────────────────────────────────────────
    const syntaxResult = parseSyntax(template);
    if (!syntaxResult.valid) {
      for (const err of syntaxResult.errors) {
        allErrors.push({
          type: 'syntax',
          message: err.message,
          position: err.position,
          context: err.context,
        });
      }
    }

    // ── 3. Semantic / reference validation ───────────────────────────────────
    // Only run reference checks when syntax is valid (otherwise variable
    // extraction may be incomplete or misleading).
    let variables = [];
    if (syntaxResult.valid) {
      variables = extractVariables(template);

      for (const variable of variables) {
        if (!isValidContactField(variable)) {
          allErrors.push({
            type: 'reference',
            message:
              `Variable "{{${variable}}}" does not correspond to a valid Contact field. ` +
              `Valid fields are: name, phone, jobTitle, company, industry, tags, ` +
              `location, location.city, location.state, location.country, customFields, ` +
              `or any customFields.<key>. You may also prefix any field with "contact." ` +
              `(e.g. {{contact.name}}).`,
            variable,
          });
        }
      }
    }

    // ── 4. Return result ─────────────────────────────────────────────────────
    if (allErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Template validation failed',
        errors: allErrors,
      });
    }

    return sendSuccess(
      res,
      { valid: true, variables },
      'Template is valid'
    );
  } catch (err) {
    logger.error('validateTemplate controller error:', err);
    return sendError(res, 'Internal server error', 500);
  }
};

module.exports = {
  listTemplates: stub,
  createTemplate: stub,
  getTemplate: stub,
  updateTemplate: stub,
  deleteTemplate: stub,
  validateTemplate,
  previewTemplate: stub,
  // Exported for testing only
  isValidContactField,
};
