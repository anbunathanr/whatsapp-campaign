/**
 * Normalizes Indian phone numbers into E.164 format.
 * 
 * Requirements:
 * - If the phone number does NOT start with "+"
 * - Automatically prepend "+91" (for 10-digit numbers or 12-digit starting with 91)
 * - Remove spaces, hyphens, brackets, special characters
 * - Keep already formatted E.164 numbers unchanged
 *
 * @param {string} phone
 * @returns {string} Sanitized and normalized phone number
 */
const normalizeIndianPhone = (phone) => {
  if (typeof phone !== 'string') {
    return phone;
  }

  // 1. Remove common separators: spaces, hyphens, parentheses, dots
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // 2. Identify if it already has a plus sign
  const hasPlus = cleaned.startsWith('+');
  
  // 3. Remove any remaining non-digit characters
  cleaned = cleaned.replace(/[^\d]/g, '');

  // Restore the plus sign if it was there
  if (hasPlus) {
    cleaned = '+' + cleaned;
  }

  // 4. Normalize Indian numbers
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      // 10 digits -> +91...
      cleaned = '+91' + cleaned;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      // 12 digits starting with 91 -> +91...
      cleaned = '+' + cleaned;
    }
  }

  return cleaned;
};

module.exports = {
  normalizeIndianPhone,
};
