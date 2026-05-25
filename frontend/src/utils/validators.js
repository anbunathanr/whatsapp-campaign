// ── Shared validation utilities ───────────────────────────────────────────────

/**
 * Returns true if `value` matches a basic email format.
 * @param {string} value
 * @returns {boolean}
 */
export const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Returns true if `value` meets the strong-password requirements:
 * at least 8 characters, one uppercase letter, one lowercase letter,
 * one digit, and one special character.
 * @param {string} value
 * @returns {boolean}
 */
export const isStrongPassword = (value) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(
    value
  );

/**
 * Validates login form data.
 * @param {{ email: string, password: string }} formData
 * @returns {Object} errors – an object whose keys are field names and values are error messages.
 *                            An empty object means the form is valid.
 */
export const validateLoginForm = (formData) => {
  const errors = {};

  if (!formData.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!isValidEmail(formData.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!formData.password) {
    errors.password = 'Password is required.';
  }

  return errors;
};

/**
 * Validates registration form data.
 * @param {{ firstName: string, lastName: string, email: string, password: string, confirmPassword: string, role: string }} formData
 * @returns {Object} errors – an object whose keys are field names and values are error messages.
 *                            An empty object means the form is valid.
 */
export const validateRegisterForm = (formData) => {
  const errors = {};

  if (!formData.firstName.trim()) {
    errors.firstName = 'First name is required.';
  }

  if (!formData.lastName.trim()) {
    errors.lastName = 'Last name is required.';
  }

  if (!formData.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!isValidEmail(formData.email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!formData.password) {
    errors.password = 'Password is required.';
  } else if (!isStrongPassword(formData.password)) {
    errors.password =
      'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';
  }

  if (!formData.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (formData.password !== formData.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
};

export default { isValidEmail, isStrongPassword, validateLoginForm, validateRegisterForm };
