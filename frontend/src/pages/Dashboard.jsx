import { useState, useEffect } from 'react';
import { 
  Users, 
  Megaphone, 
  MessageSquare, 
  Activity, 
  RefreshCw,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut, Pie } from 'react-chartjs-2';
import analyticsService from '../services/analyticsService';

ChartJS.register(ArcElement, Tooltip, Legend);

// ─── Reusable KPI Card ────────────────────────────────────────────────────────
const KpiCard = ({ title, value, icon: Icon, trend, colorClass }) => (
  <div className="relative overflow-hidden rounded-2xl bg-slate-800/80 border border-slate-700 p-6 shadow-lg backdrop-blur-md transition-all hover:-translate-y-1 hover:shadow-xl group">
    <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 transition-transform group-hover:scale-150 ${colorClass}`} />
    
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <div className={`p-2 rounded-lg bg-slate-900/50 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    
    <div className="mt-4 flex items-baseline gap-2">
      <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
      {trend && (
        <span className="flex items-center text-xs font-medium text-emerald-400">
          <TrendingUp className="w-3 h-3 mr-0.5" />
          {trend}
        </span>
      )}
    </div>
  </div>
);

// ─── Dashboard Component ──────────────────────────────────────────────────────
const Dashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-800 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-800 rounded-2xl" />
          <div className="h-80 bg-slate-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-slate-800/50 rounded-3xl border border-slate-700/50">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Error Loading Dashboard</h2>
          <p className="text-slate-400 mb-6 max-w-md">{error}</p>
          <button 
            onClick={fetchDashboard}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/25"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ─── Chart Data Preparation ────────────────────────────────────────────────
  const campaignLabels = Object.keys(metrics?.campaignsByStatus || {});
  const campaignData = Object.values(metrics?.campaignsByStatus || {});
  
  const campaignChartData = {
    labels: campaignLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
    datasets: [
      {
        data: campaignData.length ? campaignData : [1],
        backgroundColor: campaignData.length 
          ? ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#64748b'] // colors mapping
          : ['#334155'], // Empty state color
        borderWidth: 0,
      },
    ],
  };

  const messageLabels = Object.keys(metrics?.messagesByStatus || {});
  const messageData = Object.values(metrics?.messagesByStatus || {});

  const messageChartData = {
    labels: messageLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
    datasets: [
      {
        data: messageData.length ? messageData : [1],
        backgroundColor: messageData.length 
          ? ['#8b5cf6', '#3b82f6', '#14b8a6', '#f43f5e', '#64748b']
          : ['#334155'], // Empty state color
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          padding: 20,
          font: { family: 'Inter, sans-serif' },
          usePointStyle: true,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        padding: 12,
        borderColor: 'rgba(51, 65, 85, 0.5)',
        borderWidth: 1,
        boxPadding: 4,
      }
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-slate-400 mt-1">Real-time metrics for your WhatsApp campaigns.</p>
        </div>
        <button 
          onClick={fetchDashboard}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Data
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard 
          title="Total Contacts" 
          value={metrics?.totalContacts?.toLocaleString() || 0} 
          icon={Users} 
          colorClass="text-blue-400 bg-blue-400" 
        />
        <KpiCard 
          title="Total Campaigns" 
          value={metrics?.totalCampaigns?.toLocaleString() || 0} 
          icon={Megaphone} 
          colorClass="text-indigo-400 bg-indigo-400" 
        />
        <KpiCard 
          title="Messages Sent" 
          value={metrics?.totalMessages?.toLocaleString() || 0} 
          icon={MessageSquare} 
          colorClass="text-emerald-400 bg-emerald-400" 
        />
        <KpiCard 
          title="Engagement Rate" 
          value="12.4%" // Placeholder until real metrics are available
          icon={Activity} 
          trend="+2.1%"
          colorClass="text-amber-400 bg-amber-400" 
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Campaign Status Chart */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-6">Campaign Status Distribution</h3>
          <div className="h-64 relative flex items-center justify-center">
            {campaignData.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10 pointer-events-none">
                <p>No campaigns yet</p>
              </div>
            )}
            <Doughnut data={campaignChartData} options={chartOptions} />
          </div>
        </div>

        {/* Message Delivery Chart */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-6">Message Delivery Status</h3>
          <div className="h-64 relative flex items-center justify-center">
            {messageData.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10 pointer-events-none">
                <p>No messages sent yet</p>
              </div>
            )}
            <Pie data={messageChartData} options={{ ...chartOptions, cutout: '0%' }} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
