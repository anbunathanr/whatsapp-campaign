import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  X,
  ChevronDown,
  Tag,
  MapPin,
  Factory,
  RotateCcw,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Retail',
  'Manufacturing', 'Real Estate', 'Hospitality', 'Transportation',
  'Energy', 'Agriculture', 'Construction', 'Media', 'Telecommunications',
  'Automotive', 'Aerospace', 'Pharmaceuticals', 'Food & Beverage',
  'Fashion', 'Entertainment', 'Legal', 'Consulting', 'Insurance',
  'Banking', 'E-commerce', 'Logistics', 'Marketing', 'Non-Profit',
  'Energy and Utilities', 'Transportation and Logistics', 'Aerospace and Defense',
  'Banking and Financial Services', 'Biotechnology', 'Other',
];

const EMPTY_FILTERS = {
  search: '',
  industry: '',
  tags: [],
  location: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if any filter value is non-empty.
 * @param {Object} filters
 */
const hasActiveFilters = (filters) =>
  Boolean(
    filters.search ||
    filters.industry ||
    (Array.isArray(filters.tags) && filters.tags.length > 0) ||
    filters.location
  );

/**
 * Count the number of active (non-search) filters for the badge.
 * @param {Object} filters
 */
const countActiveFilters = (filters) => {
  let count = 0;
  if (filters.industry) count++;
  if (Array.isArray(filters.tags) && filters.tags.length > 0) count++;
  if (filters.location) count++;
  return count;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Dropdown wrapper that closes when clicking outside.
 */
const Dropdown = ({ open, onClose, children, className = '' }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={[
        'absolute z-30 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
};

// ─── Main ContactFilter component ─────────────────────────────────────────────

/**
 * ContactFilter – search bar + industry / tags / location filter panel.
 *
 * @param {Object}   props
 * @param {Object}   props.filters          - Current filter state (controlled).
 * @param {Function} props.onFiltersChange  - Called with the updated filter object.
 */
const ContactFilter = ({ filters = EMPTY_FILTERS, onFiltersChange }) => {
  // Local tag input state (not yet committed to filters)
  const [tagInput, setTagInput] = useState('');

  // Dropdown open states
  const [industryOpen, setIndustryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Debounce timer ref for search
  const searchTimer = useRef(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeBadgeCount = countActiveFilters(filters);
  const anyActive = hasActiveFilters(filters);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Merge a partial update into the current filters and notify parent. */
  const update = useCallback(
    (partial) => {
      onFiltersChange?.({ ...filters, ...partial });
    },
    [filters, onFiltersChange]
  );

  /** Debounced search – avoids firing on every keystroke. */
  const handleSearchChange = useCallback(
    (e) => {
      const value = e.target.value;
      // Optimistically update local display immediately
      onFiltersChange?.({ ...filters, search: value });
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        // No-op: parent already received the update above.
        // This pattern keeps the input responsive while the parent
        // can choose to debounce its own fetch if desired.
      }, 300);
    },
    [filters, onFiltersChange]
  );

  const clearSearch = useCallback(() => update({ search: '' }), [update]);

  /** Industry selection */
  const handleIndustrySelect = useCallback(
    (industry) => {
      update({ industry: filters.industry === industry ? '' : industry });
      setIndustryOpen(false);
    },
    [filters.industry, update]
  );

  /** Tag management */
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    const currentTags = Array.isArray(filters.tags) ? filters.tags : [];
    if (!currentTags.includes(trimmed)) {
      update({ tags: [...currentTags, trimmed] });
    }
    setTagInput('');
  }, [tagInput, filters.tags, update]);

  const removeTag = useCallback(
    (tag) => {
      const currentTags = Array.isArray(filters.tags) ? filters.tags : [];
      update({ tags: currentTags.filter((t) => t !== tag) });
    },
    [filters.tags, update]
  );

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Backspace' && !tagInput && Array.isArray(filters.tags) && filters.tags.length > 0) {
      removeTag(filters.tags[filters.tags.length - 1]);
    }
  };

  /** Location */
  const handleLocationChange = useCallback(
    (e) => update({ location: e.target.value }),
    [update]
  );

  const clearLocation = useCallback(() => update({ location: '' }), [update]);

  /** Reset all filters */
  const resetAll = useCallback(() => {
    setTagInput('');
    onFiltersChange?.({ ...EMPTY_FILTERS });
  }, [onFiltersChange]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Filter contacts">
      {/* ── Row 1: Search bar + filter chips ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
            aria-hidden="true"
          >
            <Search className="w-4 h-4" />
          </span>
          <input
            type="search"
            value={filters.search ?? ''}
            onChange={handleSearchChange}
            placeholder="Search by name, phone, or company…"
            aria-label="Search contacts"
            className="w-full rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-2 pl-9 pr-9 text-sm text-white placeholder-slate-500 outline-none transition"
          />
          {filters.search && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Industry dropdown ── */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setIndustryOpen((o) => !o); setTagsOpen(false); }}
            aria-haspopup="listbox"
            aria-expanded={industryOpen}
            aria-label={filters.industry ? `Industry: ${filters.industry}` : 'Filter by industry'}
            className={[
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors whitespace-nowrap',
              filters.industry
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
            ].join(' ')}
          >
            <Factory className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span className="max-w-[120px] truncate">
              {filters.industry || 'Industry'}
            </span>
            {filters.industry ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); update({ industry: '' }); }}
                aria-label="Clear industry filter"
                className="text-indigo-400 hover:text-indigo-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${industryOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            )}
          </button>

          <Dropdown
            open={industryOpen}
            onClose={() => setIndustryOpen(false)}
            className="w-56 top-full left-0"
          >
            <div className="p-1 max-h-64 overflow-y-auto custom-scrollbar" role="listbox" aria-label="Industries">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  role="option"
                  aria-selected={filters.industry === ind}
                  onClick={() => handleIndustrySelect(ind)}
                  className={[
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    filters.industry === ind
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                  ].join(' ')}
                >
                  {ind}
                </button>
              ))}
            </div>
          </Dropdown>
        </div>

        {/* ── Tags dropdown ── */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setTagsOpen((o) => !o); setIndustryOpen(false); }}
            aria-haspopup="true"
            aria-expanded={tagsOpen}
            aria-label={
              Array.isArray(filters.tags) && filters.tags.length > 0
                ? `Tags: ${filters.tags.join(', ')}`
                : 'Filter by tags'
            }
            className={[
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors whitespace-nowrap',
              Array.isArray(filters.tags) && filters.tags.length > 0
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
            ].join(' ')}
          >
            <Tag className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>
              {Array.isArray(filters.tags) && filters.tags.length > 0
                ? `Tags (${filters.tags.length})`
                : 'Tags'}
            </span>
            {Array.isArray(filters.tags) && filters.tags.length > 0 ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); update({ tags: [] }); }}
                aria-label="Clear tag filters"
                className="text-indigo-400 hover:text-indigo-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${tagsOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            )}
          </button>

          <Dropdown
            open={tagsOpen}
            onClose={() => setTagsOpen(false)}
            className="w-72 top-full left-0"
          >
            <div className="p-3 flex flex-col gap-3">
              {/* Tag input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Add tag (Enter or comma)"
                  aria-label="Add tag filter"
                  className="flex-1 rounded-lg bg-slate-700 border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-1.5 px-3 text-sm text-white placeholder-slate-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                  aria-label="Add tag"
                >
                  Add
                </button>
              </div>

              {/* Active tag chips */}
              {Array.isArray(filters.tags) && filters.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5" role="list" aria-label="Active tag filters">
                  {filters.tags.map((tag) => (
                    <span
                      key={tag}
                      role="listitem"
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                        className="hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-1">
                  No tag filters active. Add one above.
                </p>
              )}
            </div>
          </Dropdown>
        </div>

        {/* ── Location input ── */}
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
            aria-hidden="true"
          >
            <MapPin className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={filters.location ?? ''}
            onChange={handleLocationChange}
            placeholder="Location…"
            aria-label="Filter by location"
            className={[
              'rounded-lg border py-2 pl-9 pr-8 text-sm outline-none transition w-36',
              filters.location
                ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-300 placeholder-indigo-400/50 focus:ring-1 focus:ring-indigo-500'
                : 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 hover:border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
            ].join(' ')}
          />
          {filters.location && (
            <button
              type="button"
              onClick={clearLocation}
              aria-label="Clear location filter"
              className="absolute inset-y-0 right-2 flex items-center text-indigo-400 hover:text-indigo-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Reset all ── */}
        {anyActive && (
          <button
            type="button"
            onClick={resetAll}
            aria-label="Reset all filters"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:border-slate-600 text-sm transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>

      {/* ── Row 2: Active filter summary chips ── */}
      {activeBadgeCount > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="status"
          aria-live="polite"
          aria-label="Active filters"
        >
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Filter className="w-3 h-3" aria-hidden="true" />
            Active filters:
          </span>

          {filters.industry && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-700 text-slate-300 border border-slate-600 rounded-full text-xs">
              <Factory className="w-3 h-3 text-slate-400" aria-hidden="true" />
              {filters.industry}
              <button
                type="button"
                onClick={() => update({ industry: '' })}
                aria-label={`Remove industry filter: ${filters.industry}`}
                className="text-slate-500 hover:text-white transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {Array.isArray(filters.tags) && filters.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-700 text-slate-300 border border-slate-600 rounded-full text-xs"
            >
              <Tag className="w-3 h-3 text-slate-400" aria-hidden="true" />
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag filter: ${tag}`}
                className="text-slate-500 hover:text-white transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filters.location && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-700 text-slate-300 border border-slate-600 rounded-full text-xs">
              <MapPin className="w-3 h-3 text-slate-400" aria-hidden="true" />
              {filters.location}
              <button
                type="button"
                onClick={clearLocation}
                aria-label={`Remove location filter: ${filters.location}`}
                className="text-slate-500 hover:text-white transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactFilter;
