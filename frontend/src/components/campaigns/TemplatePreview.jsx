import { useState, useEffect, useId } from 'react';
import {
  Eye,
  X,
  Loader2,
  AlertCircle,
  FileText,
  Image,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
// parseTemplate is imported for client-side template validation (surfaces syntax errors)
import { parseTemplate } from './MessageTemplateEditor';
import campaignService from '../../services/campaignService';

// ─── Constants ────────────────────────────────────────────────────────────────

const AVAILABLE_VARIABLES = [
  'contact.name',
  'contact.phone',
  'contact.company',
  'contact.jobTitle',
  'contact.industry',
];

const SAMPLE_CONTACT = {
  'contact.name': 'Jane Doe',
  'contact.phone': '+12025551234',
  'contact.company': 'Acme Corp',
  'contact.jobTitle': 'Marketing Manager',
  'contact.industry': 'Technology',
};

// ─── Client-side renderer ─────────────────────────────────────────────────────

/**
 * Renders a template string by substituting variables and evaluating
 * {{#if variable}}...{{/if}} conditionals using the provided sample data.
 *
 * @param {string} template
 * @param {Object} data - Map of variable name → sample value
 * @returns {string}
 */
function renderTemplate(template, data) {
  if (!template) return '';

  // Process {{#if variable}}...{{/if}} blocks first
  let result = template.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, block) => {
      const value = data[varName];
      return value ? block : '';
    }
  );

  // Substitute {{variable}} placeholders
  result = result.replace(/\{\{([\w.]+)\}\}/g, (match, varName) => {
    return Object.prototype.hasOwnProperty.call(data, varName)
      ? data[varName]
      : match;
  });

  return result;
}

// ─── Media Attachment Preview ─────────────────────────────────────────────────

const MediaAttachmentPreview = ({ mediaAttachment }) => {
  if (!mediaAttachment) return null;

  const isImage =
    mediaAttachment.type === 'image' ||
    /\.(jpe?g|png|gif|webp)$/i.test(mediaAttachment.filename ?? '');

  const Icon = isImage ? Image : FileText;
  const label = isImage ? 'Image' : 'Document';

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 mb-2 bg-slate-700/50 border border-slate-600/40 rounded-xl">
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-600/60 rounded-lg">
        <Icon className="w-4 h-4 text-slate-300" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-300 truncate">
          {mediaAttachment.filename ?? label}
        </p>
        <p className="text-xs text-slate-500">{label} attachment</p>
      </div>
    </div>
  );
};

// ─── Variable Legend ──────────────────────────────────────────────────────────

const VariableLegend = ({ sampleData }) => {
  const entries = Object.entries(sampleData);
  if (entries.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-700/60">
      <p className="text-xs font-medium text-slate-400 mb-2">
        Sample values used in preview:
      </p>
      <dl className="grid grid-cols-1 gap-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-2 text-xs">
            <dt className="font-mono text-indigo-400 flex-shrink-0">{`{{${key}}}`}</dt>
            <dd className="text-slate-400 truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// ─── Preview Content ──────────────────────────────────────────────────────────

const PreviewContent = ({ renderedMessage, mediaAttachment, sampleData, showVariables }) => {
  // Split on newlines to preserve line breaks in the bubble
  const lines = renderedMessage.split('\n');

  return (
    <div className="flex flex-col gap-4">
      {/* Phone mockup background */}
      <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-700/40">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/40">
          <MessageSquare className="w-4 h-4 text-green-400" aria-hidden="true" />
          <span className="text-xs text-slate-400 font-medium">WhatsApp Preview</span>
        </div>

        {/* Message bubble — outgoing style (right-aligned, green) */}
        <div className="flex justify-end">
          <div className="max-w-[85%]">
            <MediaAttachmentPreview mediaAttachment={mediaAttachment} />
            <div className="bg-green-800/60 border border-green-700/40 rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm">
              <p className="text-sm text-green-50 whitespace-pre-wrap break-words leading-relaxed">
                {lines.map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < lines.length - 1 && <br />}
                  </span>
                ))}
              </p>
              <p className="text-right text-xs text-green-300/60 mt-1 select-none">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Variable legend */}
      {showVariables && <VariableLegend sampleData={sampleData} />}
    </div>
  );
};

// ─── TemplatePreview ──────────────────────────────────────────────────────────

/**
 * TemplatePreview — renders a WhatsApp-style message preview for a campaign
 * message template, with variable substitution and optional media attachment.
 *
 * Supports two modes:
 *  - Inline mode (default): renders the preview card directly in the page
 *  - Modal mode (isModal=true): wraps in a full-screen overlay with close button
 *
 * Supports two data sources:
 *  - Client-side: provide `template` prop; variables are substituted with sampleData
 *  - API-based: provide `campaignId`; fetches rendered preview from the backend
 *
 * @param {Object}   props
 * @param {string}   [props.template]        - Raw template string (client-side rendering)
 * @param {string}   [props.campaignId]      - Campaign ID for API-based preview
 * @param {Object}   [props.sampleData]      - Override default sample variable values
 * @param {boolean}  [props.isModal]         - If true, renders with modal overlay + close button
 * @param {Function} [props.onClose]         - Called when modal close button is clicked
 * @param {Object}   [props.mediaAttachment] - Optional media attachment { type, filename, url }
 * @param {boolean}  [props.showVariables]   - Whether to show the variable legend (default: true)
 */
const TemplatePreview = ({
  template,
  campaignId,
  sampleData,
  isModal = false,
  onClose,
  mediaAttachment: mediaAttachmentProp,
  showVariables = true,
}) => {
  const titleId = useId();

  // Merge caller-supplied sample data with defaults
  const effectiveSampleData = { ...SAMPLE_CONTACT, ...sampleData };

  // ── API-based preview state ──────────────────────────────────────────────────
  const [apiState, setApiState] = useState({
    loading: false,
    error: null,
    renderedMessage: null,
    sampleContact: null,
    mediaAttachment: null,
  });

  const fetchPreview = () => {
    if (!campaignId) return;
    setApiState((s) => ({ ...s, loading: true, error: null }));
    campaignService
      .previewCampaign(campaignId)
      .then((data) => {
        setApiState({
          loading: false,
          error: null,
          // Support multiple possible field names from the backend
          renderedMessage:
            data?.renderedPreview ?? data?.renderedMessage ?? data?.message ?? '',
          sampleContact: data?.sampleContact ?? null,
          mediaAttachment: data?.mediaAttachment ?? null,
        });
      })
      .catch((err) => {
        setApiState((s) => ({
          ...s,
          loading: false,
          error: err?.response?.data?.message ?? err?.message ?? 'Failed to load preview.',
        }));
      });
  };

  useEffect(() => {
    if (campaignId) fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // ── Derive rendered content ──────────────────────────────────────────────────
  let renderedMessage = '';
  let resolvedMediaAttachment = mediaAttachmentProp ?? null;
  let resolvedSampleData = effectiveSampleData;

  if (campaignId) {
    // API mode — use server-rendered message
    if (apiState.renderedMessage != null) {
      renderedMessage = apiState.renderedMessage;
    }
    if (apiState.mediaAttachment) {
      resolvedMediaAttachment = apiState.mediaAttachment;
    }
    if (apiState.sampleContact) {
      // Backend may return flat keys (name, phone, company, jobTitle, industry).
      // Map them to the dot-notation keys used by the template renderer.
      const sc = apiState.sampleContact;
      const mapped = {
        'contact.name': sc.name ?? sc['contact.name'],
        'contact.phone': sc.phone ?? sc['contact.phone'],
        'contact.company': sc.company ?? sc['contact.company'],
        'contact.jobTitle': sc.jobTitle ?? sc['contact.jobTitle'],
        'contact.industry': sc.industry ?? sc['contact.industry'],
      };
      // Remove undefined/null entries
      Object.keys(mapped).forEach((k) => {
        if (mapped[k] == null) delete mapped[k];
      });
      resolvedSampleData = { ...effectiveSampleData, ...mapped };
    }
  } else if (template) {
    // Client-side mode — render locally
    renderedMessage = renderTemplate(template, effectiveSampleData);
  }

  // Parse errors for client-side template (shown as amber warnings above the preview)
  const { errors: templateErrors } =
    template && !campaignId
      ? parseTemplate(template, AVAILABLE_VARIABLES)
      : { errors: [] };

  // ── Inner body ───────────────────────────────────────────────────────────────
  const renderBody = () => {
    // Loading state
    if (campaignId && apiState.loading) {
      return (
        <div
          className="flex flex-col items-center justify-center py-12 gap-3"
          aria-busy="true"
          aria-label="Loading preview"
        >
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" aria-hidden="true" />
          <p className="text-sm text-slate-400">Loading preview…</p>
        </div>
      );
    }

    // Error state
    if (campaignId && apiState.error) {
      return (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
            <p className="text-sm font-medium">Failed to load preview</p>
          </div>
          <p className="text-xs text-slate-500 text-center max-w-xs">{apiState.error}</p>
          <button
            type="button"
            onClick={fetchPreview}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-800"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      );
    }

    // Empty state
    if (!renderedMessage) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
          <Eye className="w-8 h-8 opacity-40" aria-hidden="true" />
          <p className="text-sm">No template to preview.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {/* Template parse warnings (client-side only) */}
        {templateErrors.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-1 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg"
          >
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              Template has syntax issues:
            </p>
            <ul className="flex flex-col gap-0.5 pl-5 list-disc">
              {templateErrors.map((err, i) => (
                <li key={i} className="text-xs text-amber-300/80">{err}</li>
              ))}
            </ul>
          </div>
        )}
        <PreviewContent
          renderedMessage={renderedMessage}
          mediaAttachment={resolvedMediaAttachment}
          sampleData={resolvedSampleData}
          showVariables={showVariables}
        />
      </div>
    );
  };

  // ── Card wrapper (shared between inline and modal) ───────────────────────────
  const card = (
    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
        <h3
          id={titleId}
          className="text-white font-semibold text-base flex items-center gap-2"
        >
          <Eye className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          Template Preview
        </h3>
        {isModal && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-5 overflow-y-auto flex-1">{renderBody()}</div>

      {/* Footer (modal only) */}
      {isModal && (
        <div className="flex justify-end px-5 py-4 border-t border-slate-700 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-800"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );

  // ── Modal mode ───────────────────────────────────────────────────────────────
  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {card}
      </div>
    );
  }

  // ── Inline mode ──────────────────────────────────────────────────────────────
  return card;
};

export default TemplatePreview;
