'use strict';

/**
 * Tests for POST /api/templates/validate endpoint (Task 4.7)
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 4.3
 *
 * Tests:
 *   - Returns 200 with valid=true and variables list for a valid template
 *   - Returns 422 with syntax errors for malformed templates
 *   - Returns 422 with reference errors for unknown Contact field variables
 *   - Returns 200 for all valid Contact field references (direct and contact. prefix)
 *   - Returns 400 for missing or non-string template body
 *   - Supports nested expressions like {{contact.company.name}} — but only valid Contact paths
 *   - customFields.* sub-keys are accepted
 *
 * Tests the controller directly (unit-style) without HTTP server overhead.
 */

const {
  validateTemplate,
  isValidContactField,
} = require('../../controllers/template.controller');

// ---------------------------------------------------------------------------
// Minimal Express-like mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Express request object.
 * @param {object} body
 * @returns {{ body: object }}
 */
const mockReq = (body = {}) => ({ body });

/**
 * Build a mock Express response object that captures the last call.
 * @returns {{ status: Function, json: Function, _status: number|null, _body: *|null }}
 */
const mockRes = () => {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
};

// ---------------------------------------------------------------------------
// Helper: call the controller and return { status, body }
// ---------------------------------------------------------------------------
const callValidate = (templateValue) => {
  const req = mockReq({ template: templateValue });
  const res = mockRes();
  validateTemplate(req, res);
  return { status: res._status, body: res._body };
};

// ---------------------------------------------------------------------------
// 1. Valid templates — syntax + semantics
// ---------------------------------------------------------------------------

describe('POST /api/templates/validate — valid templates', () => {
  test('accepts a template with no placeholders', () => {
    const { status, body } = callValidate('Hello there, welcome!');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
    expect(body.data.variables).toEqual([]);
  });

  test('accepts {{name}} — valid Contact field', () => {
    const { status, body } = callValidate('Hi {{name}}!');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
    expect(body.data.variables).toContain('name');
  });

  test('accepts {{phone}} — valid Contact field', () => {
    const { status, body } = callValidate('Your number: {{phone}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{jobTitle}} — valid Contact field', () => {
    const { status, body } = callValidate('Role: {{jobTitle}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{company}} — valid Contact field', () => {
    const { status, body } = callValidate('Company: {{company}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{industry}} — valid Contact field', () => {
    const { status, body } = callValidate('Industry: {{industry}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{tags}} — valid Contact field', () => {
    const { status, body } = callValidate('Tags: {{tags}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{location}} — valid Contact field', () => {
    const { status, body } = callValidate('Location: {{location}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{location.city}} — valid nested Contact field', () => {
    const { status, body } = callValidate('City: {{location.city}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{location.state}} — valid nested Contact field', () => {
    const { status, body } = callValidate('State: {{location.state}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{location.country}} — valid nested Contact field', () => {
    const { status, body } = callValidate('Country: {{location.country}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{customFields}} — valid Contact field', () => {
    const { status, body } = callValidate('Custom: {{customFields}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{customFields.myKey}} — valid customFields sub-key', () => {
    const { status, body } = callValidate('Value: {{customFields.myKey}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{customFields.any_key_123}} — valid customFields sub-key', () => {
    const { status, body } = callValidate('Value: {{customFields.any_key_123}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{contact.name}} — contact. prefix convention', () => {
    const { status, body } = callValidate('Hi {{contact.name}}!');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{contact.company}} — contact. prefix convention', () => {
    const { status, body } = callValidate('Company: {{contact.company}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{contact.location.city}} — contact. prefix with nested field', () => {
    const { status, body } = callValidate('City: {{contact.location.city}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts {{contact.customFields.foo}} — contact. prefix with customFields sub-key', () => {
    const { status, body } = callValidate('Custom: {{contact.customFields.foo}}');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
  });

  test('accepts a template with multiple valid Contact field references', () => {
    const { status, body } = callValidate(
      'Hi {{name}}, your role is {{jobTitle}} at {{company}} in {{location.city}}.'
    );
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
    expect(body.data.variables).toHaveLength(4);
  });

  test('returns the list of found variables in the response', () => {
    const { status, body } = callValidate('{{name}} — {{company}}');
    expect(status).toBe(200);
    expect(body.data.variables).toContain('name');
    expect(body.data.variables).toContain('company');
  });
});

// ---------------------------------------------------------------------------
// 2. Syntax errors
// ---------------------------------------------------------------------------

describe('POST /api/templates/validate — syntax errors', () => {
  test('returns 422 for unmatched {{ (missing closing }})', () => {
    const { status, body } = callValidate('Hello {{name');
    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  test('syntax error has type "syntax"', () => {
    const { status, body } = callValidate('Hello {{name');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('syntax');
  });

  test('syntax error includes message, position, and context', () => {
    const { status, body } = callValidate('Hello {{name');
    expect(status).toBe(422);
    const err = body.errors[0];
    expect(err).toHaveProperty('message');
    expect(err).toHaveProperty('position');
    expect(err).toHaveProperty('context');
  });

  test('returns 422 for unmatched }} (missing opening {{)', () => {
    const { status, body } = callValidate('Hello name}}');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('syntax');
  });

  test('returns 422 for empty placeholder {{}}', () => {
    const { status, body } = callValidate('Hello {{}}!');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('syntax');
    expect(body.errors[0].message).toMatch(/empty/i);
  });

  test('returns 422 for invalid variable name with special characters', () => {
    const { status, body } = callValidate('Hello {{name!}}');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('syntax');
  });

  test('returns 422 for triple brace {{{name}}}', () => {
    const { status, body } = callValidate('{{{name}}}');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('syntax');
  });

  test('reports multiple syntax errors in one response', () => {
    const { status, body } = callValidate('{{}} and {{name');
    expect(status).toBe(422);
    expect(body.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Reference errors — undefined Contact field variables
// ---------------------------------------------------------------------------

describe('POST /api/templates/validate — reference errors', () => {
  test('returns 422 for {{unknownField}} — not a Contact field', () => {
    const { status, body } = callValidate('Hello {{unknownField}}!');
    expect(status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  test('reference error has type "reference"', () => {
    const { status, body } = callValidate('Hello {{unknownField}}!');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('reference');
  });

  test('reference error includes the offending variable name', () => {
    const { status, body } = callValidate('Hello {{unknownField}}!');
    expect(status).toBe(422);
    expect(body.errors[0].variable).toBe('unknownField');
  });

  test('reference error message mentions valid Contact fields', () => {
    const { status, body } = callValidate('Hello {{unknownField}}!');
    expect(status).toBe(422);
    expect(body.errors[0].message).toMatch(/name|jobTitle|company/i);
  });

  test('returns 422 for {{contact.unknownField}} — not a Contact field', () => {
    const { status, body } = callValidate('Hello {{contact.unknownField}}!');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('reference');
    expect(body.errors[0].variable).toBe('contact.unknownField');
  });

  test('returns 422 for {{location.zip}} — zip is not a valid location sub-field', () => {
    const { status, body } = callValidate('Zip: {{location.zip}}');
    expect(status).toBe(422);
    expect(body.errors[0].type).toBe('reference');
  });

  test('reports multiple reference errors for multiple invalid variables', () => {
    const { status, body } = callValidate('{{foo}} and {{bar}}');
    expect(status).toBe(422);
    const refErrors = body.errors.filter((e) => e.type === 'reference');
    expect(refErrors.length).toBe(2);
  });

  test('reports reference error for each invalid variable separately', () => {
    const { status, body } = callValidate('{{foo}} and {{bar}}');
    expect(status).toBe(422);
    const variables = body.errors.map((e) => e.variable);
    expect(variables).toContain('foo');
    expect(variables).toContain('bar');
  });

  test('does NOT run reference checks when syntax is invalid', () => {
    // Template has syntax error (unmatched {{) — reference check should be skipped
    const { status, body } = callValidate('Hello {{unknownField');
    expect(status).toBe(422);
    // All errors should be syntax type, not reference
    const refErrors = body.errors.filter((e) => e.type === 'reference');
    expect(refErrors.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Input validation
// ---------------------------------------------------------------------------

describe('POST /api/templates/validate — input validation', () => {
  test('returns 400 when template field is missing from body', () => {
    const req = mockReq({});
    const res = mockRes();
    validateTemplate(req, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('returns 400 when template is null', () => {
    const req = mockReq({ template: null });
    const res = mockRes();
    validateTemplate(req, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('returns 400 when template is a number', () => {
    const req = mockReq({ template: 42 });
    const res = mockRes();
    validateTemplate(req, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('returns 400 when template is an object', () => {
    const req = mockReq({ template: { content: 'hello' } });
    const res = mockRes();
    validateTemplate(req, res);
    expect(res._status).toBe(400);
    expect(res._body.success).toBe(false);
  });

  test('accepts an empty string template (no placeholders)', () => {
    const { status, body } = callValidate('');
    expect(status).toBe(200);
    expect(body.data.valid).toBe(true);
    expect(body.data.variables).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Response shape
// ---------------------------------------------------------------------------

describe('POST /api/templates/validate — response shape', () => {
  test('success response has success, message, and data fields', () => {
    const { status, body } = callValidate('Hello {{name}}!');
    expect(status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('valid', true);
    expect(body.data).toHaveProperty('variables');
  });

  test('error response has success=false, message, and errors array', () => {
    const { status, body } = callValidate('Hello {{unknownField}}!');
    expect(status).toBe(422);
    expect(body).toHaveProperty('success', false);
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('errors');
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. isValidContactField — unit tests for the helper (exported for testing)
// ---------------------------------------------------------------------------

describe('isValidContactField — unit tests', () => {
  // Valid direct fields
  test.each(['name', 'phone', 'jobTitle', 'company', 'industry', 'tags', 'source', 'location'])(
    'accepts direct field "%s"',
    (field) => {
      expect(isValidContactField(field)).toBe(true);
    }
  );

  // Valid nested location fields
  test.each(['location.city', 'location.state', 'location.country'])(
    'accepts nested location field "%s"',
    (field) => {
      expect(isValidContactField(field)).toBe(true);
    }
  );

  // Valid customFields
  test('accepts "customFields"', () => {
    expect(isValidContactField('customFields')).toBe(true);
  });

  test('accepts "customFields.anyKey"', () => {
    expect(isValidContactField('customFields.anyKey')).toBe(true);
  });

  test('accepts "customFields.key_with_underscores"', () => {
    expect(isValidContactField('customFields.key_with_underscores')).toBe(true);
  });

  // contact. prefix
  test.each(['contact.name', 'contact.company', 'contact.jobTitle', 'contact.industry'])(
    'accepts contact. prefixed field "%s"',
    (field) => {
      expect(isValidContactField(field)).toBe(true);
    }
  );

  test('accepts "contact.location.city"', () => {
    expect(isValidContactField('contact.location.city')).toBe(true);
  });

  test('accepts "contact.customFields.foo"', () => {
    expect(isValidContactField('contact.customFields.foo')).toBe(true);
  });

  // Invalid fields
  test.each(['unknownField', 'foo', 'bar', 'email', 'address', 'zip'])(
    'rejects invalid field "%s"',
    (field) => {
      expect(isValidContactField(field)).toBe(false);
    }
  );

  test('rejects "location.zip" — not a valid location sub-field', () => {
    expect(isValidContactField('location.zip')).toBe(false);
  });

  test('rejects "contact.unknownField"', () => {
    expect(isValidContactField('contact.unknownField')).toBe(false);
  });

  test('rejects "contact.location.zip"', () => {
    expect(isValidContactField('contact.location.zip')).toBe(false);
  });
});
