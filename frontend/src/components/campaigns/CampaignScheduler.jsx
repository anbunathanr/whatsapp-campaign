import { useState, useEffect, useCallback, useId } from 'react';
import {
  X,
  Calendar,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  CalendarClock,
  Info,
} from 'lucide-react';
import campaignService from '../../services/campaignService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the minimum allowed datetime-local value: 1 minute from now.
 * Format: "YYYY-MM-DDTHH:mm"
 */
const getMinDateTime = () => {
  const d = new Date(Date.now() + 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Formats a datetime-local string (YYYY-MM-DDTHH:mm) into a human-readable
 * string using the user's local timezone.
 * @param {string} value
 * @returns {string}
 */
const formatLocalDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

/**
 * Returns a human-readable "time from now" string.
 * @param {string} value - datetime-local string
 * @returns {string}
 */
const getTimeFromNow = (value) => {
  if (!value) return '';
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return 'in the past';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0
      ? `in ${days}d ${remainingHours}h`
      : `in ${days} day${days !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    const remainingMins = minutes % 60;
    return remainingMins > 0
      ? `in ${hours}h ${remainingMins}m`
      : `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
};

/**
 * Validates the scheduled datetime value.
 * @param {string} value - datetime-local string
 * @returns {string} Error message, or empty string if valid.
 */
const validateScheduledAt = (value) => {
  if (!value) return 'Please select a date and time.';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Invalid date or time.';
  if (d.getTime() <= Date.now()) return 'Scheduled time must be in the future.';
  return '';
};

// ─── Quick-pick presets ───────────────────────────────────────────────────────

const QUICK_PICKS = [
  { label: '1 hour',   offsetMs: 60 * 60 * 1000 },
  { label: '3 hours',  offsetMs: 3 * 60 * 60 * 1000 },
  { label: 'Tomorrow 9 AM', offsetMs: null, fn: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }},
  { label: 'Next Monday 9 AM', offsetMs: null, fn: () => {
    const d = new Date();
    const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
    return d;
  }},
];

/**
 * Converts a Date to a datetime-local input value string (YYYY-MM-DDTHH:mm).
 * @param {Date} d
 * @returns {string}
 */
const toDatetimeLocal = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── CampaignScheduler ────────────────────────────────────────────────────────

/**
 * CampaignScheduler – a modal dialog for scheduling a campaign.
 *
 * Supports two modes:
 *  1. **Standalone scheduling** (`campaign` prop provided, no `onScheduledAtChange`):
 *     Calls `POST /api/campaigns/:id/schedule` directly and reports success/failure.
 *  2. **Embedded / controlled** (`onScheduledAtChange` prop provided):
 *     Acts as a date/time picker widget inside a parent form (e.g. CampaignForm).
 *     Does NOT call the API itself; instead calls `onScheduledAtChange(isoString)`.
 *
 * @param {Object}    props
 * @param {Object}    [props.campaign]              - Campaign to schedule (standalone mode).
 * @param {string}    [props.initialValue]          - Pre-filled datetime-local string.
 * @param {Function}  [props.onScheduledAtChange]   - Controlled mode callback (ISO string | null).
 * @param {Function}  [props.onScheduled]           - Called after successful API schedule (standalone).
 * @param {Function}  [props.onClose]               - Called when the modal should close.
 * @param {boolean}   [props.disabled]              - Disables all inputs.
 */
const CampaignScheduler = ({
  campaign,
  initialValue = '',
  onScheduledAtChange,
  onScheduled,
  onClose,
  disabled = false,
}) => {
  const isControlled = typeof onScheduledAtChange === 'function';
  const isStandalone = !isControlled && Boolean(campaign?._id);

  const inputId = useId();
  const errorId = useId();

  // ── State ──────────────────────────────────────────────────────────────────
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (initialValue) return initialValue;
    if (campaign?.scheduledAt) {
      return toDatetimeLocal(new Date(campaign.scheduledAt));
    }
    return '';
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Keep min updated every minute so it stays accurate
  const [minDateTime, setMinDateTime] = useState(getMinDateTime);
  useEffect(() => {
    const id = setInterval(() => setMinDateTime(getMinDateTime()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setScheduledAt(val);
    setError('');
    setSuccess(false);

    if (isControlled) {
      // Propagate ISO string (or null if cleared) to parent
      onScheduledAtChange(val ? new Date(val).toISOString() : null);
    }
  }, [isControlled, onScheduledAtChange]);

  const handleQuickPick = useCallback((preset) => {
    let d;
    if (preset.fn) {
      d = preset.fn();
    } else {
      d = new Date(Date.now() + preset.offsetMs);
    }
    // Round down to the minute
    d.setSeconds(0, 0);
    const val = toDatetimeLocal(d);
    setScheduledAt(val);
    setError('');
    setSuccess(false);

    if (isControlled) {
      onScheduledAtChange(d.toISOString());
    }
  }, [isControlled, onScheduledAtChange]);

  const handleClear = useCallback(() => {
    setScheduledAt('');
    setError('');
    setSuccess(false);
    if (isControlled) {
      onScheduledAtChange(null);
    }
  }, [isControlled, onScheduledAtChange]);

  // Standalone: call the API
  const handleSchedule = useCallback(async () => {
    const validationError = validateScheduledAt(scheduledAt);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const isoString = new Date(scheduledAt).toISOString();
      const updated = await campaignService.scheduleCampaign(campaign._id, isoString);
      setSuccess(true);
      onScheduled?.(updated);
    } catch (err) {
      const msg =
        err?.response?.data?.message ?? err.message ?? 'Failed to schedule campaign.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [campaign, scheduledAt, onScheduled]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const humanReadable = formatLocalDateTime(scheduledAt);
  const timeFromNow = getTimeFromNow(scheduledAt);
  const isInPast = scheduledAt
    ? new Date(scheduledAt).getTime() <= Date.now()
    : false;

  // ── Render: controlled / embedded mode ────────────────────────────────────
  if (isControlled) {
    return (
      <div className="flex flex-col gap-3">
        {/* Quick picks */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick schedule presets">
          {QUICK_PICKS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleQuickPick(preset)}
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-600 bg-slate-700/50 text-slate-300 hover:border-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date/time input */}
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 z-10"
            aria-hidden="true"
          >
            <Calendar className="w-4 h-4" />
          </span>
          <input
            id={inputId}
            type="datetime-local"
            value={scheduledAt}
            onChange={handleChange}
            min={minDateTime}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className={[
              'w-full rounded-lg bg-slate-700/60 border py-2.5 pl-10 pr-10 text-sm text-white',
              'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
              'disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:dark]',
              error ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
            ].join(' ')}
          />
          {scheduledAt && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Clear scheduled time"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </p>
        )}

        {/* Human-readable confirmation */}
        {scheduledAt && !error && (
          <div
            className={[
              'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border',
              isInPast
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300',
            ].join(' ')}
          >
            <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">{humanReadable}</span>
              {!isInPast && (
                <span className="text-blue-400/70 ml-1.5">({timeFromNow})</span>
              )}
              {isInPast && (
                <span className="ml-1.5">— this time is in the past</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: standalone modal mode ──────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheduler-title"
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2
            id="scheduler-title"
            className="text-white font-semibold text-base flex items-center gap-2"
          >
            <CalendarClock className="w-4 h-4 text-indigo-400" />
            Schedule Campaign
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              aria-label="Close scheduler"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-5">

          {/* Campaign info */}
          {campaign && (
            <div className="flex items-start gap-3 px-3 py-2.5 bg-slate-700/40 border border-slate-600/50 rounded-lg">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-slate-300 font-medium truncate">{campaign.name}</p>
                {campaign.targetSegment?.name && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Segment: {campaign.targetSegment.name}
                    {campaign.estimatedRecipients > 0 && (
                      <span className="ml-1">
                        ({campaign.estimatedRecipients.toLocaleString()} recipients)
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Success state */}
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-white font-medium">Campaign Scheduled</p>
                <p className="text-slate-400 text-sm mt-1">
                  {humanReadable}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">({timeFromNow})</p>
              </div>
            </div>
          ) : (
            <>
              {/* Quick picks */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                  Quick picks
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Quick schedule presets">
                  {QUICK_PICKS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleQuickPick(preset)}
                      disabled={loading || disabled}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-600 bg-slate-700/50 text-slate-300 hover:border-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date/time input */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={inputId}
                  className="text-sm font-medium text-slate-300"
                >
                  Date &amp; Time
                  <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>
                </label>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 z-10"
                    aria-hidden="true"
                  >
                    <Calendar className="w-4 h-4" />
                  </span>
                  <input
                    id={inputId}
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={handleChange}
                    min={minDateTime}
                    disabled={loading || disabled}
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    className={[
                      'w-full rounded-lg bg-slate-700/60 border py-2.5 pl-10 pr-10 text-sm text-white',
                      'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
                      'disabled:opacity-50 disabled:cursor-not-allowed [color-scheme:dark]',
                      error ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
                    ].join(' ')}
                  />
                  {scheduledAt && !loading && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                      aria-label="Clear scheduled time"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                  </p>
                )}

                {/* Human-readable confirmation */}
                {scheduledAt && !error && (
                  <div
                    className={[
                      'flex items-start gap-2 px-3 py-2 rounded-lg text-xs border mt-1',
                      isInPast
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                    ].join(' ')}
                  >
                    <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium">{humanReadable}</span>
                      {!isInPast && (
                        <span className="text-blue-400/70 ml-1.5">({timeFromNow})</span>
                      )}
                      {isInPast && (
                        <span className="ml-1.5">— this time is in the past</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* UTC note */}
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                Times are shown in your local timezone and stored in UTC.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {success ? 'Close' : 'Cancel'}
            </button>
          )}

          {!success && isStandalone && (
            <button
              type="button"
              onClick={handleSchedule}
              disabled={loading || !scheduledAt || isInPast}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scheduling…
                </>
              ) : (
                <>
                  <CalendarClock className="w-4 h-4" />
                  Schedule Campaign
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignScheduler;
