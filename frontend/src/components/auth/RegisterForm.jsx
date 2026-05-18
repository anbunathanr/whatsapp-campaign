import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  UserCheck,
  Loader2,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import authService from '../../services/authService';
import { validateRegisterForm } from '../../utils/validators';
import api from '../../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────


// ── Component ────────────────────────────────────────────────────────────────

const RegisterForm = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // null = unknown, true = open, false = admin-only
  const [registrationOpen, setRegistrationOpen] = useState(null);
  const [checkingOpen, setCheckingOpen] = useState(true);

  // Check if public registration is available (only on first launch)
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const res = await api.get('/auth/registration-status');
        setRegistrationOpen(res.data?.data?.open ?? true);
      } catch {
        // If endpoint doesn't exist, fall back to attempting registration
        // and letting the server respond
        setRegistrationOpen(true);
      } finally {
        setCheckingOpen(false);
      }
    };
    checkRegistrationStatus();
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => validateRegisterForm(formData);

  // ── Handlers ───────────────────────────────────────────────────────────────
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
      const data = await authService.register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
      });

      // Backend response shape: { success, message, data: { token, user } }
      const token = data.data?.token ?? data.token ?? data.accessToken;
      const user = data.data?.user ?? data.user ?? null;

      if (user?.role === 'Org_Admin') {
        setSuccessMsg('Registration successful. Your organization is pending approval from the platform administrator. You will be able to log in once approved.');
      } else {
        login(token, user);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message;

      if (status === 409) {
        // Email already registered — surface as a field-level error so the
        // user can see it right next to the email input.
        setErrors((prev) => ({
          ...prev,
          email: message || 'An account with this email already exists.',
        }));
        setApiError('');
      } else if (status === 400) {
        // Validation error from the backend. Try to map it to a specific field
        // if the message mentions a known field name; otherwise show as banner.
        const lowerMsg = (message || '').toLowerCase();
        if (lowerMsg.includes('email')) {
          setErrors((prev) => ({ ...prev, email: message }));
        } else if (lowerMsg.includes('password')) {
          setErrors((prev) => ({ ...prev, password: message }));
        } else if (lowerMsg.includes('firstname') || lowerMsg.includes('first name')) {
          setErrors((prev) => ({ ...prev, firstName: message }));
        } else if (lowerMsg.includes('lastname') || lowerMsg.includes('last name')) {
          setErrors((prev) => ({ ...prev, lastName: message }));
        } else if (lowerMsg.includes('role')) {
          setErrors((prev) => ({ ...prev, role: message }));
        } else {
          setApiError(message || 'Invalid registration details. Please check your input.');
        }
      } else if (status === 429) {
        setApiError(
          'Too many registration attempts from this device. Please wait a few minutes and try again.'
        );
      } else if (!err.response) {
        // Network error or server unreachable.
        setApiError(
          'Unable to reach the server. Please check your internet connection and try again.'
        );
      } else {
        setApiError(message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Shared input class helper ──────────────────────────────────────────────
  const inputClass = (fieldName, extraPadding = 'pl-10 pr-4') =>
    `w-full rounded-lg bg-slate-700/60 border py-2.5 ${extraPadding} text-sm text-white placeholder-slate-500 outline-none transition
    focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
    disabled:opacity-50 disabled:cursor-not-allowed
    ${errors[fieldName] ? 'border-red-500' : 'border-slate-600 hover:border-slate-500'}`;

  // ── Loading state while checking registration availability ────────────────
  if (checkingOpen) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  // ── Admin-only mode: first user already exists ─────────────────────────────
  if (registrationOpen === false) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Admin approval required</h3>
            <p className="text-slate-400 text-sm mt-1 leading-relaxed">
              This platform is already configured. New accounts can only be created by an <strong className="text-white">Admin</strong> from the Admin Dashboard.
            </p>
          </div>
          <div className="w-full p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-left">
            <p className="text-xs text-blue-300 leading-relaxed">
              <strong>How to get access:</strong> Ask your platform administrator to log in, go to the <span className="font-medium text-white">Admin</span> section, and create an account for you with the appropriate role (Campaign Manager or Support Staff).
            </p>
          </div>
        </div>
        <Link
          to="/login"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Go to Login
        </Link>
        <p className="text-center text-xs text-slate-500">
          Already have credentials?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Sign in here
          </Link>
        </p>
      </div>
    );
  }

  // ── Normal registration form (first user / admin-initiated) ────────────────
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Create account form"
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

      {/* Success banner */}
      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400"
        >
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* First name + Last name row */}
      <div className="grid grid-cols-2 gap-4">
        {/* First name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="firstName" className="text-sm font-medium text-slate-300">
            First name
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
              aria-hidden="true"
            >
              <User className="w-4 h-4" />
            </span>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={formData.firstName}
              onChange={handleChange}
              disabled={loading}
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              placeholder="Jane"
              className={inputClass('firstName')}
            />
          </div>
          {errors.firstName && (
            <p id="firstName-error" role="alert" className="text-xs text-red-400">
              {errors.firstName}
            </p>
          )}
        </div>

        {/* Last name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lastName" className="text-sm font-medium text-slate-300">
            Last name
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
              aria-hidden="true"
            >
              <UserCheck className="w-4 h-4" />
            </span>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={formData.lastName}
              onChange={handleChange}
              disabled={loading}
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
              placeholder="Doe"
              className={inputClass('lastName')}
            />
          </div>
          {errors.lastName && (
            <p id="lastName-error" role="alert" className="text-xs text-red-400">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-slate-300">
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
            className={inputClass('email')}
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
        <label htmlFor="password" className="text-sm font-medium text-slate-300">
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
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : 'password-hint'}
            placeholder="••••••••"
            className={inputClass('password', 'pl-10 pr-10')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={loading}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.password ? (
          <p id="password-error" role="alert" className="text-xs text-red-400">
            {errors.password}
          </p>
        ) : (
          <p id="password-hint" className="text-xs text-slate-500">
            Min. 8 characters with uppercase, lowercase, number &amp; special character.
          </p>
        )}
      </div>

      {/* Confirm password field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">
          Confirm password
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
            aria-hidden="true"
          >
            <Lock className="w-4 h-4" />
          </span>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
            placeholder="••••••••"
            className={inputClass('confirmPassword', 'pl-10 pr-10')}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            disabled={loading}
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            {showConfirmPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p id="confirmPassword-error" role="alert" className="text-xs text-red-400">
            {errors.confirmPassword}
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
            <span>Creating account…</span>
          </>
        ) : (
          'Create account'
        )}
      </button>

      {/* Back to login link */}
      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
};

export default RegisterForm;
