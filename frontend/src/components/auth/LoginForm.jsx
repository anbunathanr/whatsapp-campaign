import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import authService from '../../services/authService';
import { validateLoginForm } from '../../utils/validators';

const LoginForm = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = () => validateLoginForm(formData);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear field-level error as the user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    // Clear API-level error on any change
    if (apiError) setApiError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setApiError('');

    try {
      const data = await authService.login(
        formData.email.trim(),
        formData.password
      );

      // Backend response shape: { success, message, data: { token, user } }
      const token = data.data?.token ?? data.token ?? data.accessToken;
      const user = data.data?.user ?? data.user ?? null;
      login(token, user);

      navigate('/dashboard', { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message;

      if (status === 401 || status === 400) {
        // Generic "invalid credentials" — backend intentionally doesn't reveal
        // whether the email or password was wrong (security requirement 1).
        setApiError(message || 'Invalid email or password. Please try again.');
      } else if (status === 423) {
        // Account temporarily locked after too many failed attempts (Req 1.6 / 10.6).
        // Backend message already contains the remaining lock duration, e.g.
        // "Account is temporarily locked. Please try again in 3 minute(s)."
        setApiError(
          message ||
            'Your account has been temporarily locked due to too many failed login attempts. Please try again later.'
        );
      } else if (status === 403) {
        // Account disabled by an administrator.
        setApiError(
          message || 'Your account has been disabled. Please contact an administrator.'
        );
      } else if (status === 429) {
        setApiError(
          'Too many login attempts from this device. Please wait a few minutes and try again.'
        );
      } else if (!err.response) {
        // Network error or server unreachable.
        setApiError(
          'Unable to reach the server. Please check your internet connection and try again.'
        );
      } else {
        setApiError(
          message || 'An unexpected error occurred. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Sign in form"
      className="flex flex-col gap-5"
    >
      {/* API / server error banner */}
      {apiError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400"
        >
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{apiError}</span>
        </div>
      )}

      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-slate-300"
        >
          Email address
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
            aria-hidden="true"
          >
            <Mail className="w-4 h-4" />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            placeholder="you@example.com"
            className={`w-full rounded-lg bg-slate-700/60 border py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition
              focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
              disabled:opacity-50 disabled:cursor-not-allowed
              ${errors.email ? 'border-red-500' : 'border-slate-600 hover:border-slate-500'}`}
          />
        </div>
        {errors.email && (
          <p id="email-error" role="alert" className="text-xs text-red-400">
            {errors.email}
          </p>
        )}
      </div>

      {/* Password field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-slate-300"
        >
          Password
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
            aria-hidden="true"
          >
            <Lock className="w-4 h-4" />
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            placeholder="••••••••"
            className={`w-full rounded-lg bg-slate-700/60 border py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 outline-none transition
              focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
              disabled:opacity-50 disabled:cursor-not-allowed
              ${errors.password ? 'border-red-500' : 'border-slate-600 hover:border-slate-500'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={loading}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" role="alert" className="text-xs text-red-400">
            {errors.password}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white
          hover:bg-indigo-500 active:bg-indigo-700 transition-colors
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800
          disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Signing in…</span>
          </>
        ) : (
          'Sign in'
        )}
      </button>

      {/* Register link */}
      <p className="text-center text-sm text-slate-400">
        Don&apos;t have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Create one
        </Link>
      </p>
    </form>
  );
};

export default LoginForm;
