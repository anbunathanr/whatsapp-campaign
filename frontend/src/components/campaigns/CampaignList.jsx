import { useState, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Megaphone,
  Loader2,
  X,
  Copy,
  Archive,
  Eye,
  Calendar,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  FileText,
} from 'lucide-react';
import useCampaigns from '../../hooks/useCampaigns';
import { formatDateTime } from '../../utils/formatters';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    icon: FileText,
    className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
  scheduled: {
    label: 'Scheduled',
    icon: Clock,
    className: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  executing: {
    label: 'Executing',
    icon: Play,
    className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    className: 'bg-slate-600/20 text-slate-500 border-slate-600/30',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    className: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
};

const getStatusConfig = (status) =>
  STATUS_CONFIG[status] ?? {
    label: status ?? 'Unknown',
    icon: PauseCircle,
    className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  };

// ─── Campaign type labels ─────────────────────────────────────────────────────

const TYPE_LABELS = {
  promotional: 'Promotional',
  reminder: 'Reminder',
  festival: 'Festival',
  product_launch: 'Product Launch',
  follow_up: 'Follow-up',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Spinner = ({ size = 'md' }) => {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  return <Loader2 className={`${sz} animate-spin text-indigo-400`} />;
};

const SortIcon = ({ field, sortBy, sortOrder }) => {
  if (sortBy !== field) return <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />;
  return sortOrder === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
    : <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />;
};

const ConfirmModal = ({ title, message, confirmLabel = 'Confirm', confirmClass = 'bg-red-600 hover:bg-red-500', onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-base">{title}</h3>
          <p className="text-slate-400 text-sm mt-1">{message}</p>
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${confirmClass}`}
        >
          {loading && <Spinner size="sm" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

/** Delivery rate mini-bar */
const DeliveryBar = ({ sent, delivered, failed }) => {
  if (!sent || sent === 0) return <span className="text-slate-600 text-xs">—</span>;
  const deliveredPct = Math.round((delivered / sent) * 100);
  const failedPct = Math.round((failed / sent) * 100);
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full"
            style={{ width: `${deliveredPct}%` }}
          />
        </div>
        <span className="text-xs text-slate-400 w-8 text-right">{deliveredPct}%</span>
      </div>
      {failedPct > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 rounded-full"
              style={{ width: `${failedPct}%` }}
            />
          </div>
          <span className="text-xs text-red-400 w-8 text-right">{failedPct}%</span>
        </div>
      )}
    </div>
  );
};

// ─── Main CampaignList component ──────────────────────────────────────────────

/**
 * CampaignList component
 *
 * @param {Object}   props
 * @param {Object}   [props.filters]           - Active filter criteria passed from parent
 * @param {Function} [props.onCampaignSelect]  - Called when a campaign row is clicked for editing
 * @param {Function} [props.onCreateCampaign]  - Called when the "New Campaign" button is clicked
 */
const CampaignList = ({ filters = {}, onCampaignSelect, onCreateCampaign }) => {
  const {
    campaigns,
    loading,
    error,
    page,
    pageSize,
    total,
    totalPages,
    sortBy,
    sortOrder,
    setPage,
    setPageSize,
    handleSort,
    archiveCampaign,
    cloneCampaign,
    refresh,
  } = useCampaigns({ filters });

  // Modal state
  const [archiveTarget, setArchiveTarget] = useState(null); // { id, name }
  const [cloneTarget, setCloneTarget] = useState(null);     // { id, name }
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // ── Archive handler ────────────────────────────────────────────────────────
  const handleArchiveConfirm = useCallback(async () => {
    if (!archiveTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await archiveCampaign(archiveTarget.id);
      setActionSuccess(`"${archiveTarget.name}" has been archived.`);
      setArchiveTarget(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err.message ?? 'Archive failed');
    } finally {
      setActionLoading(false);
    }
  }, [archiveTarget, archiveCampaign]);

  // ── Clone handler ──────────────────────────────────────────────────────────
  const handleCloneConfirm = useCallback(async () => {
    if (!cloneTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await cloneCampaign(cloneTarget.id);
      setActionSuccess(`"${cloneTarget.name}" has been cloned as a new draft.`);
      setCloneTarget(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err.message ?? 'Clone failed');
    } finally {
      setActionLoading(false);
    }
  }, [cloneTarget, cloneCampaign]);

  // ── Column definitions ─────────────────────────────────────────────────────
  const columns = [
    { key: 'name',        label: 'Campaign',       sortable: true  },
    { key: 'type',        label: 'Type',           sortable: true  },
    { key: 'status',      label: 'Status',         sortable: true  },
    { key: 'recipients',  label: 'Recipients',     sortable: false },
    { key: 'delivery',    label: 'Delivery',       sortable: false },
    { key: 'scheduledAt', label: 'Scheduled',      sortable: true  },
    { key: 'createdAt',   label: 'Created',        sortable: true  },
    { key: 'actions',     label: '',               sortable: false },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Action error banner */}
      {actionError && (
        <div className="mx-4 mt-4 flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="hover:text-red-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action success banner */}
      {actionSuccess && (
        <div className="mx-4 mt-4 flex items-center gap-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="hover:text-green-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table container */}
      <div className="flex-1 overflow-auto mx-4 mt-4 rounded-xl border border-slate-700 custom-scrollbar">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap',
                    col.sortable ? 'cursor-pointer select-none hover:text-slate-200 transition-colors' : '',
                  ].join(' ')}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    {col.label}
                    {col.sortable && (
                      <SortIcon field={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-700/50">

            {/* Loading state */}
            {loading && (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Spinner size="lg" />
                    <span className="text-sm">Loading campaigns…</span>
                  </div>
                </td>
              </tr>
            )}

            {/* Error state */}
            {!loading && error && (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium">Failed to load campaigns</p>
                      <p className="text-slate-500 text-xs mt-1">{error}</p>
                    </div>
                    <button
                      onClick={refresh}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Empty state */}
            {!loading && !error && campaigns.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                      <Megaphone className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium">No campaigns found</p>
                      <p className="text-slate-500 text-xs mt-1">
                        Try adjusting your filters or create a new campaign to get started.
                      </p>
                    </div>
                    {onCreateCampaign && (
                      <button
                        onClick={onCreateCampaign}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
                      >
                        Create Campaign
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading && !error && campaigns.map((campaign) => {
              const statusCfg = getStatusConfig(campaign.status);
              const StatusIcon = statusCfg.icon;
              const isArchivable = !['archived', 'executing'].includes(campaign.status);

              return (
                <tr
                  key={campaign._id}
                  className="group hover:bg-slate-800/60 transition-colors"
                >
                  {/* Campaign name + segment */}
                  <td className="px-4 py-3 max-w-[220px]">
                    <button
                      onClick={() => onCampaignSelect?.(campaign)}
                      className="text-left group/name w-full"
                    >
                      <p className="text-slate-200 font-medium truncate group-hover/name:text-indigo-300 transition-colors">
                        {campaign.name || '—'}
                      </p>
                      {campaign.targetSegment?.name && (
                        <p className="text-slate-500 text-xs mt-0.5 truncate">
                          {campaign.targetSegment.name}
                        </p>
                      )}
                    </button>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-slate-400 text-xs">
                      {TYPE_LABELS[campaign.type] ?? campaign.type ?? '—'}
                    </span>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {statusCfg.label}
                    </span>
                  </td>

                  {/* Recipients */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-slate-300 text-xs font-medium">
                        {(campaign.actualRecipients ?? campaign.estimatedRecipients ?? 0).toLocaleString()}
                      </span>
                      {campaign.actualRecipients !== undefined && campaign.estimatedRecipients > 0 && (
                        <span className="text-slate-600 text-xs">
                          of {campaign.estimatedRecipients.toLocaleString()} est.
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Delivery bar */}
                  <td className="px-4 py-3">
                    <DeliveryBar
                      sent={campaign.messagesSent}
                      delivered={campaign.messagesDelivered}
                      failed={campaign.messagesFailed}
                    />
                  </td>

                  {/* Scheduled at */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {campaign.scheduledAt ? (
                      <span className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        {formatDateTime(campaign.scheduledAt)}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Created at */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-slate-500 text-xs">
                      {formatDateTime(campaign.createdAt)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* View / Edit */}
                      <button
                        onClick={() => onCampaignSelect?.(campaign)}
                        title="View / Edit campaign"
                        className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                        aria-label={`Edit ${campaign.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Clone */}
                      <button
                        onClick={() => setCloneTarget({ id: campaign._id, name: campaign.name })}
                        title="Clone campaign"
                        className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                        aria-label={`Clone ${campaign.name}`}
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* Archive */}
                      {isArchivable && (
                        <button
                          onClick={() => setArchiveTarget({ id: campaign._id, name: campaign.name })}
                          title="Archive campaign"
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                          aria-label={`Archive ${campaign.name}`}
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 flex-shrink-0">
          {/* Items per page */}
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Page info */}
          <span className="text-sm text-slate-400">
            {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of{' '}
            <span className="text-slate-300 font-medium">{total.toLocaleString()}</span>
          </span>

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="First page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page number buttons */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={[
                    'w-8 h-8 text-sm rounded-lg transition-colors',
                    pageNum === page
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
                  ].join(' ')}
                  aria-label={`Page ${pageNum}`}
                  aria-current={pageNum === page ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages || totalPages === 0}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Last page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Archive confirmation modal */}
      {archiveTarget && (
        <ConfirmModal
          title="Archive campaign?"
          message={`"${archiveTarget.name}" will be archived and removed from active campaigns. You can still view it in the archived filter.`}
          confirmLabel="Archive"
          confirmClass="bg-amber-600 hover:bg-amber-500"
          onConfirm={handleArchiveConfirm}
          onCancel={() => setArchiveTarget(null)}
          loading={actionLoading}
        />
      )}

      {/* Clone confirmation modal */}
      {cloneTarget && (
        <ConfirmModal
          title="Clone campaign?"
          message={`A new draft copy of "${cloneTarget.name}" will be created. You can then edit and schedule it independently.`}
          confirmLabel="Clone"
          confirmClass="bg-blue-600 hover:bg-blue-500"
          onConfirm={handleCloneConfirm}
          onCancel={() => setCloneTarget(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default CampaignList;
