
import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  Megaphone,
  Tag,
  Users,
  Eye,
  Calendar,
  ChevronDown,
  Save,
  Upload,
  FileText,
  Image,
  Sparkles,
  Clock,
} from 'lucide-react';
import campaignService from '../../services/campaignService';
import contactService from '../../services/contactService';
import MessageTemplateEditor from './MessageTemplateEditor';
import TemplatePreview from './TemplatePreview';
import CampaignScheduler from './CampaignScheduler';
import CampaignCloner from './CampaignCloner';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_TYPES = [
  { value: 'promotional', label: 'Promotional' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'festival', label: 'Festival' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'follow_up', label: 'Follow-up' },
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
// Per spec Requirement 4.4: images (JPEG, PNG) and PDF only
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Dynamic variable names available in templates (without braces)
const AVAILABLE_VARIABLES = [
  'contact.name',
  'contact.phone',
  'contact.company',
  'contact.jobTitle',
  'contact.industry',
];

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates campaign form data.
 * @param {Object} data
 * @param {boolean} isScheduling - true when user is scheduling (not just saving draft)
 * @returns {Object} errors – empty object means valid.
 */
const validateCampaignForm = (data, isScheduling = false) => {
  const errors = {};

  if (!data.name.trim()) {
    errors.name = 'Campaign name is required.';
  }

  if (!data.type) {
    errors.type = 'Campaign type is required.';
  }

  if (!data.targetSegment) {
    errors.targetSegment = 'Target segment is required.';
  }

  if (!data.messageTemplate.trim()) {
    errors.messageTemplate = 'Message template is required.';
  }

  if (isScheduling) {
    if (!data.scheduledAt) {
      errors.scheduledAt = 'Scheduled date/time is required when scheduling a campaign.';
    } else {
      const scheduledDate = new Date(data.scheduledAt);
      if (scheduledDate <= new Date()) {
        errors.scheduledAt = 'Scheduled time must be in the future.';
      }
    }
  }

  return errors;
};

/**
 * Converts a Date to a local datetime-local string (YYYY-MM-DDTHH:mm).
 * Using .toISOString().slice(0, 16) is a bug because it uses UTC time!
 */
const toLocalDatetime = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Reusable field wrapper with label and inline error */
const Field = ({ id, label, required, error, icon: Icon, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-medium text-slate-300">
      {label}
      {required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
    </label>
    <div className="relative">
      {Icon && (
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 z-10"
          aria-hidden="true"
        >
          <Icon className="w-4 h-4" />
        </span>
      )}
      {children}
    </div>
    {hint && !error && (
      <p className="text-xs text-slate-500">{hint}</p>
    )}
    {error && (
      <p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-xs text-red-400">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        {error}
      </p>
    )}
  </div>
);

/** Text input styled for the dark theme */
const TextInput = ({ id, icon, error, ...props }) => (
  <input
    id={id}
    aria-invalid={!!error}
    aria-describedby={error ? `${id}-error` : undefined}
    className={[
      'w-full rounded-lg bg-slate-700/60 border py-2.5 text-sm text-white placeholder-slate-500',
      'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      icon ? 'pl-10 pr-4' : 'px-4',
      error ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
    ].join(' ')}
    {...props}
  />
);

/** Select styled for the dark theme */
const SelectInput = ({ id, icon, error, value, children, ...props }) => (
  <select
    id={id}
    value={value}
    aria-invalid={!!error}
    aria-describedby={error ? `${id}-error` : undefined}
    className={[
      'w-full appearance-none rounded-lg bg-slate-700/60 border py-2.5 text-sm',
      'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      icon ? 'pl-10 pr-10' : 'px-4 pr-10',
      value ? 'text-white' : 'text-slate-500',
      error ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
    ].join(' ')}
    {...props}
  >
    {children}
  </select>
);

// ─── Template Preview Modal ───────────────────────────────────────────────────

const TemplatePreviewModal = ({ template, onClose }) => {
  // Replace variables with sample values for preview
  const sampleValues = {
    '{{contact.name}}': 'Jane Doe',
    '{{contact.phone}}': '+12025551234',
    '{{contact.company}}': 'Acme Corp',
    '{{contact.jobTitle}}': 'Marketing Manager',
    '{{contact.industry}}': 'Technology',
  };

  const rendered = Object.entries(sampleValues).reduce(
    (text, [variable, value]) => text.replaceAll(variable, value),
    template
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Template preview"
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-400" />
            Template Preview
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-3">
            Preview with sample contact data:
          </p>
          {/* WhatsApp-style message bubble */}
          <div className="bg-slate-900 rounded-xl p-4">
            <div className="inline-block bg-green-800/60 border border-green-700/40 rounded-2xl rounded-tl-sm px-4 py-3 max-w-xs">
              <p className="text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed">
                {rendered || <span className="text-slate-500 italic">No message content</span>}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {AVAILABLE_VARIABLES.map((v) => (
              <span
                key={v}
                className="inline-flex items-center px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-xs font-mono"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Variables above are replaced with real contact data when sending.
          </p>
        </div>
        <div className="flex justify-end px-5 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main CampaignForm component ─────────────────────────────────────────────

/**
 * CampaignForm – create or edit a campaign.
 *
 * @param {Object}    props
 * @param {Object}    [props.campaign]  - Existing campaign for edit mode; omit for create mode.
 * @param {Function}  props.onSubmit    - Called with the saved campaign after a successful save.
 * @param {Function}  props.onCancel    - Called when the user cancels.
 */
const CampaignForm = ({ campaign, onSubmit, onCancel }) => {
  const isEditMode = Boolean(campaign?._id);

  // Requirement 4.9: editing only allowed when status is draft or scheduled
  const isReadOnly = isEditMode && !['draft', 'scheduled'].includes(campaign?.status);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    targetSegment: '',
    messageTemplate: '',
    scheduledAt: '',
    status: 'draft',
  });

  // Media attachment state (separate from formData for file handling)
  const [mediaFile, setMediaFile] = useState(null);       // File object (new upload)
  const [existingMedia, setExistingMedia] = useState(null); // Existing attachment from campaign

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  // Segments
  const [segments, setSegments] = useState([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [segmentsError, setSegmentsError] = useState('');

  // Estimated recipients from selected segment
  const [estimatedRecipients, setEstimatedRecipients] = useState(null);

  // Template preview modal
  const [showPreview, setShowPreview] = useState(false);

  // Best Time to Send AI state
  const [bestTimeLoading, setBestTimeLoading] = useState(false);
  const [bestTimeResults, setBestTimeResults] = useState(null);
  const [bestTimeError, setBestTimeError] = useState('');

  const handleGetBestTime = useCallback(async () => {
    setBestTimeLoading(true);
    setBestTimeResults(null);
    setBestTimeError('');
    try {
      const data = await campaignService.getBestTimeToSend({
        type: formData.type || 'promotional',
      });
      setBestTimeResults(data);
    } catch (err) {
      setBestTimeError(err?.response?.data?.message || 'Could not fetch recommendations.');
    } finally {
      setBestTimeLoading(false);
    }
  }, [formData.type]);

  const applyBestTime = useCallback((recommendation) => {
    // Build a datetime-local string: next occurrence of the given day at the given time
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const targetDay = dayNames.indexOf(recommendation.day);
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = (targetDay - currentDay + 7) % 7 || 7; // always future
    const target = new Date(now);
    target.setDate(now.getDate() + daysUntil);
    const [hours, minutes] = recommendation.time.split(':').map(Number);
    target.setHours(hours, minutes, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const val = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(hours)}:${pad(minutes)}`;
    setFormData(prev => ({ ...prev, scheduledAt: val }));
    if (errors.scheduledAt) setErrors(prev => ({ ...prev, scheduledAt: '' }));
    setBestTimeResults(null);
  }, [errors.scheduledAt]);

  // ── Load segments on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchSegments = async () => {
      setSegmentsLoading(true);
      setSegmentsError('');
      try {
        const data = await contactService.getSegments();
        // API may return { data: [...] } or directly an array
        const list = Array.isArray(data) ? data : (data?.data ?? data?.segments ?? []);
        setSegments(list);
      } catch (err) {
        setSegmentsError('Failed to load segments. Please try again.');
      } finally {
        setSegmentsLoading(false);
      }
    };
    fetchSegments();
  }, []);

  // ── Populate form when editing ─────────────────────────────────────────────
  useEffect(() => {
    if (campaign) {
      // Format scheduledAt for datetime-local input (strip seconds/ms)
      let scheduledAtValue = '';
      if (campaign.scheduledAt) {
        scheduledAtValue = toLocalDatetime(new Date(campaign.scheduledAt));
      }

      setFormData({
        name: campaign.name ?? '',
        type: campaign.type ?? '',
        targetSegment: campaign.targetSegment?._id ?? campaign.targetSegment ?? '',
        messageTemplate: campaign.messageTemplate ?? '',
        scheduledAt: scheduledAtValue,
        status: campaign.status ?? 'draft',
      });

      if (campaign.mediaAttachment && campaign.mediaAttachment.type !== 'none') {
        setExistingMedia(campaign.mediaAttachment);
      }

      if (campaign.estimatedRecipients !== undefined) {
        setEstimatedRecipients(campaign.estimatedRecipients);
      }
    }
  }, [campaign]);

  // ── Update estimated recipients when segment changes ──────────────────────
  useEffect(() => {
    if (!formData.targetSegment) {
      setEstimatedRecipients(null);
      return;
    }
    const seg = segments.find((s) => s._id === formData.targetSegment);
    if (seg) {
      setEstimatedRecipients(seg.contactCount ?? null);
    }
  }, [formData.targetSegment, segments]);

  // ── Field change handlers ──────────────────────────────────────────────────
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) setApiError('');
  }, [errors, apiError]);
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        mediaFile: 'Only images (JPEG, PNG) and PDF files are accepted.',
      }));
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        mediaFile: 'File size must not exceed 5 MB.',
      }));
      e.target.value = '';
      return;
    }

    setMediaFile(file);
    setExistingMedia(null);
    setErrors((prev) => ({ ...prev, mediaFile: '' }));
  }, []);

  const handleRemoveMedia = useCallback(() => {
    setMediaFile(null);
    setExistingMedia(null);
  }, []);

  // ── Build JSON payload (media handled separately) ────────────────────────
  const buildPayload = useCallback((status) => {
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      targetSegment: formData.targetSegment,
      messageTemplate: formData.messageTemplate.trim(),
    };

    // Only include scheduledAt when actually scheduling
    if (status === 'scheduled' && formData.scheduledAt) {
      payload.scheduledAt = new Date(formData.scheduledAt).toISOString();
    }

    // Tell the backend to clear media if the user removed an existing attachment
    // (only when no new file is being uploaded either)
    if (!mediaFile && !existingMedia) {
      payload.mediaAttachment = null;
    }

    return payload;
  }, [formData, mediaFile, existingMedia]);

  // ── Submit handlers ────────────────────────────────────────────────────────
  const handleSaveDraft = async (e) => {
    e.preventDefault();
    const validationErrors = validateCampaignForm(formData, false);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await submitForm('draft');
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    const validationErrors = validateCampaignForm(formData, true);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await submitForm('scheduled');
  };

  const submitForm = async (status) => {
    setLoading(true);
    setApiError('');

    try {
      const payload = buildPayload(status);

      // Step 1: Create or update the campaign with JSON body
      let saved;
      if (isEditMode) {
        saved = await campaignService.updateCampaign(campaign._id, payload);
      } else {
        saved = await campaignService.createCampaign(payload);
      }

      // Resolve the campaign ID from either response shape
      const savedId = saved?._id ?? saved?.campaign?._id ?? saved?.data?.campaign?._id;

      // Step 2: Attach new media file separately (POST /campaigns/:id/media)
      if (mediaFile && savedId) {
        try {
          await campaignService.attachMedia(savedId, mediaFile);
        } catch (mediaErr) {
          // Non-fatal: campaign saved successfully, but media upload failed
          console.warn('Media attachment failed:', mediaErr);
          setApiError(
            'Campaign saved, but media upload failed: ' +
            (mediaErr?.response?.data?.message ?? mediaErr.message)
          );
        }
      }

      // Step 3: Transition status to 'scheduled' via dedicated endpoint
      if (status === 'scheduled' && formData.scheduledAt && savedId) {
        saved = await campaignService.scheduleCampaign(
          savedId,
          new Date(formData.scheduledAt).toISOString()
        );
      }

      onSubmit?.(saved);
    } catch (err) {
      const message =
        err?.response?.data?.message ?? err.message ?? 'An unexpected error occurred.';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getMediaIcon = () => {
    if (!mediaFile && !existingMedia) return null;
    const type = mediaFile?.type ?? existingMedia?.type;
    if (type === 'application/pdf' || type === 'pdf') return FileText;
    return Image;
  };

  const getMediaName = () => {
    if (mediaFile) return mediaFile.name;
    if (existingMedia) return existingMedia.filename ?? 'Attached file';
    return null;
  };

  const MediaIcon = getMediaIcon();
  const mediaName = getMediaName();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <form
        noValidate
        aria-label={isEditMode ? 'Edit campaign form' : 'Create campaign form'}
        className="flex flex-col gap-6"
      >
        {/* Read-only notice for non-editable campaigns */}
        {isReadOnly && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-400"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              This campaign is <strong>{campaign.status}</strong> and cannot be edited. Only{' '}
              <strong>draft</strong> or <strong>scheduled</strong> campaigns can be modified.
            </span>
          </div>
        )}
        {/* API error banner */}
        {apiError && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{apiError}</span>
            <button
              type="button"
              onClick={() => setApiError('')}
              className="text-red-400 hover:text-red-300 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Section: Basic Info ── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Campaign Details
          </legend>

          {/* Campaign Name */}
          <Field id="name" label="Campaign Name" required error={errors.name} icon={Megaphone}>
            <TextInput
              id="name"
              name="name"
              type="text"
              icon
              value={formData.name}
              onChange={handleChange}
              disabled={loading || isReadOnly}
              placeholder="e.g. Summer Sale 2025"
              autoComplete="off"
              error={errors.name}
            />
          </Field>

          {/* Campaign Type */}
          <Field id="type" label="Campaign Type" required error={errors.type} icon={Tag}>
            <SelectInput
              id="type"
              name="type"
              icon
              value={formData.type}
              onChange={handleChange}
              disabled={loading || isReadOnly}
              error={errors.type}
            >
              <option value="" disabled className="bg-slate-800 text-slate-500">
                Select a type…
              </option>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-slate-800 text-white">
                  {t.label}
                </option>
              ))}
            </SelectInput>
            <ChevronDown
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 w-4 h-4 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
          </Field>

          {/* Status – display only (Requirement 4.5: draft by default) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-300">Status</span>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700/40 border border-slate-600">
              <span
                className={[
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                  formData.status === 'draft'
                    ? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                    : formData.status === 'scheduled'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    : formData.status === 'executing'
                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                    : formData.status === 'completed'
                    ? 'bg-green-500/20 text-green-300 border-green-500/30'
                    : formData.status === 'archived'
                    ? 'bg-slate-600/20 text-slate-500 border-slate-600/30'
                    : formData.status === 'cancelled'
                    ? 'bg-red-500/20 text-red-300 border-red-500/30'
                    : 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                ].join(' ')}
              >
                {formData.status
                  ? formData.status.charAt(0).toUpperCase() + formData.status.slice(1)
                  : 'Draft'}
              </span>
              <span className="text-xs text-slate-500">
                {formData.status === 'draft'
                  ? 'Campaign is saved but not yet scheduled or sent.'
                  : formData.status === 'scheduled'
                  ? 'Campaign is scheduled for future execution.'
                  : formData.status === 'executing'
                  ? 'Campaign is currently being executed.'
                  : formData.status === 'completed'
                  ? 'Campaign has finished execution.'
                  : formData.status === 'archived'
                  ? 'Campaign has been archived.'
                  : formData.status === 'cancelled'
                  ? 'Campaign was cancelled.'
                  : 'Campaign is saved but not yet scheduled or sent.'}
              </span>
            </div>
          </div>
        </fieldset>

        {/* ── Section: Target Segment ── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Target Audience
          </legend>

          <Field
            id="targetSegment"
            label="Target Segment"
            required
            error={errors.targetSegment || segmentsError}
            icon={Users}
            hint="Select a segment to see the estimated recipient count."
          >
            <SelectInput
              id="targetSegment"
              name="targetSegment"
              icon
              value={formData.targetSegment}
              onChange={handleChange}
              disabled={loading || segmentsLoading || isReadOnly}
              error={errors.targetSegment || segmentsError}
            >
              <option value="" disabled className="bg-slate-800 text-slate-500">
                {segmentsLoading ? 'Loading segments…' : 'Select a segment…'}
              </option>
              {segments.map((seg) => (
                <option key={seg._id} value={seg._id} className="bg-slate-800 text-white">
                  {seg.name}
                  {seg.contactCount !== undefined ? ` (${seg.contactCount.toLocaleString()} contacts)` : ''}
                </option>
              ))}
            </SelectInput>
            <ChevronDown
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 w-4 h-4 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
          </Field>

          {/* Estimated recipients badge */}
          {estimatedRecipients !== null && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
              <Users className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="text-sm text-indigo-300">
                Estimated recipients:{' '}
                <span className="font-semibold text-indigo-200">
                  {estimatedRecipients.toLocaleString()}
                </span>
              </span>
            </div>
          )}
        </fieldset>

        {/* ── Section: Message Template ── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Message
          </legend>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">
              Message Template
              <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>
            </label>
            <MessageTemplateEditor
              template={formData.messageTemplate}
              onChange={(val) => {
                setFormData((prev) => ({ ...prev, messageTemplate: val }));
                if (errors.messageTemplate) setErrors((prev) => ({ ...prev, messageTemplate: '' }));
              }}
              availableVariables={AVAILABLE_VARIABLES}
              onPreview={() => setShowPreview(true)}
              disabled={loading || isReadOnly}
              error={errors.messageTemplate}
            />
          </div>
        </fieldset>

        {/* ── Section: Media Attachment ── */}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Media Attachment
          </legend>

          {mediaName ? (
            /* Attached file display */
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-700/40 border border-slate-600 rounded-lg">
              {MediaIcon && <MediaIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />}
              <span className="flex-1 text-sm text-slate-300 truncate">{mediaName}</span>
              {mediaFile && (
                <span className="text-xs text-slate-500 flex-shrink-0">
                  {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  disabled={loading}
                  className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : !isReadOnly ? (
            /* File upload area */
            <label
              htmlFor="mediaFile"
              className={[
                'flex flex-col items-center justify-center gap-2 px-4 py-6',
                'border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                errors.mediaFile
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-slate-600 hover:border-indigo-500/50 bg-slate-700/20 hover:bg-indigo-500/5',
                loading ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <Upload className="w-6 h-6 text-slate-500" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm text-slate-400">
                  <span className="text-indigo-400 font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Images (JPEG, PNG) or PDF — max 5 MB
                </p>
              </div>
              <input
                id="mediaFile"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={handleFileChange}
                disabled={loading}
                className="sr-only"
                aria-label="Upload media attachment"
              />
            </label>
          ) : (
            /* No media in read-only mode */
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-700/20 border border-slate-700 rounded-lg">
              <span className="text-sm text-slate-500 italic">No media attachment</span>
            </div>
          )}

          {errors.mediaFile && (
            <p role="alert" className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors.mediaFile}
            </p>
          )}
        </fieldset>

        {/* ── Section: Schedule ── */}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Schedule
          </legend>
          <p className="text-xs text-slate-500">
            Leave blank to save as draft. Must be a future date/time to schedule.
          </p>

          {/* AI Best Time to Send */}
          {!isReadOnly && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGetBestTime}
                disabled={bestTimeLoading || loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/60 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed w-fit"
              >
                {bestTimeLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                AI: Best Time to Send
              </button>

              {bestTimeError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {bestTimeError}
                </p>
              )}

              {bestTimeResults && (
                <div className="bg-slate-900/60 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">AI Recommendations</p>
                  </div>
                  {bestTimeResults.note && (
                    <p className="text-xs text-slate-500 italic">{bestTimeResults.note}</p>
                  )}
                  <div className="space-y-2">
                    {(bestTimeResults.recommendations || []).map((rec, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyBestTime(rec)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/40 transition-all text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400" />
                          <span className="text-sm text-white">{rec.day}</span>
                          <span className="text-sm text-slate-400">at {rec.time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            i === 0 ? 'bg-emerald-500/20 text-emerald-400' :
                            i === 1 ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-600/40 text-slate-400'
                          }`}>{rec.label}</span>
                          <span className="text-xs text-slate-500 tabular-nums">{Math.round((rec.score || 0) * 100)}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600">Click a recommendation to apply it to the scheduler below.</p>
                </div>
              )}
            </div>
          )}

          <CampaignScheduler
            initialValue={formData.scheduledAt}
            onScheduledAtChange={(isoString) => {
              const val = isoString ? toLocalDatetime(new Date(isoString)) : '';
              setFormData((prev) => ({ ...prev, scheduledAt: val }));
              if (errors.scheduledAt) setErrors((prev) => ({ ...prev, scheduledAt: '' }));
            }}
            disabled={loading || isReadOnly}
          />
          {errors.scheduledAt && (
            <p id="scheduledAt-error" role="alert" className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors.scheduledAt}
            </p>
          )}
        </fieldset>

        {/* ── Form Actions ── */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-700">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReadOnly ? 'Close' : 'Cancel'}
          </button>

          {/* Clone button – always available in edit mode so users can duplicate any campaign */}
          {isEditMode && (
            <CampaignCloner
              campaignId={campaign._id}
              campaignName={campaign.name}
              onCloned={(cloned) => onSubmit?.(cloned)}
              variant="button"
              disabled={loading}
            />
          )}

          {!isReadOnly && (
            <div className="flex items-center gap-3">
              {/* Save as Draft */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-4 h-4" aria-hidden="true" />
                )}
                Save as Draft
              </button>

              {/* Schedule / Submit */}
              <button
                type="button"
                onClick={handleSchedule}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                    <span>{formData.scheduledAt ? 'Schedule Campaign' : 'Submit Campaign'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Template preview modal */}
      {showPreview && (
        <TemplatePreview
          template={formData.messageTemplate}
          mediaAttachment={mediaFile ? { type: mediaFile.type, filename: mediaFile.name } : existingMedia}
          isModal
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
};

export default CampaignForm;
