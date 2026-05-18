/**
 * Template Parser Service
 *
 * Parses message templates containing {{variable}} and {{nested.dot.notation}} placeholders.
 * Supports rendering, variable extraction, and validation.
 *
 * Requirements: 4.3, 13.1, 13.2, 13.3, 13.4, 5.2, 5.12
 */

const logger = require('../utils/logger');

// Matches {{ ... }} placeholders — captures the inner expression
const PLACEHOLDER_REGEX = /\{\{([^}]*)\}\}/g;

// Valid variable name: alphanumeric, underscore, dot — no leading/trailing dots, no consecutive dots
// Must start with a letter or underscore, segments separated by single dots
const VALID_VAR_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

/**
 * Parse a template string into an AST and extract variable names.
 *
 * @param {string} templateString
 * @returns {{ variables: string[], ast: Array<{type: string, value: string, path?: string[]}> }}
 */
const parseTemplate = (templateString) => {
  if (typeof templateString !== 'string') {
    throw new TypeError('templateString must be a string');
  }

  const ast = [];
  const variableSet = new Set();
  let lastIndex = 0;

  // Reset regex state
  PLACEHOLDER_REGEX.lastIndex = 0;

  let match;
  while ((match = PLACEHOLDER_REGEX.exec(templateString)) !== null) {
    const [fullMatch, inner] = match;
    const matchStart = match.index;

    // Push any text before this placeholder
    if (matchStart > lastIndex) {
      ast.push({ type: 'text', value: templateString.slice(lastIndex, matchStart) });
    }

    const expression = inner.trim();

    // Empty placeholder
    if (expression === '') {
      logger.warn('templateParser: empty placeholder found at position %d', matchStart);
      ast.push({ type: 'variable', value: '', path: [] });
    } else {
      const path = expression.split('.');
      ast.push({ type: 'variable', value: expression, path });
      variableSet.add(expression);
    }

    lastIndex = matchStart + fullMatch.length;
  }

  // Push any trailing text
  if (lastIndex < templateString.length) {
    ast.push({ type: 'text', value: templateString.slice(lastIndex) });
  }

  return {
    variables: Array.from(variableSet),
    ast,
  };
};

/**
 * Safely traverse an object using a dot-notation path array.
 *
 * @param {object} data
 * @param {string[]} path
 * @returns {*} resolved value or undefined
 */
const resolvePath = (data, path) => {
  let current = data;
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
};

/**
 * Render a template string by substituting placeholders with values from data.
 *
 * @param {string} templateString
 * @param {object} data
 * @returns {string}
 */
const renderTemplate = (templateString, data) => {
  if (typeof templateString !== 'string') {
    throw new TypeError('templateString must be a string');
  }
  if (data == null || typeof data !== 'object') {
    throw new TypeError('data must be a non-null object');
  }

  const { ast } = parseTemplate(templateString);

  return ast
    .map((node) => {
      if (node.type === 'text') {
        return node.value;
      }
      // variable node
      if (!node.path || node.path.length === 0) {
        return '';
      }
      const resolved = resolvePath(data, node.path);
      if (resolved == null) {
        return '';
      }
      return String(resolved);
    })
    .join('');
};

/**
 * Convenience wrapper — returns just the variables array from parseTemplate.
 *
 * @param {string} templateString
 * @returns {string[]}
 */
const extractVariables = (templateString) => {
  return parseTemplate(templateString).variables;
};

/**
 * Build a short context snippet from the template string around a given position.
 * Used to make error messages more descriptive by showing where the problem is.
 *
 * @param {string} str
 * @param {number} pos
 * @param {number} [radius=20]
 * @returns {string}
 */
const _contextSnippet = (str, pos, radius = 20) => {
  const start = Math.max(0, pos - radius);
  const end = Math.min(str.length, pos + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < str.length ? '…' : '';
  return `${prefix}${str.slice(start, end)}${suffix}`;
};

/**
 * Diagnose why a variable name is invalid and return a human-readable reason.
 *
 * @param {string} name - The trimmed inner expression from a placeholder
 * @returns {string} A descriptive reason string
 */
const _describeInvalidVarName = (name) => {
  if (name.startsWith('.')) {
    return `variable name "${name}" must not start with a dot`;
  }
  if (name.endsWith('.')) {
    return `variable name "${name}" must not end with a dot`;
  }
  if (/\.\./.test(name)) {
    return `variable name "${name}" contains consecutive dots — each segment must be separated by a single dot`;
  }
  if (/^\d/.test(name)) {
    return `variable name "${name}" must start with a letter or underscore, not a digit`;
  }
  // Find the first offending character
  const badChar = name.match(/[^a-zA-Z0-9_.]/);
  if (badChar) {
    return `variable name "${name}" contains invalid character '${badChar[0]}' — only letters, digits, underscores, and dots are allowed`;
  }
  return `variable name "${name}" is not a valid identifier`;
};

/**
 * Validate a template string for syntax errors.
 *
 * Returns a structured result with a `valid` flag and an `errors` array.
 * Each error has:
 *   - `message`  {string}  Human-readable description of the problem
 *   - `position` {number}  Zero-based character index in the template string
 *   - `context`  {string}  Short surrounding snippet to help locate the error
 *
 * @param {string} templateString
 * @returns {{ valid: boolean, errors: Array<{message: string, position: number, context: string}> }}
 */
const validateTemplate = (templateString) => {
  if (typeof templateString !== 'string') {
    throw new TypeError('templateString must be a string');
  }

  const errors = [];

  // Scan character by character tracking brace state
  let i = 0;
  while (i < templateString.length) {
    // Detect triple-brace opening {{{ — ambiguous and unsupported
    if (
      templateString[i] === '{' &&
      templateString[i + 1] === '{' &&
      templateString[i + 2] === '{'
    ) {
      errors.push({
        message:
          `Unexpected triple opening brace '{{{' at position ${i} — ` +
          `use double braces '{{variable}}' for placeholders`,
        position: i,
        context: _contextSnippet(templateString, i),
      });
      i += 3;
      continue;
    }

    if (templateString[i] === '{' && templateString[i + 1] === '{') {
      // Found opening {{, look for closing }}
      const openPos = i;
      i += 2;
      let found = false;

      while (i < templateString.length) {
        if (templateString[i] === '}' && templateString[i + 1] === '}') {
          // Found closing }}
          const inner = templateString.slice(openPos + 2, i).trim();

          if (inner === '') {
            // Empty placeholder
            errors.push({
              message:
                `Empty placeholder '{{}}' at position ${openPos} — ` +
                `provide a variable name, e.g. {{name}} or {{contact.company}}`,
              position: openPos,
              context: _contextSnippet(templateString, openPos),
            });
          } else if (!VALID_VAR_REGEX.test(inner)) {
            // Invalid variable name — provide a specific reason
            const reason = _describeInvalidVarName(inner);
            errors.push({
              message:
                `Invalid placeholder '{{${inner}}}' at position ${openPos} — ${reason}`,
              position: openPos,
              context: _contextSnippet(templateString, openPos),
            });
          }

          i += 2;
          found = true;
          break;
        }

        // Detect a nested {{ inside an open placeholder (e.g. {{ {{name}} }})
        if (templateString[i] === '{' && templateString[i + 1] === '{') {
          errors.push({
            message:
              `Nested '{{' found inside a placeholder starting at position ${openPos} — ` +
              `placeholders cannot be nested; close the outer '{{' with '}}' first`,
            position: i,
            context: _contextSnippet(templateString, openPos),
          });
          // Skip the inner {{ and continue scanning for the outer closing }}
          i += 2;
          continue;
        }

        i++;
      }

      if (!found) {
        errors.push({
          message:
            `Unmatched '{{' at position ${openPos} — ` +
            `the opening '{{' has no matching closing '}}'`,
          position: openPos,
          context: _contextSnippet(templateString, openPos),
        });
      }
      continue;
    }

    if (templateString[i] === '}' && templateString[i + 1] === '}') {
      // Unmatched closing }}
      errors.push({
        message:
          `Unmatched '}}' at position ${i} — ` +
          `found a closing '}}' with no preceding opening '{{'`,
        position: i,
        context: _contextSnippet(templateString, i),
      });
      i += 2;
      continue;
    }

    i++;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  parseTemplate,
  renderTemplate,
  extractVariables,
  validateTemplate,
  // Exported for testing only
  _describeInvalidVarName,
};
