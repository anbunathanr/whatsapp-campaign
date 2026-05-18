import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, FileClock, Activity, AlertCircle, CheckCircle2, Server, Database, Clock, UserPlus, Edit2, PowerOff, Power, X, ChevronLeft, ChevronRight, Search, Loader2, Calendar } from 'lucide-react';
import adminService from '../services/adminService';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';



const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'audit', label: 'Audit Logs', icon: FileClock },
];

const ACTION_COLORS = {
  create: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30',
  update: 'text-amber-400 bg-amber-400/10 border-amber-500/30',
  delete: 'text-red-400 bg-red-400/10 border-red-500/30',
  login: 'text-blue-400 bg-blue-400/10 border-blue-500/30',
  execute: 'text-purple-400 bg-purple-400/10 border-purple-500/30',
};
const getActionColor = (action = '') => {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return cls;
  }
  return 'text-slate-400 bg-slate-400/10 border-slate-500/30';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, icon: Icon, color = 'indigo' }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl bg-${color}-500/20 flex items-center justify-center flex-shrink-0`}>
      <Icon className={`w-6 h-6 text-${color}-400`} />
    </div>
    <div>
      <p className="text-slate-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Badge = ({ active }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${active ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30' : 'text-red-400 bg-red-400/10 border-red-500/30'}`}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

const RoleBadge = ({ role }) => {
  const colors = { Admin: 'text-purple-400 bg-purple-400/10 border-purple-500/30', Campaign_Manager: 'text-blue-400 bg-blue-400/10 border-blue-500/30', Support_Staff: 'text-slate-400 bg-slate-400/10 border-slate-500/30' };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${colors[role] || colors.Support_Staff}`}>{role?.replace('_', ' ')}</span>;
};

// ─── UserModal ────────────────────────────────────────────────────────────────
const UserModal = ({ user, onClose, onSaved }) => {
  const { isSuperAdmin } = useAuth();
  const availableRoles = isSuperAdmin ? ['Org_Admin'] : ['Campaign_Manager', 'Support_Staff'];
  const isEdit = !!user;
  const [form, setForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', email: user?.email || '', password: '', role: user?.role || availableRoles[0] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (isEdit) {
        await adminService.updateUser(user._id, { firstName: form.firstName, lastName: form.lastName, role: form.role });
      } else {
        await adminService.createUser(form);
      }
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save user.');
    } finally { setLoading(false); }
  };

  const inp = 'w-full bg-slate-950 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';
  const lbl = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>First Name</label><input className={inp} value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} required /></div>
            <div><label className={lbl}>Last Name</label><input className={inp} value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} required /></div>
          </div>
          {!isEdit && <div><label className={lbl}>Email</label><input type="email" className={inp} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required /></div>}
          {!isEdit && <div><label className={lbl}>Password</label><input type="password" className={inp} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required /></div>}
          <div>
            <label className={lbl}>Role</label>
            <select className={inp} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              {availableRoles.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Overview Tab ─────────────────────────────────────────────────────────────
const OverviewTab = ({ health }) => {
  if (!health) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-400" /></div>;
  const isHealthy = health.status === 'healthy';
  return (
    <div className="space-y-6">
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${isHealthy ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
        {isHealthy ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
        <p className={`font-medium ${isHealthy ? 'text-emerald-400' : 'text-red-400'}`}>
          System Status: <span className="uppercase">{health.status}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={health.stats?.totalUsers} icon={Users} color="indigo" />
        <StatCard label="Campaigns" value={health.stats?.totalCampaigns} icon={Activity} color="blue" />
        <StatCard label="Contacts" value={health.stats?.totalContacts} icon={Database} color="purple" />
        <StatCard label="Active Campaigns" value={health.stats?.activeCampaigns} icon={Clock} color="amber" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <p className="text-slate-400 text-sm font-medium flex items-center gap-2"><Server className="w-4 h-4" />Server</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Uptime</span><span className="text-white">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Memory</span><span className="text-white">{health.memoryUsageMB} / {health.memoryTotalMB} MB</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Database</span><span className={health.database === 'connected' ? 'text-emerald-400' : 'text-red-400'}>{health.database}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Users Tab ────────────────────────────────────────────────────────────────
const UsersTab = () => {
  const [data, setData] = useState({ users: [], total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | user object
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.listUsers({ page, limit: 15, search });
      setData(res);
    } catch { setError('Failed to load users.'); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (user) => {
    setActionLoading(user._id);
    try {
      if (user.isActive) await adminService.deleteUser(user._id);
      else await adminService.reactivateUser(user._id);
      await load();
    } catch { setError('Action failed.'); }
    finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-4">
      {error && <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm"><AlertCircle className="w-4 h-4" />{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input placeholder="Search users..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full bg-slate-900 border border-slate-700 text-white pl-9 pr-3 py-2 rounded-xl text-sm focus:outline-none focus:border-indigo-500" /></div>
        <button onClick={() => setModal('create')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium">
          <UserPlus className="w-4 h-4" /> Create User
        </button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead><tr className="bg-slate-950/60 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <th className="px-5 py-3">User</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Joined</th><th className="px-5 py-3">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto" /></td></tr>
            ) : data.users.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-500">No users found</td></tr>
            ) : data.users.map(u => (
              <tr key={u._id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                    <div><p className="text-white text-sm font-medium">{u.firstName} {u.lastName}</p><p className="text-slate-500 text-xs">{u.email}</p></div>
                  </div>
                </td>
                <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-5 py-3"><Badge active={u.isActive} /></td>
                <td className="px-5 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(u)} title="Edit" className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => toggleActive(u)} title={u.isActive ? 'Deactivate' : 'Reactivate'} disabled={actionLoading === u._id} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-40">
                      {actionLoading === u._id ? <Loader2 className="w-4 h-4 animate-spin" /> : u.isActive ? <PowerOff className="w-4 h-4 text-red-400" /> : <Power className="w-4 h-4 text-emerald-400" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.pages > 1 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-slate-400 text-sm">Page {page} of {data.pages}</span>
            <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      {modal && <UserModal user={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
};

// ─── Audit Logs Tab ───────────────────────────────────────────────────────────
const AuditTab = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: 20 };
    if (filterAction) params.action = filterAction;
    if (filterResource) params.resourceType = filterResource;
    adminService.getAuditLogs(params)
      .then(data => { setLogs(data.logs || []); setTotalPages(data.pages || 1); setError(''); })
      .catch(() => setError('Failed to load audit logs.'))
      .finally(() => setLoading(false));
  }, [page, filterAction, filterResource]);

  return (
    <div className="space-y-4">
      {error && <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
      <div className="flex flex-wrap gap-3">
        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }} className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">All Actions</option>
          <option value="login">Login</option>
          <option value="campaign_created">Campaign Created</option>
          <option value="campaign_executed">Campaign Executed</option>
          <option value="contact_created">Contact Created</option>
          <option value="contact_imported">Contact Imported</option>
          <option value="contact_deleted">Contact Deleted</option>
          <option value="workflow_created">Workflow Created</option>
          <option value="workflow_executed">Workflow Executed</option>
        </select>
        <select value={filterResource} onChange={e => { setFilterResource(e.target.value); setPage(1); }} className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">All Resources</option>
          {['User','Campaign','Contact','Workflow','Segment'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead><tr className="bg-slate-950/60 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <th className="px-5 py-3">Time</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Resource</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={4} className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto" /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-slate-500">No audit logs found. Activity will appear here once actions are performed.</td></tr>
            ) : logs.map(log => (
              <tr key={log._id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-5 py-3"><div className="flex items-center gap-2 text-slate-400 text-xs"><Calendar className="w-3.5 h-3.5" />{new Date(log.timestamp).toLocaleString()}</div></td>
                <td className="px-5 py-3"><p className="text-white text-sm">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</p><p className="text-slate-500 text-xs">{log.user?.email || ''}</p></td>
                <td className="px-5 py-3"><span className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-medium border ${getActionColor(log.action)}`}>{log.action}</span></td>
                <td className="px-5 py-3 text-slate-400 text-sm">{log.resourceType || 'System'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Admin Page ──────────────────────────────────────────────────────────
const Admin = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState('overview');
  const [health, setHealth] = useState(null);

  // All hooks must be called before any conditional return (Rules of Hooks)
  useEffect(() => {
    if (!isAdmin) return;
    adminService.getSystemHealth().then(setHealth).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;


  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{isSuperAdmin ? 'Platform Admin' : 'Organization Admin'}</h1>
            <p className="text-slate-400 text-sm">{isSuperAdmin ? 'Full platform control and monitoring' : 'Manage your organization users and settings'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && <OverviewTab health={health} />}
        {tab === 'users' && <UsersTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
};

export default Admin;
