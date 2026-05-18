import { useState, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Trash2,
  Edit2,
  Tag,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Users,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import useContacts from '../../hooks/useContacts';

// ─── Industry badge colours ───────────────────────────────────────────────────
const INDUSTRY_COLORS = {
  Technology: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Healthcare: 'bg-green-500/20 text-green-300 border-green-500/30',
  Finance: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Education: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Retail: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Manufacturing: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Real Estate': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  Hospitality: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  Transportation: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Energy: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Agriculture: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
  Construction: 'bg-stone-500/20 text-stone-300 border-stone-500/30',
  Media: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Telecommunications: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Automotive: 'bg-red-500/20 text-red-300 border-red-500/30',
  Aerospace: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  Pharmaceuticals: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Food & Beverage': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Fashion: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  Entertainment: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Legal: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Consulting: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Insurance: 'bg-green-500/20 text-green-300 border-green-500/30',
  Banking: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'E-commerce': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Logistics: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Marketing: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'Non-Profit': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  Other: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const getIndustryColor = (industry) =>
  INDUSTRY_COLORS[industry] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline loading spinner */
const Spinner = ({ size = 'md' }) => {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  return <Loader2 className={`${sz} animate-spin text-indigo-400`} />;
};

/** Sort icon for column headers */
const SortIcon = ({ field, sortBy, sortOrder }) => {
  if (sortBy !== field) return <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />;
  return sortOrder === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
    : <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />;
};

/** Confirmation modal for destructive actions */
const ConfirmModal = ({ title, message, onConfirm, onCancel, loading }) => (
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
          className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Spinner size="sm" />}
          Delete
        </button>
      </div>
    </div>
  </div>
);

/** Bulk tag assignment modal */
const BulkTagModal = ({ selectedCount, onConfirm, onCancel, loading }) => {
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-base">
            Assign Tags to {selectedCount} Contact{selectedCount !== 1 ? 's' : ''}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-2">
            Enter tags (press Enter or comma to add)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. vip, prospect"
              className="flex-1 bg-slate-700 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={addTag}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(tags)}
            disabled={loading || tags.length === 0}
            className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Spinner size="sm" />}
            <Check className="w-4 h-4" />
            Assign Tags
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main ContactList component ───────────────────────────────────────────────

/**
 * ContactList component
 *
 * @param {Object} props
 * @param {import('../../hooks/useContacts').FilterCriteria} props.filters - Active filter criteria
 * @param {(contact: Object) => void} props.onContactSelect - Called when a contact row is clicked
 * @param {(action: string, contactIds: string[]) => void} props.onBulkAction - Called after bulk actions complete
 */
const ContactList = ({ filters = {}, onContactSelect, onBulkAction }) => {
  const {
    contacts,
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
    deleteContact,
    bulkDelete,
    bulkTag,
    refresh,
  } = useContacts({ filters });

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modal state
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name } | 'bulk'
  const [showTagModal, setShowTagModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c._id));
  const someSelected = contacts.some((c) => selectedIds.has(c._id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c._id)));
    }
  }, [allSelected, contacts]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  // ── Delete handlers ────────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      if (deleteTarget === 'bulk') {
        const ids = [...selectedIds];
        await bulkDelete(ids);
        onBulkAction?.('bulk-delete', ids);
        clearSelection();
      } else {
        await deleteContact(deleteTarget.id);
        onBulkAction?.('delete', [deleteTarget.id]);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.id);
          return next;
        });
      }
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err.message ?? 'Delete failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Tag handlers ───────────────────────────────────────────────────────────
  const handleTagConfirm = async (tags) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const ids = [...selectedIds];
      await bulkTag(ids, tags);
      onBulkAction?.('bulk-tag', ids);
      setShowTagModal(false);
    } catch (err) {
      setActionError(err?.response?.data?.message ?? err.message ?? 'Tag assignment failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Column definitions ─────────────────────────────────────────────────────
  const sortableColumns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'phone', label: 'Phone', sortable: false },
    { key: 'jobTitle', label: 'Job Title', sortable: false },
    { key: 'company', label: 'Company', sortable: false },
    { key: 'industry', label: 'Industry', sortable: true },
    { key: 'tags', label: 'Tags', sortable: false },
    { key: 'location', label: 'Location', sortable: false },
    { key: 'actions', label: 'Actions', sortable: false },
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatLocation = (location) => {
    if (!location) return '—';
    const parts = [location.city, location.state, location.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  };

  const selectedCount = selectedIds.size;

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

      {/* Bulk action toolbar */}
      {selectedCount > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-3 bg-indigo-600/10 border border-indigo-500/30 rounded-lg px-4 py-2.5">
          <span className="text-indigo-300 text-sm font-medium">
            {selectedCount} contact{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setShowTagModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 rounded-lg text-sm transition-colors"
          >
            <Tag className="w-4 h-4" />
            Assign Tags
          </button>
          <button
            onClick={() => setDeleteTarget('bulk')}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
          </button>
          <button
            onClick={clearSelection}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table container */}
      <div className="flex-1 overflow-auto mx-4 mt-4 rounded-xl border border-slate-700 custom-scrollbar">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700">
            <tr>
              {/* Checkbox column */}
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-800 cursor-pointer"
                  aria-label="Select all contacts"
                />
              </th>

              {sortableColumns.map((col) => (
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
                <td colSpan={sortableColumns.length + 1} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Spinner size="lg" />
                    <span className="text-sm">Loading contacts…</span>
                  </div>
                </td>
              </tr>
            )}

            {/* Error state */}
            {!loading && error && (
              <tr>
                <td colSpan={sortableColumns.length + 1} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium">Failed to load contacts</p>
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
            {!loading && !error && contacts.length === 0 && (
              <tr>
                <td colSpan={sortableColumns.length + 1} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                      <Users className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium">No contacts found</p>
                      <p className="text-slate-500 text-xs mt-1">
                        Try adjusting your filters or import contacts to get started.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading && !error && contacts.map((contact) => {
              const isSelected = selectedIds.has(contact._id);
              return (
                <tr
                  key={contact._id}
                  className={[
                    'group transition-colors',
                    isSelected
                      ? 'bg-indigo-600/5 hover:bg-indigo-600/10'
                      : 'hover:bg-slate-800/60',
                  ].join(' ')}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(contact._id)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-800 cursor-pointer"
                      aria-label={`Select ${contact.name}`}
                    />
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onContactSelect?.(contact)}
                      className="text-left group/name"
                    >
                      <span className="text-slate-200 font-medium group-hover/name:text-indigo-300 transition-colors">
                        {contact.name || '—'}
                      </span>
                    </button>
                  </td>

                  {/* Phone (E.164) */}
                  <td className="px-4 py-3">
                    <span className="text-slate-400 font-mono text-xs">
                      {contact.phone || '—'}
                    </span>
                  </td>

                  {/* Job Title */}
                  <td className="px-4 py-3">
                    <span className="text-slate-400">{contact.jobTitle || '—'}</span>
                  </td>

                  {/* Company */}
                  <td className="px-4 py-3">
                    <span className="text-slate-300">{contact.company || '—'}</span>
                  </td>

                  {/* Industry badge */}
                  <td className="px-4 py-3">
                    {contact.industry ? (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getIndustryColor(contact.industry)}`}
                      >
                        {contact.industry}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {contact.tags && contact.tags.length > 0 ? (
                        <>
                          {contact.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs border border-slate-600"
                            >
                              {tag}
                            </span>
                          ))}
                          {contact.tags.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-slate-700/50 text-slate-500 rounded-full text-xs border border-slate-700">
                              +{contact.tags.length - 3}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </div>
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3">
                    <span className="text-slate-400 text-xs">{formatLocation(contact.location)}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onContactSelect?.(contact)}
                        title="Edit contact"
                        className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors"
                        aria-label={`Edit ${contact.name}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: contact._id, name: contact.name })}
                        title="Delete contact"
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        aria-label={`Delete ${contact.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
              {[10, 20, 50, 100].map((n) => (
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
              disabled={page === totalPages}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Last page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <ConfirmModal
          title={deleteTarget === 'bulk' ? `Delete ${selectedCount} contacts?` : 'Delete contact?'}
          message={
            deleteTarget === 'bulk'
              ? `This will permanently delete ${selectedCount} selected contact${selectedCount !== 1 ? 's' : ''}. This action cannot be undone.`
              : `This will permanently delete "${deleteTarget.name}". This action cannot be undone.`
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={actionLoading}
        />
      )}

      {/* Bulk tag modal */}
      {showTagModal && (
        <BulkTagModal
          selectedCount={selectedCount}
          onConfirm={handleTagConfirm}
          onCancel={() => setShowTagModal(false)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default ContactList;
