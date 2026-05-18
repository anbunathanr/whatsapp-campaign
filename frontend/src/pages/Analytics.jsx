import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  BarChart2,
  TrendingUp,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Users,
  RefreshCw,
  AlertCircle,
  Megaphone,
  Clock,
  Send,
  Eye,
  MessageCircle,
  Activity,
  Zap,
} from 'lucide-react';
import analyticsService from '../services/analyticsService';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
);

// ─── Constants ────────────────────────────────────────────────────────────────

const TREND_WINDOWS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

const STATUS_COLORS = {
  draft:     { bg: '#64748b', light: 'rgba(100,116,139,0.15)' },
  scheduled: { bg: '#6366f1', light: 'rgba(99,102,241,0.15)' },
  executing: { bg: '#f59e0b', light: 'rgba(245,158,11,0.15)' },
  completed: { bg: '#10b981', light: 'rgba(16,185,129,0.15)' },
  cancelled: { bg: '#ef4444', light: 'rgba(239,68,68,0.15)' },
  archived:  { bg: '#475569', light: 'rgba(71,85,105,0.15)' },
};

// ─── Shared chart defaults ────────────────────────────────────────────────────

const tooltipDefaults = {
  backgroundColor: 'rgba(2,6,23,0.92)',
  titleColor: '#f1f5f9',
  bodyColor: '#94a3b8',
  padding: 12,
  borderColor: 'rgba(51,65,85,0.6)',
  borderWidth: 1,
  cornerRadius: 8,
};

const gridColor = 'rgba(51,65,85,0.25)';
const tickColor = '#64748b';

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className="group relative overflow-hidden bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 hover:border-white/20">
    <div className="absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `radial-gradient(circle at top right, ${color}15, transparent 50%)` }} />
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase">{label}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight text-white">{value ?? '—'}</p>
        </div>
        {sub && <p className="text-xs text-slate-500 mt-2 font-medium">{sub}</p>}
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner transition-transform duration-300 group-hover:scale-110`} style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)`, border: `1px solid ${color}33` }}>
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
    </div>
  </div>
);

// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section = ({ title, description, icon: Icon, children, action }) => (
  <div className="relative bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-xl">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-8 py-6 border-b border-white/5 gap-4">
      <div className="flex items-center gap-4">
        <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/20 shadow-inner">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          {description && <p className="text-slate-400 text-sm mt-0.5">{description}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="p-8 relative z-10">{children}</div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const Analytics = () => {
  const [dashboard, setDashboard] = useState(null);
  const [industry, setIndustry] = useState([]);
  const [trends, setTrends] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msgStatus, setMsgStatus] = useState(null);
  const [trendDays, setTrendDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = async (days = trendDays) => {
    setLoading(true);
    setError(null);
    try {
      const [dash, ind, tr, sum, ms] = await Promise.all([
        analyticsService.getDashboardMetrics(),
        analyticsService.getIndustryAnalytics(),
        analyticsService.getTrends(days),
        analyticsService.getCampaignSummary(),
        analyticsService.getMessageStatusBreakdown(),
      ]);
      setDashboard(dash);
      setIndustry(ind);
      setTrends(tr);
      setSummary(sum);
      setMsgStatus(ms);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(trendDays); }, [trendDays]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const deliveryRate = dashboard
    ? dashboard.totalMessages
      ? Math.round(((dashboard.messagesByStatus?.delivered || 0) / dashboard.totalMessages) * 100)
      : 0
    : null;

  // ── Chart configs ───────────────────────────────────────────────────────────

  const trendsChart = {
    labels: trends.map(d => {
      const [, m, day] = d._id.split('-');
      return `${day}/${m}`;
    }),
    datasets: [
      {
        label: 'Sent',
        data: trends.map(d => d.sent),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.10)',
        fill: true, tension: 0.4, pointRadius: 3,
      },
      {
        label: 'Delivered',
        data: trends.map(d => d.delivered),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.06)',
        fill: true, tension: 0.4, pointRadius: 3,
      },
      {
        label: 'Read',
        data: trends.map(d => d.read || 0),
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6,182,212,0.06)',
        fill: true, tension: 0.4, pointRadius: 3,
      },
      {
        label: 'Replied',
        data: trends.map(d => d.replied || 0),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139,92,246,0.06)',
        fill: true, tension: 0.4, pointRadius: 3,
      },
      {
        label: 'Failed',
        data: trends.map(d => d.failed),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.06)',
        fill: true, tension: 0.4, pointRadius: 3,
      },
    ],
  };

  const trendsOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: tickColor, boxWidth: 12, font: { size: 12 } } }, tooltip: tooltipDefaults },
    scales: {
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
      x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 10 } },
    },
  };

  const industryFiltered = industry.filter(d => d.industry);
  const industryChart = {
    labels: industryFiltered.map(d => d.industry),
    datasets: [{
      label: 'Contacts',
      data: industryFiltered.map(d => d.count),
      backgroundColor: industryFiltered.map((_, i) => `hsl(${230 + i * 22}, 70%, 60%)`),
      borderRadius: 6,
    }],
  };

  const industryOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: tooltipDefaults },
    scales: {
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
      x: { grid: { display: false }, ticks: { color: tickColor } },
    },
  };

  const statusEntries = summary?.byStatus
    ? Object.entries(summary.byStatus).filter(([, v]) => v > 0)
    : [];

  const donutChart = {
    labels: statusEntries.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1)),
    datasets: [{
      data: statusEntries.map(([, v]) => v),
      backgroundColor: statusEntries.map(([k]) => STATUS_COLORS[k]?.bg ?? '#64748b'),
      borderWidth: 0,
      hoverOffset: 6,
    }],
  };

  const donutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '72%',
    plugins: {
      legend: { position: 'bottom', labels: { color: tickColor, boxWidth: 10, padding: 14, font: { size: 12 } } },
      tooltip: tooltipDefaults,
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="relative min-h-screen pb-12">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
        </div>
        <div className="relative p-8 space-y-8 max-w-7xl mx-auto animate-pulse">
          <div className="h-24 bg-white/5 border border-white/10 rounded-3xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white/5 border border-white/10 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-white/5 border border-white/10 rounded-2xl" />)}
          </div>
          <div className="h-72 bg-white/5 border border-white/10 rounded-3xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 bg-white/5 border border-white/10 rounded-3xl" />
            <div className="h-72 bg-white/5 border border-white/10 rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-5 text-center bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl px-12 py-14 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Failed to load analytics</p>
            <p className="text-slate-400 text-sm mt-1">{error}</p>
          </div>
          <button onClick={() => fetchAll(trendDays)} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-12">
      {/* Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 sm:px-8 shadow-xl">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight">
              Analytics Overview
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 font-medium">Platform-wide campaign and messaging insights</p>
          </div>
          <button 
            onClick={() => fetchAll(trendDays)} 
            className="group flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-sm font-medium border border-white/10 transition-all shadow-lg hover:shadow-xl"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" /> 
            Refresh Data
          </button>
        </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Contacts" value={dashboard?.totalContacts?.toLocaleString()} icon={Users} color="#6366f1" />
        <StatCard label="Total Campaigns" value={dashboard?.totalCampaigns?.toLocaleString()} icon={Megaphone} color="#8b5cf6" />
        <StatCard label="Messages Sent" value={dashboard?.totalMessages?.toLocaleString()} icon={Send} color="#06b6d4" />
        <StatCard
          label="Delivery Rate"
          value={deliveryRate !== null ? `${deliveryRate}%` : '—'}
          icon={CheckCircle2}
          color={deliveryRate >= 80 ? '#10b981' : deliveryRate >= 50 ? '#f59e0b' : '#ef4444'}
          sub={`${dashboard?.messagesByStatus?.delivered ?? 0} delivered`}
        />
      </div>

      {/* All 6 Twilio message statuses */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Queued',    key: 'queued',    icon: Clock,          color: '#64748b' },
          { label: 'Sent',      key: 'sent',      icon: Send,           color: '#6366f1' },
          { label: 'Delivered', key: 'delivered', icon: CheckCircle2,   color: '#10b981' },
          { label: 'Read',      key: 'read',      icon: Eye,            color: '#06b6d4' },
          { label: 'Replied',   key: 'replied',   icon: MessageCircle,  color: '#8b5cf6' },
          { label: 'Failed',    key: 'failed',    icon: XCircle,        color: '#ef4444' },
        ].map(({ label, key, icon, color }) => (
          <StatCard
            key={key}
            label={label}
            value={(msgStatus?.byStatus?.[key] ?? dashboard?.messagesByStatus?.[key] ?? 0).toLocaleString()}
            icon={icon}
            color={color}
          />
        ))}
      </div>

      {/* Engagement rates row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Engagement Rate"
          value={msgStatus ? `${msgStatus.engagementRate}%` : '—'}
          icon={Activity}
          color="#10b981"
          sub="Delivered + Read + Replied / Total"
        />
        <StatCard
          label="Read Rate"
          value={msgStatus ? `${msgStatus.readRate}%` : '—'}
          icon={Eye}
          color="#06b6d4"
          sub="Read / (Delivered + Read + Replied)"
        />
        <StatCard
          label="Reply Rate"
          value={msgStatus ? `${msgStatus.replyRate}%` : '—'}
          icon={Zap}
          color="#8b5cf6"
          sub="Replied / (Delivered + Read + Replied)"
        />
      </div>

      {/* Message trends chart */}
      <Section
        title="Message Volume Trends"
        description="Daily sent, delivered, and failed messages"
        icon={TrendingUp}
        action={
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {TREND_WINDOWS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setTrendDays(value)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                  trendDays === value
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-64">
          {trends.length === 0
            ? <div className="h-full flex items-center justify-center text-slate-500 text-sm">No message data in this period</div>
            : <Line data={trendsChart} options={trendsOptions} />
          }
        </div>
      </Section>

      {/* Bottom row: industry + campaign status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Contacts by industry */}
        <Section title="Contacts by Industry" description="Distribution across business sectors" icon={BarChart2}>
          <div className="h-64">
            {industryFiltered.length === 0
              ? <div className="h-full flex items-center justify-center text-slate-500 text-sm">No industry data yet</div>
              : <Bar data={industryChart} options={industryOptions} />
            }
          </div>
        </Section>

        {/* Campaign status donut */}
        <Section title="Campaign Status" description="Distribution by current status" icon={Megaphone}>
          {statusEntries.length === 0
            ? <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No campaigns yet</div>
            : <div className="h-64"><Doughnut data={donutChart} options={donutOptions} /></div>
          }
        </Section>
      </div>

      {/* Top campaigns table */}
      {summary?.topCampaigns?.length > 0 && (
        <Section title="Top Performing Campaigns" description="Campaigns ranked by delivery performance" icon={MessageSquare}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-4 pr-4 font-semibold">Campaign</th>
                  <th className="pb-4 pr-4 text-right font-semibold">Recipients</th>
                  <th className="pb-4 pr-4 text-right font-semibold">Sent</th>
                  <th className="pb-4 pr-4 text-right font-semibold">Failed</th>
                  <th className="pb-4 text-right font-semibold">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.topCampaigns.map(c => {
                  const rate = c.actualRecipients
                    ? Math.round(((c.messagesSent || 0) / c.actualRecipients) * 100)
                    : 0;
                  const rateColor = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
                  return (
                    <tr key={c._id} className="group hover:bg-white/5 transition-colors duration-150">
                      <td className="py-4 pr-4">
                        <span className="text-white text-sm font-semibold truncate block max-w-[200px]">{c.name}</span>
                        <span className="text-slate-500 text-xs capitalize">{c.type?.replace('_', ' ')}</span>
                      </td>
                      <td className="py-4 pr-4 text-slate-300 text-sm text-right font-medium tabular-nums">{(c.actualRecipients ?? 0).toLocaleString()}</td>
                      <td className="py-4 pr-4 text-sm text-right font-medium tabular-nums" style={{ color: '#6366f1' }}>{(c.messagesSent ?? 0).toLocaleString()}</td>
                      <td className="py-4 pr-4 text-sm text-right font-medium tabular-nums" style={{ color: '#ef4444' }}>{(c.messagesFailed ?? 0).toLocaleString()}</td>
                      <td className="py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${rate}%`, background: rateColor }}
                            />
                          </div>
                          <span className="text-xs font-bold w-8 text-right" style={{ color: rateColor }}>
                            {rate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      </div>
    </div>
  );
};

export default Analytics;
