import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Plus,
  Loader2,
  AlertCircle,
  Save,
  ChevronDown,
  Tag,
  MapPin,
  Factory,
  Users,
  BookmarkPlus,
  Trash2,
  Eye,
  RotateCcw,
  Check,
  Filter,
} from 'lucide-react';
import contactService from '../../services/contactService';

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

const EMPTY_CRITERIA = {
  industries: [],
  tags: [],
  locations: [],
};

const EMPTY_LOCATION = { city: '', state: '', country: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when at least one filter criterion is set. */
const hasCriteria = (criteria) =>
  criteria.industries.length > 0 ||
  criteria.tags.length > 0 ||
  criteria.locations.length > 0;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Dropdown that closes on outside click */
const Dropdown = ({ open, onClose, children, className = '' }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
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

/** Section header used inside the builder panels */
const SectionLabel = ({ children }) => (
  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
    {children}
  </p>
);

/** Chip / pill used to display selected filter values */
const FilterChip = ({ label, onRemove, icon: Icon }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs">
    {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="hover:text-white transition-colors ml-0.5"
      aria-label={`Remove ${label}`}
    >
      <X className="w-3 h-3" />
    </button>
  </span>
);

/** Preview badge showing matched contact count */
const PreviewBadge = ({ count, loading, error }) => {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Calculating…
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
        <AlertCircle className="w-3.5 h-3.5" />
        Preview unavailable
      </span>
    );
  }
  if (count === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 font-medium">
      <Users className="w-3.5 h-3.5" />
      {count.toLocaleString()} contact{count !== 1 ? 's' : ''} match
    </span>
  );
};

// ─── Main SegmentBuilder component ───────────────────────────────────────────

/**
 * SegmentBuilder – create or edit a contact segment.
 *
 * @param {Object}   props
 * @param {Object}   [props.segment]   - Existing segment for edit mode; omit for create mode.
 * @param {Function} props.onSuccess   - Called with the saved segment after a successful save.
 * @param {Function} props.onCancel    - Called when the user cancels.
 */
const SegmentBuilder = ({ segment, onSuccess, onCancel }) => {
  const isEditMode = Boolean(segment?._id);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState({ ...EMPTY_CRITERIA, locations: [] });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [industryOpen, setIndustryOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [locationDraft, setLocationDraft] = useState({ ...EMPTY_LOCATION });
  const [showLocationForm, setShowLocationForm] = useState(false);

  // ── Preview state ──────────────────────────────────────────────────────────
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const previewTimer = useRef(null);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [nameError, setNameError] = useState('');

  // ── Populate form when editing ─────────────────────────────────────────────
  useEffect(() => {
    if (segment) {
      setName(segment.name ?? '');
      setDescription(segment.description ?? '');
      setCriteria({
        industries: Array.isArray(segment.filterCriteria?.industries)
          ? [...segment.filterCriteria.industries]
          : [],
        tags: Array.isArray(segment.filterCriteria?.tags)
          ? [...segment.filterCriteria.tags]
          : [],
        locations: Array.isArray(segment.filterCriteria?.locations)
          ? segment.filterCriteria.locations.map((l) => ({ ...l }))
          : [],
      });
    }
  }, [segment]);

  // ── Auto-preview on criteria change ───────────────────────────────────────
  useEffect(() => {
    clearTimeout(previewTimer.current);
    if (!hasCriteria(criteria)) {
      setPreviewCount(null);
      setPreviewError(false);
      return;
    }
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(false);
      try {
        const result = await contactService.previewSegment(criteria);
        setPreviewCount(result?.count ?? 0);
      } catch {
        setPreviewError(true);
        setPreviewCount(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(previewTimer.current);
  }, [criteria]);

  // ── Industry handlers ──────────────────────────────────────────────────────
  const toggleIndustry = useCallback((industry) => {
    setCriteria((prev) => {
      const has = prev.industries.includes(industry);
      return {
        ...prev,
        industries: has
          ? prev.industries.filter((i) => i !== industry)
          : [...prev.industries, industry],
      };
    });
  }, []);

  const removeIndustry = useCallback((industry) => {
    setCriteria((prev) => ({
      ...prev,
      industries: prev.industries.filter((i) => i !== industry),
    }));
  }, []);

  // ── Tag handlers ───────────────────────────────────────────────────────────
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    setCriteria((prev) => {
      if (prev.tags.includes(trimmed)) return prev;
      return { ...prev, tags: [...prev.tags, trimmed] };
    });
    setTagInput('');
  }, [tagInput]);

  const removeTag = useCallback((tag) => {
    setCriteria((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }, []);

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
    if (
      e.key === 'Backspace' &&
      !tagInput &&
      criteria.tags.length > 0
    ) {
      removeTag(criteria.tags[criteria.tags.length - 1]);
    }
  };

  // ── Location handlers ──────────────────────────────────────────────────────
  const handleLocationDraftChange = (e) => {
    const { name: field, value } = e.target;
    setLocationDraft((prev) => ({ ...prev, [field]: value }));
  };

  const addLocation = useCallback(() => {
    const loc = {
      city: locationDraft.city.trim(),
      state: locationDraft.state.trim(),
      country: locationDraft.country.trim(),
    };
    // Require at least one field
    if (!loc.city && !loc.state && !loc.country) return;
    setCriteria((prev) => ({ ...prev, locations: [...prev.locations, loc] }));
    setLocationDraft({ ...EMPTY_LOCATION });
    setShowLocationForm(false);
  }, [locationDraft]);

  const removeLocation = useCallback((index) => {
    setCriteria((prev) => ({
      ...prev,
      locations: prev.locations.filter((_, i) => i !== index),
    }));
  }, []);

  const formatLocation = (loc) =>
    [loc.city, loc.state, loc.country].filter(Boolean).join(', ');

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetCriteria = useCallback(() => {
    setCriteria({ ...EMPTY_CRITERIA, locations: [] });
    setPreviewCount(null);
    setPreviewError(false);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setNameError('Segment name is required.');
      return;
    }

    setSaving(true);
    setSaveError('');

    const payload = {
      name: name.trim(),
      ...(description.trim() && { description: description.trim() }),
      filterCriteria: criteria,
    };

    try {
      let saved;
      if (isEditMode) {
        saved = await contactService.updateSegment(segment._id, payload);
      } else {
        saved = await contactService.createSegment(payload);
      }
      onSuccess?.(saved);
    } catch (err) {
      const message =
        err?.response?.data?.message ?? err.message ?? 'An unexpected error occurred.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const activeCriteriaCount =
    criteria.industries.length + criteria.tags.length + criteria.locations.length;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={isEditMode ? 'Edit segment form' : 'Create segment form'}
      className="flex flex-col gap-6"
    >
      {/* ── Save error banner ── */}
      {saveError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError('')}
            className="text-red-400 hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Section: Segment Details ── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Segment Details
        </legend>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seg-name" className="text-sm font-medium text-slate-300">
            Name <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="seg-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            disabled={saving}
            placeholder="e.g. Tech Companies in California"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'seg-name-error' : undefined}
            className={[
              'w-full rounded-lg bg-slate-700/60 border py-2.5 px-4 text-sm text-white placeholder-slate-500',
              'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              nameError ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
            ].join(' ')}
          />
          {nameError && (
            <p id="seg-name-error" role="alert" className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {nameError}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seg-description" className="text-sm font-medium text-slate-300">
            Description
          </label>
          <textarea
            id="seg-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            placeholder="Optional description of this segment…"
            rows={2}
            className="w-full rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 px-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>
      </fieldset>

      {/* ── Section: Filter Criteria ── */}
      <fieldset className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Filter Criteria
            {activeCriteriaCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white rounded-full text-xs font-bold">
                {activeCriteriaCount}
              </span>
            )}
          </legend>
          {activeCriteriaCount > 0 && (
            <button
              type="button"
              onClick={resetCriteria}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Reset all filter criteria"
            >
              <RotateCcw className="w-3 h-3" />
              Reset filters
            </button>
          )}
        </div>

        {/* AND logic note */}
        {activeCriteriaCount > 1 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <Filter className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <p className="text-xs text-indigo-300">
              All criteria are combined with <strong>AND</strong> logic — contacts must match every filter.
            </p>
          </div>
        )}

        {/* ── Industries ── */}
        <div>
          <SectionLabel>Industries</SectionLabel>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIndustryOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={industryOpen}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full',
                criteria.industries.length > 0
                  ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/20'
                  : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200',
              ].join(' ')}
            >
              <Factory className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">
                {criteria.industries.length > 0
                  ? `${criteria.industries.length} industr${criteria.industries.length === 1 ? 'y' : 'ies'} selected`
                  : 'Select industries…'}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${industryOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            <Dropdown
              open={industryOpen}
              onClose={() => setIndustryOpen(false)}
              className="w-full top-full left-0"
            >
              <div
                className="p-1 max-h-56 overflow-y-auto custom-scrollbar"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Industries"
              >
                {INDUSTRIES.map((ind) => {
                  const selected = criteria.industries.includes(ind);
                  return (
                    <button
                      key={ind}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => toggleIndustry(ind)}
                      className={[
                        'w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        selected
                          ? 'bg-indigo-600/20 text-indigo-300'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                          selected
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'border-slate-600',
                        ].join(' ')}
                        aria-hidden="true"
                      >
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </span>
                      {ind}
                    </button>
                  );
                })}
              </div>
            </Dropdown>
          </div>

          {/* Selected industry chips */}
          {criteria.industries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2" role="list" aria-label="Selected industries">
              {criteria.industries.map((ind) => (
                <FilterChip
                  key={ind}
                  label={ind}
                  icon={Factory}
                  onRemove={() => removeIndustry(ind)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Tags ── */}
        <div>
          <SectionLabel>Tags</SectionLabel>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
                aria-hidden="true"
              >
                <Tag className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                disabled={saving}
                placeholder="Add tag (Enter or comma)"
                aria-label="Add tag filter"
                className="w-full rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <button
              type="button"
              onClick={addTag}
              disabled={saving || !tagInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Add tag"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {criteria.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2" role="list" aria-label="Selected tags">
              {criteria.tags.map((tag) => (
                <FilterChip key={tag} label={tag} icon={Tag} onRemove={() => removeTag(tag)} />
              ))}
            </div>
          )}
        </div>

        {/* ── Locations ── */}
        <div>
          <SectionLabel>Locations</SectionLabel>

          {/* Existing location chips */}
          {criteria.locations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2" role="list" aria-label="Selected locations">
              {criteria.locations.map((loc, idx) => (
                <FilterChip
                  key={idx}
                  label={formatLocation(loc)}
                  icon={MapPin}
                  onRemove={() => removeLocation(idx)}
                />
              ))}
            </div>
          )}

          {/* Add location form */}
          {showLocationForm ? (
            <div className="flex flex-col gap-3 p-3 bg-slate-700/40 border border-slate-700 rounded-lg">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="loc-city" className="text-xs text-slate-400">City</label>
                  <input
                    id="loc-city"
                    name="city"
                    type="text"
                    value={locationDraft.city}
                    onChange={handleLocationDraftChange}
                    placeholder="New York"
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 hover:border-slate-500 py-2 px-3 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="loc-state" className="text-xs text-slate-400">State / Province</label>
                  <input
                    id="loc-state"
                    name="state"
                    type="text"
                    value={locationDraft.state}
                    onChange={handleLocationDraftChange}
                    placeholder="NY"
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 hover:border-slate-500 py-2 px-3 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="loc-country" className="text-xs text-slate-400">Country</label>
                  <input
                    id="loc-country"
                    name="country"
                    type="text"
                    value={locationDraft.country}
                    onChange={handleLocationDraftChange}
                    placeholder="United States"
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 hover:border-slate-500 py-2 px-3 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowLocationForm(false);
                    setLocationDraft({ ...EMPTY_LOCATION });
                  }}
                  className="px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addLocation}
                  disabled={!locationDraft.city && !locationDraft.state && !locationDraft.country}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Add Location
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLocationForm(true)}
              className="flex items-center gap-2 px-3 py-2 w-full rounded-lg border border-dashed border-slate-600 hover:border-slate-500 text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add location filter
            </button>
          )}
        </div>
      </fieldset>

      {/* ── Preview ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-700/30 border border-slate-700 rounded-lg">
        <Eye className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
        <span className="text-sm text-slate-400 flex-1">
          {hasCriteria(criteria)
            ? 'Contacts matching current criteria:'
            : 'Add filter criteria to preview matching contacts.'}
        </span>
        <PreviewBadge count={previewCount} loading={previewLoading} error={previewError} />
      </div>

      {/* ── Form Actions ── */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>{isEditMode ? 'Saving…' : 'Creating…'}</span>
            </>
          ) : (
            <>
              {isEditMode ? (
                <Save className="w-4 h-4" aria-hidden="true" />
              ) : (
                <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{isEditMode ? 'Save Changes' : 'Save Segment'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default SegmentBuilder;
