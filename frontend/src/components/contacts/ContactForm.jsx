import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Loader2,
  AlertCircle,
  User,
  Phone,
  Briefcase,
  Building2,
  Factory,
  Tag,
  MapPin,
  ChevronDown,
  Save,
} from 'lucide-react';
import contactService from '../../services/contactService';

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Retail',
  'Manufacturing', 'Real Estate', 'Hospitality', 'Transportation',
  'Energy', 'Agriculture', 'Construction', 'Media', 'Telecommunications',
  'Automotive', 'Aerospace', 'Pharmaceuticals', 'Food & Beverage',
  'Fashion', 'Entertainment', 'Legal', 'Consulting', 'Insurance',
  'Banking', 'E-commerce', 'Logistics', 'Marketing', 'Non-Profit',
  'Energy and Utilities', 'Transportation and Logistics', 'Aerospace and Defense',
  'Banking and Financial Services', 'Biotechnology', 'Other',
];

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a phone number against E.164 format: + followed by 1–15 digits.
 * @param {string} value
 * @returns {boolean}
 */
const isValidE164 = (value) => /^\+[1-9]\d{1,14}$/.test(value.trim());

/**
 * Validates the contact form data.
 * @param {Object} data
 * @returns {Object} errors – empty object means valid.
 */
const validateContactForm = (data) => {
  const errors = {};

  if (!data.name.trim()) {
    errors.name = 'Name is required.';
  }

  if (!data.phone.trim()) {
    errors.phone = 'Phone number is required.';
  } else if (!isValidE164(data.phone.trim())) {
    errors.phone = 'Phone must be in E.164 format (e.g. +12025551234).';
  }



  return errors;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Reusable field wrapper with label and inline error */
const Field = ({ id, label, required, error, icon: Icon, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-sm font-medium text-slate-300">
      {label}
      {required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
    </label>
    <div className="relative">
      {Icon && (
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
          aria-hidden="true"
        >
          <Icon className="w-4 h-4" />
        </span>
      )}
      {children}
    </div>
    {error && (
      <p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-xs text-red-400">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        {error}
      </p>
    )}
  </div>
);

/** Text input styled for the dark theme */
const TextInput = ({ id, icon, error, ...props }) => (
  <input
    id={id}
    aria-invalid={!!error}
    aria-describedby={error ? `${id}-error` : undefined}
    className={[
      'w-full rounded-lg bg-slate-700/60 border py-2.5 text-sm text-white placeholder-slate-500',
      'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      icon ? 'pl-10 pr-4' : 'px-4',
      error ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
    ].join(' ')}
    {...props}
  />
);

// ─── Main ContactForm component ───────────────────────────────────────────────

/**
 * ContactForm – create or edit a contact.
 *
 * @param {Object}   props
 * @param {Object}   [props.contact]   - Existing contact for edit mode; omit for create mode.
 * @param {Function} props.onSuccess   - Called with the saved contact after a successful save.
 * @param {Function} props.onCancel    - Called when the user cancels.
 */
const ContactForm = ({ contact, onSuccess, onCancel }) => {
  const isEditMode = Boolean(contact?._id);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    jobTitle: '',
    company: '',
    industry: '',
    tags: [],
    location: { city: '', state: '', country: '' },
    customFields: {},
  });

  const [tagInput, setTagInput] = useState('');
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Populate form when editing ─────────────────────────────────────────────
  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name ?? '',
        phone: contact.phone ?? '',
        jobTitle: contact.jobTitle ?? '',
        company: contact.company ?? '',
        industry: contact.industry ?? '',
        tags: Array.isArray(contact.tags) ? [...contact.tags] : [],
        location: {
          city: contact.location?.city ?? '',
          state: contact.location?.state ?? '',
          country: contact.location?.country ?? '',
        },
        customFields: contact.customFields
          ? Object.fromEntries(
              contact.customFields instanceof Map
                ? contact.customFields
                : Object.entries(contact.customFields)
            )
          : {},
      });
    }
  }, [contact]);

  // ── Field change handlers ──────────────────────────────────────────────────
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) setApiError('');
  }, [errors, apiError]);

  const handleLocationChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      location: { ...prev.location, [name]: value },
    }));
    if (apiError) setApiError('');
  }, [apiError]);

  // ── Tag management ─────────────────────────────────────────────────────────
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !formData.tags.includes(trimmed)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, trimmed] }));
    }
    setTagInput('');
  }, [tagInput, formData.tags]);

  const removeTag = useCallback((tag) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }, []);

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  // ── Custom fields management ───────────────────────────────────────────────
  const addCustomField = useCallback(() => {
    const key = customFieldKey.trim();
    const value = customFieldValue.trim();
    if (!key) return;
    setFormData((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [key]: value },
    }));
    setCustomFieldKey('');
    setCustomFieldValue('');
  }, [customFieldKey, customFieldValue]);

  const removeCustomField = useCallback((key) => {
    setFormData((prev) => {
      const next = { ...prev.customFields };
      delete next[key];
      return { ...prev, customFields: next };
    });
  }, []);

  const handleCustomFieldKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomField();
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validateContactForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setApiError('');

    // Build payload – strip empty optional strings
    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      industry: formData.industry,
      ...(formData.jobTitle.trim() && { jobTitle: formData.jobTitle.trim() }),
      ...(formData.company.trim() && { company: formData.company.trim() }),
      tags: formData.tags,
      location: {
        ...(formData.location.city.trim() && { city: formData.location.city.trim() }),
        ...(formData.location.state.trim() && { state: formData.location.state.trim() }),
        ...(formData.location.country.trim() && { country: formData.location.country.trim() }),
      },
      ...(Object.keys(formData.customFields).length > 0 && {
        customFields: formData.customFields,
      }),
    };

    try {
      let saved;
      if (isEditMode) {
        saved = await contactService.updateContact(contact._id, payload);
      } else {
        saved = await contactService.createContact(payload);
      }
      onSuccess?.(saved);
    } catch (err) {
      const message = err?.response?.data?.message ?? err.message ?? 'An unexpected error occurred.';
      // Surface duplicate phone error clearly
      if (err?.response?.status === 409 || message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('phone')) {
        setErrors((prev) => ({ ...prev, phone: message }));
      } else {
        setApiError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={isEditMode ? 'Edit contact form' : 'Create contact form'}
      className="flex flex-col gap-6"
    >
      {/* API error banner */}
      {apiError && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{apiError}</span>
          <button
            type="button"
            onClick={() => setApiError('')}
            className="text-red-400 hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Section: Basic Info ── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Basic Information
        </legend>

        {/* Name */}
        <Field id="name" label="Full Name" required error={errors.name} icon={User}>
          <TextInput
            id="name"
            name="name"
            type="text"
            icon
            value={formData.name}
            onChange={handleChange}
            disabled={loading}
            placeholder="Jane Doe"
            autoComplete="name"
            error={errors.name}
          />
        </Field>

        {/* Phone */}
        <Field id="phone" label="Phone Number" required error={errors.phone} icon={Phone}>
          <TextInput
            id="phone"
            name="phone"
            type="tel"
            icon
            value={formData.phone}
            onChange={handleChange}
            disabled={loading}
            placeholder="+12025551234"
            autoComplete="tel"
            error={errors.phone}
          />
        </Field>

        {/* Job Title */}
        <Field id="jobTitle" label="Job Title" error={errors.jobTitle} icon={Briefcase}>
          <TextInput
            id="jobTitle"
            name="jobTitle"
            type="text"
            icon
            value={formData.jobTitle}
            onChange={handleChange}
            disabled={loading}
            placeholder="Marketing Manager"
            autoComplete="organization-title"
            error={errors.jobTitle}
          />
        </Field>

        {/* Company */}
        <Field id="company" label="Company" error={errors.company} icon={Building2}>
          <TextInput
            id="company"
            name="company"
            type="text"
            icon
            value={formData.company}
            onChange={handleChange}
            disabled={loading}
            placeholder="Acme Corp"
            autoComplete="organization"
            error={errors.company}
          />
        </Field>

        {/* Industry */}
        <Field id="industry" label="Industry" required error={errors.industry} icon={Factory}>
          <select
            id="industry"
            name="industry"
            value={formData.industry}
            onChange={handleChange}
            disabled={loading}
            aria-invalid={!!errors.industry}
            aria-describedby={errors.industry ? 'industry-error' : undefined}
            className={[
              'w-full appearance-none rounded-lg bg-slate-700/60 border py-2.5 pl-10 pr-10 text-sm',
              'outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              formData.industry ? 'text-white' : 'text-slate-500',
              errors.industry ? 'border-red-500' : 'border-slate-600 hover:border-slate-500',
            ].join(' ')}
          >
            <option value="" disabled>Select an industry…</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind} className="bg-slate-800 text-white">
                {ind}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500 w-4 h-4 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
        </Field>
      </fieldset>

      {/* ── Section: Tags ── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Tags
        </legend>

        {/* Tag input */}
        <div className="flex gap-2" role="group" aria-label="Add tag">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500" aria-hidden="true">
              <Tag className="w-4 h-4" />
            </span>
            <input
              id="tagInput"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              disabled={loading}
              placeholder="Add a tag (press Enter or comma)"
              aria-label="Tag name"
              className="w-full rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="button"
            onClick={addTag}
            disabled={loading || !tagInput.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Add tag"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Tag chips */}
        {formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-2" role="list" aria-label="Tags">
            {formData.tags.map((tag) => (
              <span
                key={tag}
                role="listitem"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={loading}
                  className="hover:text-white transition-colors disabled:opacity-50"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </fieldset>

      {/* ── Section: Location ── */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Location
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* City */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="city" className="text-sm font-medium text-slate-300">
              City
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500" aria-hidden="true">
                <MapPin className="w-4 h-4" />
              </span>
              <input
                id="city"
                name="city"
                type="text"
                value={formData.location.city}
                onChange={handleLocationChange}
                disabled={loading}
                placeholder="New York"
                autoComplete="address-level2"
                className="w-full rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* State */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="state" className="text-sm font-medium text-slate-300">
              State / Province
            </label>
            <input
              id="state"
              name="state"
              type="text"
              value={formData.location.state}
              onChange={handleLocationChange}
              disabled={loading}
              placeholder="NY"
              autoComplete="address-level1"
              className="w-full rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 px-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Country */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="country" className="text-sm font-medium text-slate-300">
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              value={formData.location.country}
              onChange={handleLocationChange}
              disabled={loading}
              placeholder="United States"
              autoComplete="country-name"
              className="w-full rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 px-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </fieldset>

      {/* ── Section: Custom Fields ── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Custom Fields
        </legend>

        {/* Custom field input row */}
        <div className="flex gap-2" role="group" aria-label="Add custom field">
          <input
            type="text"
            value={customFieldKey}
            onChange={(e) => setCustomFieldKey(e.target.value)}
            onKeyDown={handleCustomFieldKeyDown}
            disabled={loading}
            placeholder="Field name"
            aria-label="Custom field name"
            className="flex-1 rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 px-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <input
            type="text"
            value={customFieldValue}
            onChange={(e) => setCustomFieldValue(e.target.value)}
            onKeyDown={handleCustomFieldKeyDown}
            disabled={loading}
            placeholder="Value"
            aria-label="Custom field value"
            className="flex-1 rounded-lg bg-slate-700/60 border border-slate-600 hover:border-slate-500 py-2.5 px-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={addCustomField}
            disabled={loading || !customFieldKey.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Add custom field"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Custom field chips */}
        {Object.keys(formData.customFields).length > 0 && (
          <div className="flex flex-col gap-2" role="list" aria-label="Custom fields">
            {Object.entries(formData.customFields).map(([key, value]) => (
              <div
                key={key}
                role="listitem"
                className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-700/40 border border-slate-700 rounded-lg text-sm"
              >
                <span className="text-slate-400 font-medium min-w-0 truncate">{key}</span>
                <span className="text-slate-300 flex-1 min-w-0 truncate text-right">{value}</span>
                <button
                  type="button"
                  onClick={() => removeCustomField(key)}
                  disabled={loading}
                  className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  aria-label={`Remove custom field ${key}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* ── Form Actions ── */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>{isEditMode ? 'Saving…' : 'Creating…'}</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{isEditMode ? 'Save Changes' : 'Create Contact'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default ContactForm;
