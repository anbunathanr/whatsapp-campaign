import { useState, useEffect } from 'react';
import { 
  Settings, 
  Plus, 
  Search, 
  Play, 
  Trash2, 
  Edit, 
  AlertCircle,
  MessageCircle,
  Clock,
  Zap,
  Power,
  X,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import workflowService from '../services/workflowService';

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Keyword Reply', description: 'Auto-respond when user sends a keyword', icon: '💬' },
  { value: 'event', label: 'Event', description: 'Triggered by a system event', icon: '⚡' },
  { value: 'scheduled', label: 'Scheduled', description: 'Runs on a cron schedule', icon: '🕐' },
  { value: 'manual', label: 'Manual', description: 'Triggered manually by a user', icon: '▶️' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  n8nWorkflowId: '',
  useN8n: false,
  triggerType: 'keyword',
  triggerConfig: {
    schedule: '',
    event: '',
    keyword: '',
    autoResponse: '',
  },
  isActive: true,
};

// ── WorkflowFormModal ─────────────────────────────────────────────────────────
const WorkflowFormModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (error) setError('');
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      triggerConfig: { ...prev.triggerConfig, [name]: value },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Workflow name is required.'); return; }

    if (form.triggerType === 'keyword') {
      if (!form.triggerConfig.keyword.trim()) { setError('Trigger keyword is required.'); return; }
      if (!form.useN8n && !form.triggerConfig.autoResponse.trim()) { setError('Auto-response message is required.'); return; }
      if (form.useN8n && !form.n8nWorkflowId.trim()) { setError('n8n Workflow ID is required when using n8n integration.'); return; }
    } else {
      if (!form.n8nWorkflowId.trim()) { setError('n8n Workflow ID is required.'); return; }
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        n8nWorkflowId: form.useN8n ? form.n8nWorkflowId.trim() : undefined,
        triggerType: form.triggerType,
        triggerConfig: form.triggerConfig,
        isActive: form.isActive,
      };
      const created = await workflowService.createWorkflow(payload);
      onCreated(created);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create workflow.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-white font-semibold text-base">Create Workflow</h2>
            <p className="text-slate-400 text-xs mt-0.5">Link an n8n workflow with a trigger</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

            {/* API Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} className="ml-auto">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Name */}
            <div>
              <label className={labelCls}>Workflow Name <span className="text-red-400">*</span></label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. New Lead Auto-Response"
                className={inputCls}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="What does this workflow do?"
                rows={2}
                className={inputCls + ' resize-none'}
              />
            </div>

            {/* n8n Workflow ID — hidden for keyword type in standalone mode */}
            {(form.triggerType !== 'keyword' || form.useN8n) && (
              <div>
                <label className={labelCls}>n8n Workflow ID <span className="text-red-400">*</span></label>
                <input
                  name="n8nWorkflowId"
                  value={form.n8nWorkflowId}
                  onChange={handleChange}
                  placeholder="e.g. abc123xyz"
                  className={inputCls + ' font-mono'}
                />
                <p className="text-xs text-slate-500 mt-1">The webhook ID from your n8n instance.</p>
              </div>
            )}

            {/* Trigger Type */}
            <div>
              <label className={labelCls}>Trigger Type <span className="text-red-400">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={[
                      'flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                      form.triggerType === t.value
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="triggerType"
                      value={t.value}
                      checked={form.triggerType === t.value}
                      onChange={handleChange}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-medium">{t.icon} {t.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Trigger config — conditional */}
            {form.triggerType === 'scheduled' && (
              <div>
                <label className={labelCls}>Cron Expression</label>
                <input
                  name="schedule"
                  value={form.triggerConfig.schedule}
                  onChange={handleConfigChange}
                  placeholder="e.g. 0 9 * * 1 (every Monday 9am)"
                  className={inputCls + ' font-mono'}
                />
              </div>
            )}
            {form.triggerType === 'event' && (
              <div>
                <label className={labelCls}>Event Name</label>
                <input
                  name="event"
                  value={form.triggerConfig.event}
                  onChange={handleConfigChange}
                  placeholder="e.g. contact.created"
                  className={inputCls}
                />
              </div>
            )}
            {form.triggerType === 'keyword' && (
              <div className="space-y-4">
                {/* Keyword */}
                <div>
                  <label className={labelCls}>Trigger Keyword <span className="text-red-400">*</span></label>
                  <input
                    name="keyword"
                    value={form.triggerConfig.keyword}
                    onChange={handleConfigChange}
                    placeholder="e.g. HELP, STOP, INFO"
                    className={inputCls}
                  />
                  <p className="text-xs text-slate-500 mt-1">Case-insensitive — HELP = help = Help</p>
                </div>

                {/* Mode toggle: standalone vs n8n */}
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/50 cursor-pointer select-none"
                  onClick={() => setForm(p => ({ ...p, useN8n: !p.useN8n }))}
                >
                  <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.useN8n ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.useN8n ? 'translate-x-5' : ''}`} />
                  </div>
                  <div>
                    <p className="text-sm text-white font-semibold">{form.useN8n ? 'n8n Integration' : 'Standalone Auto-Reply'}</p>
                    <p className="text-xs text-slate-500">{form.useN8n ? 'Forward reply to an n8n workflow for complex logic' : 'Send a direct text reply — no n8n needed'}</p>
                  </div>
                </div>

                {/* Auto-response text — shown only in standalone mode */}
                {!form.useN8n && (
                  <div>
                    <label className={labelCls}>Auto-Response Message <span className="text-red-400">*</span></label>
                    <textarea
                      name="autoResponse"
                      value={form.triggerConfig.autoResponse}
                      onChange={handleConfigChange}
                      placeholder="Hi! Thanks for reaching out. How can we help you today?"
                      rows={3}
                      className={inputCls + ' resize-none'}
                    />
                    <p className="text-xs text-slate-500 mt-1">Sent instantly when the keyword is detected.</p>
                  </div>
                )}
              </div>
            )}


            {/* Active toggle */}
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <input
                id="isActive"
                type="checkbox"
                name="isActive"
                checked={form.isActive}
                onChange={handleChange}
                className="w-4 h-4 rounded accent-indigo-500"
              />
              <label htmlFor="isActive" className="text-sm text-slate-300 cursor-pointer">
                Activate workflow immediately after creation
              </label>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {loading ? 'Creating…' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Workflows component ───────────────────────────────────────────────────
const Workflows = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const data = await workflowService.getWorkflows();
      setWorkflows(data || []);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleExecute = async (id) => {
    try {
      await workflowService.executeWorkflow(id, {});
      // Refresh to update execution count
      fetchWorkflows();
    } catch (err) {
      alert('Failed to execute workflow: ' + (err?.response?.data?.message || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await workflowService.deleteWorkflow(id);
      setWorkflows(workflows.filter(w => w._id !== id));
    } catch (err) {
      alert('Failed to delete workflow: ' + (err?.response?.data?.message || err.message));
    }
  };

  const getTriggerIcon = (type) => {
    switch(type) {
      case 'keyword': return <MessageCircle className="w-4 h-4 text-emerald-400" />;
      case 'scheduled': return <Clock className="w-4 h-4 text-blue-400" />;
      case 'event': return <Zap className="w-4 h-4 text-amber-400" />;
      default: return <Power className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleCreated = (newWorkflow) => {
    setShowCreateModal(false);
    setWorkflows((prev) => [newWorkflow, ...prev]);
    setSuccessMessage(`Workflow "${newWorkflow.name}" created successfully!`);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Settings className="w-8 h-8 text-indigo-400" />
            Workflows
          </h1>
          <p className="text-slate-400 mt-1">Automate tasks with n8n triggers and keyword auto-responses.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg border border-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          Create Workflow
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{successMessage}</span>
          <button onClick={() => setSuccessMessage('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Workflows Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-56 bg-slate-800/50 rounded-2xl animate-pulse border border-slate-700/50" />
          ))}
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-20 px-4 bg-slate-800/30 rounded-3xl border border-slate-700/30">
          <MessageCircle className="w-12 h-12 text-slate-500 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-white mb-2">No workflows yet</h3>
          <p className="text-slate-400 text-sm mb-6">Create a keyword auto-reply so users get instant responses.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Your First Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map(workflow => (
            <div
              key={workflow._id}
              className={`relative border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-2xl group flex flex-col ${
                workflow.isActive
                  ? 'bg-slate-800/80 border-slate-700 hover:border-slate-500'
                  : 'bg-slate-900/60 border-slate-800 opacity-60'
              }`}
            >
              {/* Top active strip */}
              {workflow.isActive && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500/0 via-emerald-400/70 to-emerald-500/0" />
              )}

              <div className="p-6 flex-1">
                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-300">
                    {getTriggerIcon(workflow.triggerType)}
                    <span className="capitalize">{workflow.triggerType}</span>
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                    workflow.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700/50 text-slate-500 border border-slate-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${workflow.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    {workflow.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white mb-1">{workflow.name}</h3>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4">{workflow.description || 'No description.'}</p>

                {/* Keyword + reply preview */}
                {workflow.triggerType === 'keyword' && workflow.triggerConfig?.keyword && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Keyword:</span>
                      <code className="text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                        {workflow.triggerConfig.keyword.toUpperCase()}
                      </code>
                    </div>
                    {workflow.triggerConfig?.autoResponse && (
                      <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-3">
                        <p className="text-xs text-slate-500 mb-1 font-medium">Auto-reply:</p>
                        <p className="text-sm text-slate-300 line-clamp-2 italic">"{workflow.triggerConfig.autoResponse}"</p>
                      </div>
                    )}
                    {workflow.n8nWorkflowId && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">n8n:</span>
                        <code className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded font-mono">{workflow.n8nWorkflowId}</code>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="flex gap-6 text-xs text-slate-500">
                  <div>
                    <p className="uppercase tracking-wide">Executions</p>
                    <p className="font-bold text-slate-200 text-lg mt-0.5 tabular-nums">{workflow.executionCount}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide">Last Run</p>
                    <p className="font-semibold text-slate-300 mt-0.5">
                      {workflow.lastExecutedAt ? new Date(workflow.lastExecutedAt).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-3 border-t border-slate-700/50 bg-slate-800/30 flex items-center justify-end gap-1">
                <button
                  onClick={() => handleExecute(workflow._id)}
                  title="Run Now"
                  className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  title="Edit"
                  className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(workflow._id)}
                  title="Delete"
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <WorkflowFormModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
};

export default Workflows;

