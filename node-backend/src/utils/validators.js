/**
 * Shared validation utility functions.
 */

/**
 * Validate E.164 phone number format.
 * E.164: + followed by 1-15 digits, no spaces or dashes.
 * @param {string} phone
 * @returns {boolean}
 */
const isValidE164Phone = (phone) => {
  if (typeof phone !== 'string') {
    return false;
  }
  return /^\+[1-9]\d{0,14}$/.test(phone.trim());
};

/**
 * Validate email address format.
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  if (typeof email !== 'string') {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/**
 * Validate password strength.
 * Minimum 8 characters, at least one uppercase, one lowercase, one digit,
 * and at least one special character.
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true, message: 'Password is strong' };
};

/**
 * Normalize a phone number by stripping whitespace.
 * @param {string} phone
 * @returns {string}
 */
const normalizePhone = (phone) => {
  if (typeof phone !== 'string') {
    return '';
  }
  return phone.replace(/\s+/g, '').trim();
};

/**
 * Validate a phone number and return a descriptive result.
 * Provides specific error messages for different invalid formats.
 * Does NOT normalize whitespace — call normalizePhone first if needed.
 *
 * E.164 format: + followed by 1–15 digits, first digit non-zero.
 *
 * @param {string} phone
 * @returns {{ valid: boolean, message: string }}
 */
const validatePhone = (phone) => {
  // ── Null / undefined ──────────────────────────────────────────────────────
  if (phone === null || phone === undefined) {
    return { valid: false, message: 'Phone number is required' };
  }

  // ── Non-string type ───────────────────────────────────────────────────────
  if (typeof phone !== 'string') {
    return {
      valid: false,
      message: 'Phone number must be a string in E.164 format (e.g. +12125551234)',
    };
  }

  // ── Empty string ──────────────────────────────────────────────────────────
  if (phone.trim().length === 0) {
    return { valid: false, message: 'Phone number is required' };
  }

  // ── Contains spaces ───────────────────────────────────────────────────────
  if (/\s/.test(phone)) {
    return {
      valid: false,
      message:
        'Phone number must not contain spaces. Use E.164 format without spaces (e.g. +12125551234)',
    };
  }

  // ── Missing leading + ─────────────────────────────────────────────────────
  if (!phone.startsWith('+')) {
    return {
      valid: false,
      message:
        "Phone number must start with '+' followed by the country code and number in E.164 format (e.g. +12125551234)",
    };
  }

  const afterPlus = phone.slice(1);

  // ── Nothing after + ───────────────────────────────────────────────────────
  if (afterPlus.length === 0) {
    return {
      valid: false,
      message:
        "Phone number must have digits after '+'. E.164 format requires 1–15 digits (e.g. +12125551234)",
    };
  }

  // ── Contains non-numeric characters after + ───────────────────────────────
  if (!/^\d+$/.test(afterPlus)) {
    return {
      valid: false,
      message:
        "Phone number must contain only digits after '+'. Remove dashes, parentheses, or other special characters (e.g. +12125551234)",
    };
  }

  // ── Starts with +0 (invalid country code) ────────────────────────────────
  if (afterPlus.startsWith('0')) {
    return {
      valid: false,
      message:
        "Phone number country code must not start with '0'. E.164 country codes begin with 1–9 (e.g. +12125551234)",
    };
  }

  // ── Too short (fewer than 7 digits total including country code) ──────────
  // E.164 minimum is 1 digit (e.g. +1), but practical minimum for a dialable
  // number is 7 digits total (country code + subscriber number).
  // Per spec: "Too short (fewer than 7 digits after country code)" — we check
  // total digits (afterPlus) >= 7 for a practical minimum.
  if (afterPlus.length < 7) {
    return {
      valid: false,
      message:
        'Phone number is too short. E.164 numbers must have at least 7 digits after the country code (e.g. +12125551234)',
    };
  }

  // ── Too long (more than 15 digits total) ──────────────────────────────────
  if (afterPlus.length > 15) {
    return {
      valid: false,
      message:
        'Phone number is too long. E.164 numbers must have at most 15 digits in total (e.g. +12125551234)',
    };
  }

  return { valid: true, message: 'Phone number is valid' };
};

module.exports = {
  isValidE164Phone,
  isValidEmail,
  validatePasswordStrength,
  normalizePhone,
  validatePhone,
};
