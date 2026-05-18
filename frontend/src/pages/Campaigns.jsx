// Campaigns page - lists all campaigns with filtering and search
import { useState } from 'react';
import { Plus, Search, SlidersHorizontal, X, ArrowLeft } from 'lucide-react';
import CampaignList from '../components/campaigns/CampaignList';
import CampaignForm from '../components/campaigns/CampaignForm';

const CAMPAIGN_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'executing', label: 'Executing' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CAMPAIGN_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'festival', label: 'Festival' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'follow_up', label: 'Follow-up' },
];

const Campaigns = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Campaign form modal state
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null); // null = create mode
  const [listRefreshKey, setListRefreshKey] = useState(0); // bump to force list re-fetch

  const openCreate = () => {
    setEditingCampaign(null);
    setShowForm(true);
  };

  const openEdit = (campaign) => {
    setEditingCampaign(campaign);
    setShowForm(true);
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingCampaign(null);
    setListRefreshKey((k) => k + 1); // force CampaignList to remount and refetch
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingCampaign(null);
  };

  // Build filters object passed down to CampaignList / useCampaigns
  const filters = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  };

  const hasActiveFilters = statusFilter || typeFilter;

  const clearFilters = () => {
    setStatusFilter('');
    setTypeFilter('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-white">Campaigns</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Create and manage your WhatsApp marketing campaigns
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
            showFilters || hasActiveFilters
              ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600',
          ].join(' ')}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-medium">
              {[statusFilter, typeFilter].filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex items-center gap-4 px-6 py-3 bg-slate-800/50 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 whitespace-nowrap">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 whitespace-nowrap">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Campaign list */}
      <div className="flex-1 overflow-hidden">
        <CampaignList
          key={listRefreshKey}
          filters={filters}
          onCampaignSelect={openEdit}
          onCreateCampaign={openCreate}
        />
      </div>

      {/* Campaign Form Slide-Over */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={handleFormCancel}
          />
          {/* Panel */}
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Panel header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700 flex-shrink-0">
              <button
                onClick={handleFormCancel}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                aria-label="Close"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-white font-semibold text-base">
                  {editingCampaign ? 'Edit Campaign' : 'New Campaign'}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  {editingCampaign
                    ? `Editing "${editingCampaign.name}"`
                    : 'Fill in the details to create a new campaign'}
                </p>
              </div>
            </div>
            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
              <CampaignForm
                campaign={editingCampaign}
                onSubmit={handleFormSubmit}
                onCancel={handleFormCancel}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Campaigns;
