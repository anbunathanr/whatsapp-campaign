import { useRef, useCallback, useEffect, useId } from 'react';
import { Eye, AlertCircle } from 'lucide-react';

// ─── Template Parser ──────────────────────────────────────────────────────────

/**
 * Parses a message template string into tokens and validates syntax.
 *
 * @param {string} template - The raw template string
 * @param {string[]} availableVariables - List of valid variable names (without braces)
 * @returns {{ tokens: Array<{type: string, value: string, start: number, end: number}>, errors: string[] }}
 */
export function parseTemplate(template, availableVariables = []) {
  const tokens = [];
  const errors = [];
  const ifStack = []; // track open {{#if}} blocks

  // Regex: matches {{ ... }} blocks (non-greedy)
  const tokenRegex = /\{\{(.*?)\}\}/g;
  let lastIndex = 0;
  let match;

  // Valid variable name: alphanumeric, dots, underscores (no leading/trailing dots)
  const validNameRe = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

  while ((match = tokenRegex.exec(template)) !== null) {
    const fullMatch = match[0];
    const inner = match[1].trim();
    const start = match.index;
    const end = start + fullMatch.length;

    // Push any plain text before this token
    if (start > lastIndex) {
      tokens.push({ type: 'text', value: template.slice(lastIndex, start), start: lastIndex, end: start });
    }

    if (inner.startsWith('#if ')) {
      // Conditional open: {{#if variable}}
      const varName = inner.slice(4).trim();
      if (!validNameRe.test(varName)) {
        errors.push(`Invalid variable name in conditional: "${varName}"`);
        tokens.push({ type: 'unknown', value: fullMatch, start, end });
      } else if (availableVariables.length > 0 && !availableVariables.includes(varName)) {
        errors.push(`Undefined variable in conditional: "{{${varName}}}"`);
        tokens.push({ type: 'unknown', value: fullMatch, start, end });
      } else {
        tokens.push({ type: 'if_open', value: fullMatch, start, end });
      }
      ifStack.push({ varName, start });
    } else if (inner === '/if') {
      // Conditional close: {{/if}}
      if (ifStack.length === 0) {
        errors.push('Found {{/if}} without a matching {{#if}}');
        tokens.push({ type: 'unknown', value: fullMatch, start, end });
      } else {
        ifStack.pop();
        tokens.push({ type: 'if_close', value: fullMatch, start, end });
      }
    } else if (inner === '') {
      // Empty braces
      errors.push('Empty placeholder "{{}}" is not allowed');
      tokens.push({ type: 'unknown', value: fullMatch, start, end });
    } else if (!validNameRe.test(inner)) {
      // Invalid variable name
      errors.push(`Invalid variable name: "${inner}" — names must start with a letter or underscore and contain only letters, digits, dots, or underscores`);
      tokens.push({ type: 'unknown', value: fullMatch, start, end });
    } else if (availableVariables.length > 0 && !availableVariables.includes(inner)) {
      // Unknown variable reference
      errors.push(`Unknown variable: "{{${inner}}}" — not in the list of available variables`);
      tokens.push({ type: 'unknown', value: fullMatch, start, end });
    } else {
      tokens.push({ type: 'variable', value: fullMatch, start, end });
    }

    lastIndex = end;
  }

  // Check for unmatched braces by stripping valid {{...}} blocks first
  const strippedTemplate = template.replace(/\{\{.*?\}\}/g, '');
  const singleOpens = (strippedTemplate.match(/\{/g) || []).length;
  const singleCloses = (strippedTemplate.match(/\}/g) || []).length;
  if (singleOpens > 0) {
    errors.push(`Found ${singleOpens} unmatched "{" brace${singleOpens > 1 ? 's' : ''}`);
  }
  if (singleCloses > 0) {
    errors.push(`Found ${singleCloses} unmatched "}" brace${singleCloses > 1 ? 's' : ''}`);
  }

  // Unclosed {{#if}} blocks
  for (const unclosed of ifStack) {
    errors.push(`Unclosed {{#if ${unclosed.varName}}} block — missing {{/if}}`);
  }

  // Remaining text after last token
  if (lastIndex < template.length) {
    tokens.push({ type: 'text', value: template.slice(lastIndex), start: lastIndex, end: template.length });
  }

  return { tokens, errors };
}

// ─── Syntax Highlighting ──────────────────────────────────────────────────────

/**
 * Escapes HTML entities in a string to prevent XSS when using dangerouslySetInnerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts parsed tokens into an HTML string with syntax-highlighted spans.
 * @param {Array<{type: string, value: string}>} tokens
 * @returns {string}
 */
function tokensToHtml(tokens) {
  return tokens
    .map((token) => {
      const escaped = escapeHtml(token.value);
      switch (token.type) {
        case 'variable':
          return `<mark class="bg-indigo-500/20 text-indigo-300 rounded px-0.5 not-italic">${escaped}</mark>`;
        case 'if_open':
        case 'if_close':
          return `<mark class="bg-amber-500/20 text-amber-300 rounded px-0.5 not-italic">${escaped}</mark>`;
        case 'unknown':
          return `<mark class="bg-red-500/20 text-red-300 rounded px-0.5 not-italic">${escaped}</mark>`;
        case 'text':
        default:
          // Preserve newlines and spaces for the mirror div
          return escaped.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
      }
    })
    .join('');
}

// ─── MessageTemplateEditor Component ─────────────────────────────────────────

/**
 * A rich message template editor with syntax highlighting, variable insertion,
 * live validation, and character counting.
 *
 * @param {Object} props
 * @param {string} props.template - Current template value (controlled)
 * @param {(template: string) => void} props.onChange - Called on every change
 * @param {string[]} props.availableVariables - e.g. ['contact.name', 'contact.company', ...]
 * @param {() => void} props.onPreview - Called when user clicks Preview button
 * @param {boolean} [props.disabled] - Disables editing
 * @param {string} [props.error] - External error message
 * @param {string} [props.placeholder] - Placeholder text
 * @param {number} [props.maxLength] - Max chars, default 1600
 */
const MessageTemplateEditor = ({
  template = '',
  onChange,
  availableVariables = [],
  onPreview,
  disabled = false,
  error: externalError,
  placeholder = 'Hello {{contact.name}}, we have an exciting offer for you at {{contact.company}}!',
  maxLength = 1600,
}) => {
  const uid = useId();
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);

  // Parse template for syntax highlighting and validation
  const { tokens, errors: parseErrors } = parseTemplate(template, availableVariables);
  const highlightedHtml = tokensToHtml(tokens);

  // Combine external error with parse errors
  const allErrors = [
    ...(externalError ? [externalError] : []),
    ...parseErrors,
  ];

  const hasErrors = allErrors.length > 0;
  const charCount = template.length;
  const isOverLimit = charCount > maxLength;

  // IDs for aria-describedby
  const errorId = `${uid}-errors`;
  const hintId = `${uid}-hint`;
  const counterId = `${uid}-counter`;

  // ── Sync scroll between textarea and highlight div ──────────────────────────
  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.addEventListener('scroll', syncScroll);
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, [syncScroll]);

  // ── Handle textarea change ──────────────────────────────────────────────────
  const handleChange = useCallback(
    (e) => {
      onChange?.(e.target.value);
    },
    [onChange]
  );

  // ── Insert variable at cursor position ──────────────────────────────────────
  const insertVariable = useCallback(
    (varName) => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) return;

      const start = textarea.selectionStart ?? template.length;
      const end = textarea.selectionEnd ?? template.length;
      const insertion = `{{${varName}}}`;
      const newValue = template.slice(0, start) + insertion + template.slice(end);

      onChange?.(newValue);

      // Restore focus and move cursor after the inserted text
      requestAnimationFrame(() => {
        textarea.focus();
        const newCursor = start + insertion.length;
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
    [template, onChange, disabled]
  );

  // ── Shared styles for textarea and highlight div (must match exactly) ───────
  const sharedStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '0.875rem',   // text-sm = 14px
    lineHeight: '1.5rem',   // leading-6 = 24px
    padding: '0.625rem 1rem', // py-2.5 px-4
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    minHeight: '120px',
  };

  const describedByIds = [
    hasErrors ? errorId : null,
    hintId,
    counterId,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-3">
      {/* ── Variable insertion chips ── */}
      {availableVariables.length > 0 && (
        <div>
          <p id={hintId} className="text-xs text-slate-500 mb-2">
            Click a variable to insert it at the cursor position:
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Available variables">
            {availableVariables.map((varName) => (
              <button
                key={varName}
                type="button"
                onClick={() => insertVariable(varName)}
                disabled={disabled}
                aria-label={`Insert {{${varName}}}`}
                className="inline-flex items-center px-2.5 py-1 bg-slate-700 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-200 border border-slate-600 hover:border-indigo-500/50 rounded text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-800"
              >
                {`{{${varName}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Editor container ── */}
      <div
        className={[
          'relative rounded-lg border transition-colors',
          'focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500',
          hasErrors || isOverLimit
            ? 'border-red-500'
            : 'border-slate-600 hover:border-slate-500',
          disabled ? 'opacity-50' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Syntax-highlighted mirror div (sits behind the textarea) */}
        <div
          ref={highlightRef}
          aria-hidden="true"
          className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none text-white bg-slate-700/60"
          style={{
            ...sharedStyle,
            // Ensure the highlight div doesn't interfere with textarea resize
            resize: 'none',
            overflow: 'hidden',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml || '' }}
        />

        {/* Transparent textarea on top */}
        <textarea
          ref={textareaRef}
          id={`${uid}-textarea`}
          role="textbox"
          aria-multiline="true"
          aria-label="Message template editor"
          aria-describedby={describedByIds || undefined}
          aria-invalid={hasErrors || isOverLimit}
          value={template}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength + 100} // soft limit; hard limit shown via counter
          className={[
            'relative w-full rounded-lg text-white placeholder-slate-500',
            'outline-none resize-y',
            'disabled:cursor-not-allowed',
            // Make text transparent so the highlight div shows through,
            // but keep caret visible via caret-color
          ].join(' ')}
          style={{
            ...sharedStyle,
            background: 'transparent',
            color: template ? 'transparent' : undefined, // show placeholder when empty
            caretColor: 'white',
            position: 'relative',
            zIndex: 1,
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* ── Bottom row: errors + character counter ── */}
      <div className="flex items-start justify-between gap-3">
        {/* Validation errors */}
        <div className="flex-1 min-w-0">
          {allErrors.length > 0 && (
            <ul
              id={errorId}
              role="alert"
              aria-live="polite"
              className="flex flex-col gap-1"
            >
              {allErrors.map((err, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-red-400">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{err}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Character counter */}
        <div
          id={counterId}
          aria-live="polite"
          aria-atomic="true"
          className={[
            'flex-shrink-0 text-xs tabular-nums',
            isOverLimit ? 'text-red-400 font-semibold' : charCount > maxLength * 0.9 ? 'text-amber-400' : 'text-slate-500',
          ].join(' ')}
        >
          {charCount.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      </div>

      {/* ── Preview button ── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onPreview}
          disabled={!template.trim() || disabled}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-800"
        >
          <Eye className="w-4 h-4" aria-hidden="true" />
          Preview Message
        </button>
      </div>
    </div>
  );
};

export default MessageTemplateEditor;
