import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Sidebar from './components/common/Sidebar';
import Navbar from './components/common/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Analytics from './pages/Analytics';
import Workflows from './pages/Workflows';
import Admin from './pages/Admin';
import Settings from './pages/Settings';

// Authenticated layout: sidebar on the left, navbar + content on the right
const AuthenticatedLayout = () => (
  <div className="flex h-screen overflow-hidden">
    <Sidebar />
    <div className="flex-1 flex flex-col overflow-hidden">
      <Navbar />
      <main className="flex-1 overflow-y-auto bg-slate-900">
        <Outlet />
      </main>
    </div>
  </div>
);

const App = () => {
  return (
    <div className="h-screen overflow-hidden bg-slate-900">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Protected routes — ProtectedRoute renders <Outlet /> when authenticated */}
        <Route element={<ProtectedRoute />}>
          {/* Authenticated layout wraps all protected pages */}
          <Route element={<AuthenticatedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/settings" element={<Settings />} />

            {/* Admin-only routes — enforced at the router level */}
            <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </div>
  );
};

export default App;
