import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Decodes a JWT payload without verifying the signature.
 * Used only for client-side expiry checks — the server always
 * performs authoritative signature verification.
 *
 * @param {string} token - Raw JWT string
 * @returns {{ exp?: number, role?: string } | null}
 */
const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64 → JSON
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

/**
 * Returns true when the JWT token has a valid, non-expired `exp` claim.
 * If the token has no `exp` claim we treat it as non-expired (server decides).
 *
 * @param {string} token - Raw JWT string
 * @returns {boolean}
 */
const isTokenExpired = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.exp === undefined) return false;
  // `exp` is in seconds; Date.now() is in milliseconds
  return Date.now() >= payload.exp * 1000;
};

/**
 * ProtectedRoute — wraps routes that require authentication.
 *
 * Behaviour:
 *  - While auth state is initialising, shows a loading spinner.
 *  - If there is no token, or the token is expired, redirects to /login.
 *  - If `allowedRoles` is provided and the user's role is not in the list,
 *    redirects to /403 (or /dashboard as a fallback).
 *  - Otherwise renders the nested <Outlet />.
 *
 * Usage:
 *   // Basic — any authenticated user
 *   <Route element={<ProtectedRoute />}>…</Route>
 *
 *   // Role-restricted — admins only
 *   <Route element={<ProtectedRoute allowedRoles={['admin']} />}>…</Route>
 *
 * @param {{ allowedRoles?: string[] }} props
 */
const ProtectedRoute = ({ allowedRoles }) => {
  const { token, user, loading } = useAuth();

  // ── 1. Auth state is still being resolved ──────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-screen bg-slate-900 flex items-center justify-center"
        role="status"
        aria-label="Checking authentication"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  // ── 2. No token or token is expired → redirect to login ───────────────────
  if (!token || isTokenExpired(token)) {
    return <Navigate to="/login" replace />;
  }

  // ── 3. Role-based access control (optional) ────────────────────────────────
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = user?.role;
    const expandedRoles = allowedRoles.flatMap(r => r === 'Admin' ? ['Super_Admin', 'Org_Admin', 'Admin'] : [r]);
    if (!userRole || !expandedRoles.includes(userRole)) {
      // Redirect to a dedicated 403 page if it exists, otherwise fall back to
      // the dashboard so the user lands somewhere meaningful.
      return <Navigate to="/403" replace />;
    }
  }

  // ── 4. Authenticated (and authorised) — render child routes ───────────────
  return <Outlet />;
};

export default ProtectedRoute;
