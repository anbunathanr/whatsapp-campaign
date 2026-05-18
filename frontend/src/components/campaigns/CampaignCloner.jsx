import { useState, useCallback } from 'react';
import { Copy, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import campaignService from '../../services/campaignService';

// ─── Confirm Modal ────────────────────────────────────────────────────────────

const ConfirmModal = ({ campaignName, onConfirm, onCancel, loading }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="clone-modal-title"
  >
    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div
          className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0"
          aria-hidden="true"
        >
          <Copy className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3
            id="clone-modal-title"
            className="text-white font-semibold text-base"
          >
            Clone campaign?
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            A new draft copy of{' '}
            <span className="text-slate-200 font-medium">"{campaignName}"</span>{' '}
            will be created. You can then edit and schedule it independently.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end px-5 pb-5">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          aria-busy={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Copy className="w-4 h-4" aria-hidden="true" />
          )}
          {loading ? 'Cloning…' : 'Clone'}
        </button>
      </div>
    </div>
  </div>
);

// ─── CampaignCloner ───────────────────────────────────────────────────────────

/**
 * CampaignCloner – a self-contained clone button with confirmation modal,
 * inline feedback, and optional success/error callbacks.
 *
 * Usage:
 *   <CampaignCloner
 *     campaignId={campaign._id}
 *     campaignName={campaign.name}
 *     onCloned={(clonedCampaign) => { ... }}
 *     variant="icon"        // "icon" | "button" | "menu-item"
 *   />
 *
 * @param {Object}   props
 * @param {string}   props.campaignId    - ID of the campaign to clone.
 * @param {string}   props.campaignName  - Display name used in the confirmation dialog.
 * @param {Function} [props.onCloned]    - Called with the new campaign object on success.
 * @param {Function} [props.onError]     - Called with the error message on failure.
 * @param {"icon"|"button"|"menu-item"} [props.variant="button"] - Visual style.
 * @param {boolean}  [props.disabled]    - Disable the trigger button.
 * @param {string}   [props.className]   - Extra classes for the trigger button.
 */
const CampaignCloner = ({
  campaignId,
  campaignName,
  onCloned,
  onError,
  variant = 'button',
  disabled = false,
  className = '',
}) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Clone action ───────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const cloned = await campaignService.cloneCampaign(campaignId);
      setShowModal(false);
      setSuccessMsg(`"${campaignName}" was cloned as a new draft.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      onCloned?.(cloned);
    } catch (err) {
      const msg = err?.response?.data?.message ?? err.message ?? 'Clone failed. Please try again.';
      setErrorMsg(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [campaignId, campaignName, onCloned, onError]);

  const handleCancel = useCallback(() => {
    if (!loading) {
      setShowModal(false);
      setErrorMsg('');
    }
  }, [loading]);

  // ── Trigger button variants ────────────────────────────────────────────────
  const renderTrigger = () => {
    const isDisabled = disabled || loading;

    if (variant === 'icon') {
      return (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={isDisabled}
          title="Clone campaign"
          aria-label={`Clone ${campaignName}`}
          className={[
            'p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
        >
          <Copy className="w-4 h-4" aria-hidden="true" />
        </button>
      );
    }

    if (variant === 'menu-item') {
      return (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={isDisabled}
          role="menuitem"
          className={[
            'w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white',
            'hover:bg-slate-700 rounded-lg transition-colors text-left',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          ].join(' ')}
        >
          <Copy className="w-4 h-4 text-blue-400 flex-shrink-0" aria-hidden="true" />
          Clone campaign
        </button>
      );
    }

    // Default: "button" variant
    return (
      <button
        type="button"
        onClick={() => setShowModal(true)}
        disabled={isDisabled}
        className={[
          'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
          'text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-400/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        ].join(' ')}
        aria-label={`Clone ${campaignName}`}
      >
        <Copy className="w-4 h-4" aria-hidden="true" />
        Clone
      </button>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {renderTrigger()}

      {/* Inline success toast */}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-slate-800 border border-green-500/30 text-green-400 rounded-xl px-4 py-3 text-sm shadow-2xl max-w-sm"
        >
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1">{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="text-green-500 hover:text-green-300 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline error toast */}
      {errorMsg && !showModal && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-slate-800 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm shadow-2xl max-w-sm"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-500 hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmation modal */}
      {showModal && (
        <ConfirmModal
          campaignName={campaignName}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          loading={loading}
          errorMsg={errorMsg}
        />
      )}
    </>
  );
};

export default CampaignCloner;
