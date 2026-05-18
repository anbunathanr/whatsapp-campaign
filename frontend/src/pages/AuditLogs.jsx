import { useState, useEffect } from 'react';
import { 
  FileClock, 
  Search, 
  Filter, 
  User, 
  Activity, 
  Calendar,
  AlertCircle,
  Database,
  Terminal,
  ShieldAlert
} from 'lucide-react';
import adminService from '../services/adminService';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

const AuditLogs = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination and Filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [filterResource, setFilterResource] = useState('');

  // Protect route - Admin only
  if (user?.role !== 'Admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filterAction) params.action = filterAction;
      if (filterResource) params.resourceType = filterResource;
      
      const data = await adminService.getAuditLogs(params);
      setLogs(data.logs || []);
      setTotalPages(data.pages || 1);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filterAction, filterResource]);

  const getActionColor = (action) => {
    if (action.includes('delete')) return 'text-red-400 bg-red-400/10 border-red-500/20';
    if (action.includes('create')) return 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20';
    if (action.includes('update')) return 'text-amber-400 bg-amber-400/10 border-amber-500/20';
    if (action.includes('login')) return 'text-blue-400 bg-blue-400/10 border-blue-500/20';
    return 'text-indigo-400 bg-indigo-400/10 border-indigo-500/20';
  };

  const getResourceIcon = (resource) => {
    switch (resource) {
      case 'User': return <User className="w-4 h-4" />;
      case 'System': return <Terminal className="w-4 h-4" />;
      case 'Campaign': return <Activity className="w-4 h-4" />;
      default: return <Database className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <FileClock className="w-8 h-8 text-indigo-400" />
            Audit Logs
          </h1>
          <p className="text-slate-400 mt-1">Platform-wide activity monitoring and security trail.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-400 font-medium">Filter by:</span>
        </div>
        
        <select 
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-700 rounded-lg py-2 px-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto"
        >
          <option value="">All Actions</option>
          <option value="login">Login</option>
          <option value="user_created">User Created</option>
          <option value="campaign_executed">Campaign Executed</option>
          <option value="contact_imported">Contact Imported</option>
        </select>

        <select 
          value={filterResource}
          onChange={(e) => { setFilterResource(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-700 rounded-lg py-2 px-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto"
        >
          <option value="">All Resources</option>
          <option value="User">User</option>
          <option value="Campaign">Campaign</option>
          <option value="Contact">Contact</option>
          <option value="Workflow">Workflow</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Resource</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-slate-400 text-sm">Loading audit logs...</p>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <ShieldAlert className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">No audit logs found matching your filters.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                          {log.user?.firstName?.charAt(0)}{log.user?.lastName?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{log.user?.firstName} {log.user?.lastName}</p>
                          <p className="text-xs text-slate-500">{log.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        {getResourceIcon(log.resourceType)}
                        {log.resourceType || 'System'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-400 font-mono bg-slate-900/50 p-2 rounded border border-slate-700/50 max-w-xs truncate" title={log.resourceId}>
                        ID: {log.resourceId || 'N/A'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/50 flex items-center justify-between">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-slate-400">
              Page <span className="font-medium text-white">{page}</span> of <span className="font-medium text-white">{totalPages}</span>
            </span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
