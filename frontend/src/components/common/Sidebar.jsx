import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Megaphone, BarChart3, Settings, Zap, Shield } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const BASE_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/workflows', label: 'Workflows', icon: Zap },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const Sidebar = () => {
  const { isAdmin } = useAuth();
  const navItems = isAdmin
    ? [...BASE_NAV, { to: '/admin', label: 'Admin', icon: Shield }]
    : BASE_NAV;

  return (
    <aside className="w-64 h-screen bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0">
      {/* Logo / App name */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Megaphone className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-base leading-tight">
            WA Campaigns
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
                to === '/admin' && !isActive ? 'mt-2 border-t border-slate-700/50 pt-2' : '',
              ].join(' ')
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
