'use strict';

/**
 * Tests for templateParser.service.js
 *
 * Validates: Requirements 4.3, 13.1, 13.2, 13.3, 13.4, 5.2, 5.12
 */

const {
  parseTemplate,
  renderTemplate,
  extractVariables,
  validateTemplate,
  _describeInvalidVarName,
} = require('../../services/templateParser.service');

// ---------------------------------------------------------------------------
// renderTemplate — simple variable substitution
// ---------------------------------------------------------------------------
describe('renderTemplate — simple variable substitution', () => {
  test('replaces {{name}} with the contact name', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'Alice' })).toBe('Hello Alice!');
  });

  test('replaces {{company}} with the company value', () => {
    expect(renderTemplate('Welcome to {{company}}', { company: 'Acme' })).toBe('Welcome to Acme');
  });

  test('returns empty string for a missing top-level variable', () => {
    expect(renderTemplate('Hi {{name}}', {})).toBe('Hi ');
  });
});

// ---------------------------------------------------------------------------
// renderTemplate — nested dot-notation path resolution
// ---------------------------------------------------------------------------
describe('renderTemplate — nested dot-notation', () => {
  test('resolves {{contact.company.name}} from nested object', () => {
    const data = { contact: { company: { name: 'Acme' } } };
    expect(renderTemplate('{{contact.company.name}}', data)).toBe('Acme');
  });

  test('returns empty string when nested path is missing', () => {
    const data = { contact: {} };
    expect(renderTemplate('{{contact.company.name}}', data)).toBe('');
  });

  test('resolves deep nesting {{a.b.c.d}}', () => {
    const data = { a: { b: { c: { d: 'deep' } } } };
    expect(renderTemplate('{{a.b.c.d}}', data)).toBe('deep');
  });

  test('returns empty string when intermediate node is null', () => {
    const data = { contact: null };
    expect(renderTemplate('{{contact.company.name}}', data)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// renderTemplate — mixed templates
// ---------------------------------------------------------------------------
describe('renderTemplate — mixed templates', () => {
  test('renders a template with both simple and nested variables', () => {
    const data = { name: 'Bob', contact: { company: { name: 'Globex' } } };
    const result = renderTemplate('Hello {{name}}, from {{contact.company.name}}', data);
    expect(result).toBe('Hello Bob, from Globex');
  });

  test('preserves surrounding text unchanged', () => {
    const data = { city: 'Paris' };
    expect(renderTemplate('Visit {{city}} today!', data)).toBe('Visit Paris today!');
  });

  test('handles template with no placeholders', () => {
    expect(renderTemplate('No variables here.', {})).toBe('No variables here.');
  });

  test('handles multiple occurrences of the same placeholder', () => {
    const data = { name: 'Alice' };
    expect(renderTemplate('{{name}} and {{name}}', data)).toBe('Alice and Alice');
  });
});

// ---------------------------------------------------------------------------
// parseTemplate — AST structure
// ---------------------------------------------------------------------------
describe('parseTemplate — AST', () => {
  test('produces correct AST nodes for a simple template', () => {
    const { ast } = parseTemplate('Hello {{name}}!');
    expect(ast).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'variable', value: 'name', path: ['name'] },
      { type: 'text', value: '!' },
    ]);
  });

  test('produces correct path array for nested variable', () => {
    const { ast } = parseTemplate('{{contact.company.name}}');
    expect(ast).toHaveLength(1);
    expect(ast[0]).toEqual({
      type: 'variable',
      value: 'contact.company.name',
      path: ['contact', 'company', 'name'],
    });
  });

  test('deduplicates variables list', () => {
    const { variables } = parseTemplate('{{name}} {{name}} {{city}}');
    expect(variables).toHaveLength(2);
    expect(variables).toContain('name');
    expect(variables).toContain('city');
  });

  test('returns empty variables and ast for template with no placeholders', () => {
    const { variables, ast } = parseTemplate('No placeholders.');
    expect(variables).toEqual([]);
    expect(ast).toEqual([{ type: 'text', value: 'No placeholders.' }]);
  });
});

// ---------------------------------------------------------------------------
// extractVariables
// ---------------------------------------------------------------------------
describe('extractVariables', () => {
  test('returns list of variable expressions', () => {
    const vars = extractVariables('Hi {{name}}, your company is {{contact.company.name}}');
    expect(vars).toContain('name');
    expect(vars).toContain('contact.company.name');
    expect(vars).toHaveLength(2);
  });

  test('returns empty array for template with no placeholders', () => {
    expect(extractVariables('Hello world')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — valid templates
// ---------------------------------------------------------------------------
describe('validateTemplate — valid templates', () => {
  test('accepts a valid simple template', () => {
    const result = validateTemplate('Hello {{name}}!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts a valid nested expression', () => {
    const result = validateTemplate('{{contact.company.name}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns valid for template with no placeholders', () => {
    const result = validateTemplate('No placeholders here.');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts a template with multiple valid placeholders', () => {
    const result = validateTemplate('Hi {{name}}, your role is {{jobTitle}} at {{company}}.');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts underscore-prefixed variable names', () => {
    const result = validateTemplate('Value: {{_private_field}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts deeply nested dot-notation', () => {
    const result = validateTemplate('{{a.b.c.d.e}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — invalid templates: error structure
// ---------------------------------------------------------------------------
describe('validateTemplate — error object structure', () => {
  test('each error has message, position, and context fields', () => {
    const result = validateTemplate('Hello {{}}!');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    const err = result.errors[0];
    expect(err).toHaveProperty('message');
    expect(err).toHaveProperty('position');
    expect(err).toHaveProperty('context');
    expect(typeof err.message).toBe('string');
    expect(typeof err.position).toBe('number');
    expect(typeof err.context).toBe('string');
  });

  test('position points to the start of the offending placeholder', () => {
    const template = 'Hello {{}}!';
    const result = validateTemplate(template);
    expect(result.errors[0].position).toBe(6); // index of first {
  });

  test('context snippet contains surrounding text', () => {
    const result = validateTemplate('Hello {{}}!');
    expect(result.errors[0].context).toContain('Hello {{}}');
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — empty placeholder
// ---------------------------------------------------------------------------
describe('validateTemplate — empty placeholder', () => {
  test('catches empty placeholder {{}}', () => {
    const result = validateTemplate('Hello {{}}!');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/empty/i);
  });

  test('error message for empty placeholder suggests correct usage', () => {
    const result = validateTemplate('{{}}');
    expect(result.errors[0].message).toMatch(/\{\{name\}\}|\{\{contact/i);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — unmatched braces
// ---------------------------------------------------------------------------
describe('validateTemplate — unmatched braces', () => {
  test('catches unmatched {{ without closing }}', () => {
    const result = validateTemplate('Hello {{name');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/unmatched/i);
  });

  test('error message for unmatched {{ mentions missing closing }}', () => {
    const result = validateTemplate('Hello {{name');
    expect(result.errors[0].message).toMatch(/\}\}/);
  });

  test('catches unmatched }} without opening {{', () => {
    const result = validateTemplate('Hello name}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/unmatched/i);
  });

  test('error message for unmatched }} mentions missing opening {{', () => {
    const result = validateTemplate('Hello name}}');
    expect(result.errors[0].message).toMatch(/\{\{/);
  });

  test('position for unmatched {{ is correct', () => {
    const template = 'Hello {{name';
    const result = validateTemplate(template);
    expect(result.errors[0].position).toBe(6);
  });

  test('position for unmatched }} is correct', () => {
    const template = 'Hello name}}';
    const result = validateTemplate(template);
    expect(result.errors[0].position).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — invalid variable names
// ---------------------------------------------------------------------------
describe('validateTemplate — invalid variable names', () => {
  test('catches invalid characters in variable name (exclamation mark)', () => {
    const result = validateTemplate('Hello {{name!}}');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('!');
  });

  test('catches hyphen in variable name', () => {
    const result = validateTemplate('Hello {{first-name}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('-');
  });

  test('catches space in variable name', () => {
    const result = validateTemplate('Hello {{first name}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/invalid character/i);
  });

  test('catches variable name starting with a dot', () => {
    const result = validateTemplate('Hello {{.name}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/must not start with a dot/i);
  });

  test('catches variable name ending with a dot', () => {
    const result = validateTemplate('Hello {{name.}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/must not end with a dot/i);
  });

  test('catches consecutive dots in variable name', () => {
    const result = validateTemplate('Hello {{contact..name}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/consecutive dots/i);
  });

  test('catches variable name starting with a digit', () => {
    const result = validateTemplate('Hello {{1name}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/must start with a letter or underscore/i);
  });

  test('error message includes the offending variable name', () => {
    const result = validateTemplate('Hello {{name!}}');
    expect(result.errors[0].message).toContain('name!');
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — triple brace
// ---------------------------------------------------------------------------
describe('validateTemplate — triple brace', () => {
  test('catches triple opening brace {{{', () => {
    const result = validateTemplate('{{{name}}}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/triple/i);
  });

  test('error message for triple brace suggests correct double-brace syntax', () => {
    const result = validateTemplate('{{{name}}}');
    expect(result.errors[0].message).toMatch(/\{\{variable\}\}/i);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — nested {{ inside placeholder
// ---------------------------------------------------------------------------
describe('validateTemplate — nested {{ inside placeholder', () => {
  test('catches nested {{ inside an open placeholder', () => {
    const result = validateTemplate('{{ {{name}} }}');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/nested/i);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate — multiple errors
// ---------------------------------------------------------------------------
describe('validateTemplate — multiple errors', () => {
  test('reports all errors in a template with multiple problems', () => {
    const result = validateTemplate('{{}} and {{name and {{!}}');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test('each error has a distinct position', () => {
    const result = validateTemplate('{{}} text {{}}');
    expect(result.valid).toBe(false);
    const positions = result.errors.map((e) => e.position);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

// ---------------------------------------------------------------------------
// _describeInvalidVarName — unit tests for the diagnostic helper
// ---------------------------------------------------------------------------
describe('_describeInvalidVarName', () => {
  test('describes leading dot', () => {
    expect(_describeInvalidVarName('.name')).toMatch(/must not start with a dot/i);
  });

  test('describes trailing dot', () => {
    expect(_describeInvalidVarName('name.')).toMatch(/must not end with a dot/i);
  });

  test('describes consecutive dots', () => {
    expect(_describeInvalidVarName('contact..name')).toMatch(/consecutive dots/i);
  });

  test('describes digit-start', () => {
    expect(_describeInvalidVarName('1name')).toMatch(/must start with a letter or underscore/i);
  });

  test('describes invalid special character', () => {
    const desc = _describeInvalidVarName('name!');
    expect(desc).toMatch(/invalid character/i);
    expect(desc).toContain('!');
  });

  test('describes hyphen as invalid character', () => {
    const desc = _describeInvalidVarName('first-name');
    expect(desc).toMatch(/invalid character/i);
    expect(desc).toContain('-');
  });
});

// ---------------------------------------------------------------------------
// personalizeMessage integration (via message.service)
// ---------------------------------------------------------------------------
describe('personalizeMessage (message.service integration)', () => {
  const { personalizeMessage } = require('../../services/message.service');

  test('personalizes a template with contact data', async () => {
    const contact = { name: 'Alice', company: 'Acme' };
    const result = await personalizeMessage('Hello {{name}} from {{company}}', contact);
    expect(result).toBe('Hello Alice from Acme');
  });

  test('personalizes a template with nested contact data', async () => {
    const contact = { name: 'Bob', contact: { company: { name: 'Globex' } } };
    const result = await personalizeMessage(
      'Hi {{name}}, your company is {{contact.company.name}}',
      contact
    );
    expect(result).toBe('Hi Bob, your company is Globex');
  });

  test('returns empty string for missing contact fields', async () => {
    const contact = {};
    const result = await personalizeMessage('Hello {{name}}', contact);
    expect(result).toBe('Hello ');
  });
});
