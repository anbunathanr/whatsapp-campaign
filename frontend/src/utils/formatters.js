// Utility functions for formatting data in the UI

/**
 * Format a number with locale-aware thousands separators
 * @param {number} num
 * @returns {string}
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString();
};

/**
 * Format a percentage value
 * @param {number} value - decimal (0-1) or percentage (0-100)
 * @param {boolean} isDecimal - true if value is 0-1 range
 * @returns {string}
 */
export const formatPercent = (value, isDecimal = false) => {
  const pct = isDecimal ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
};

/**
 * Format a date string to a readable format
 * @param {string|Date} date
 * @returns {string}
 */
export const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format a datetime string to a readable format
 * @param {string|Date} date
 * @returns {string}
 */
export const formatDateTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
