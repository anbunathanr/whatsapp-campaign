import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/contacts': 'Contacts',
  '/campaigns': 'Campaigns',
  '/analytics': 'Analytics',
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const pageTitle = pageTitles[location.pathname] ?? 'WhatsApp Campaigns';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-white font-semibold text-base">{pageTitle}</h1>

      <div className="flex items-center gap-4">
        {user && (
          <span className="text-slate-400 text-sm">
            {user.name ?? user.email ?? 'User'}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-100 text-sm transition-colors"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
