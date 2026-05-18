'use strict';

/**
 * Unit tests for E.164 phone number validation utilities.
 * Tests isValidE164Phone, normalizePhone, and validatePhone from validators.js.
 */

const { isValidE164Phone, normalizePhone, validatePhone } = require('../../utils/validators');

// ── isValidE164Phone ──────────────────────────────────────────────────────────

describe('isValidE164Phone', () => {
  describe('valid E.164 numbers', () => {
    it('accepts a US number +12125551234', () => {
      expect(isValidE164Phone('+12125551234')).toBe(true);
    });

    it('accepts a UK number +447911123456', () => {
      expect(isValidE164Phone('+447911123456')).toBe(true);
    });

    it('accepts an India number +919876543210', () => {
      expect(isValidE164Phone('+919876543210')).toBe(true);
    });

    it('accepts the minimum valid number +1 (single digit after +)', () => {
      expect(isValidE164Phone('+1')).toBe(true);
    });

    it('accepts a 15-digit number (maximum length)', () => {
      // + followed by 15 digits, first digit non-zero
      expect(isValidE164Phone('+123456789012345')).toBe(true);
    });

    it('accepts a 2-digit number +12', () => {
      expect(isValidE164Phone('+12')).toBe(true);
    });
  });

  describe('invalid: missing + prefix', () => {
    it('rejects a number without + prefix', () => {
      expect(isValidE164Phone('12125551234')).toBe(false);
    });

    it('rejects a number starting with 00 (international prefix without +)', () => {
      expect(isValidE164Phone('0012125551234')).toBe(false);
    });
  });

  describe('invalid: starts with +0', () => {
    it('rejects +0 (country code starting with 0)', () => {
      expect(isValidE164Phone('+0')).toBe(false);
    });

    it('rejects +012345 (starts with +0)', () => {
      expect(isValidE164Phone('+012345')).toBe(false);
    });
  });

  describe('invalid: too long (> 15 digits after +)', () => {
    it('rejects a 16-digit number', () => {
      expect(isValidE164Phone('+1234567890123456')).toBe(false);
    });

    it('rejects a 20-digit number', () => {
      expect(isValidE164Phone('+12345678901234567890')).toBe(false);
    });
  });

  describe('invalid: too short', () => {
    it('rejects a bare + with no digits', () => {
      expect(isValidE164Phone('+')).toBe(false);
    });
  });

  describe('invalid: contains spaces or dashes', () => {
    it('rejects a number with spaces', () => {
      expect(isValidE164Phone('+1 212 555 1234')).toBe(false);
    });

    it('rejects a number with dashes', () => {
      expect(isValidE164Phone('+1-212-555-1234')).toBe(false);
    });

    it('rejects a number with parentheses', () => {
      expect(isValidE164Phone('+1(212)5551234')).toBe(false);
    });
  });

  describe('invalid: non-string inputs', () => {
    it('rejects null', () => {
      expect(isValidE164Phone(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isValidE164Phone(undefined)).toBe(false);
    });

    it('rejects a number type', () => {
      expect(isValidE164Phone(12125551234)).toBe(false);
    });

    it('rejects an object', () => {
      expect(isValidE164Phone({ phone: '+12125551234' })).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidE164Phone('')).toBe(false);
    });
  });
});

// ── normalizePhone ────────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  it('strips leading and trailing spaces', () => {
    expect(normalizePhone('  +12125551234  ')).toBe('+12125551234');
  });

  it('strips internal spaces', () => {
    expect(normalizePhone('+1 212 555 1234')).toBe('+12125551234');
  });

  it('strips tabs and other whitespace characters', () => {
    expect(normalizePhone('+1\t212\t555\t1234')).toBe('+12125551234');
  });

  it('returns the string unchanged when there are no spaces', () => {
    expect(normalizePhone('+12125551234')).toBe('+12125551234');
  });

  it('returns an empty string for non-string null input', () => {
    expect(normalizePhone(null)).toBe('');
  });

  it('returns an empty string for non-string undefined input', () => {
    expect(normalizePhone(undefined)).toBe('');
  });

  it('returns an empty string for a numeric input', () => {
    expect(normalizePhone(12125551234)).toBe('');
  });

  it('returns an empty string for an object input', () => {
    expect(normalizePhone({ phone: '+12125551234' })).toBe('');
  });

  it('handles an already-empty string', () => {
    expect(normalizePhone('')).toBe('');
  });
});

// ── validatePhone ─────────────────────────────────────────────────────────────

describe('validatePhone', () => {
  describe('valid numbers', () => {
    it('returns { valid: true } for a valid US number', () => {
      const result = validatePhone('+12125551234');
      expect(result.valid).toBe(true);
    });

    it('returns { valid: true } for a valid UK number', () => {
      const result = validatePhone('+447911123456');
      expect(result.valid).toBe(true);
    });

    it('returns { valid: true } for a valid India number', () => {
      const result = validatePhone('+919876543210');
      expect(result.valid).toBe(true);
    });

    it('returns { valid: true } for the minimum valid number +1234567 (7 digits)', () => {
      const result = validatePhone('+1234567');
      expect(result.valid).toBe(true);
    });

    it('returns a message property even for valid numbers', () => {
      const result = validatePhone('+12125551234');
      expect(result).toHaveProperty('message');
    });
  });

  describe('invalid: null / undefined', () => {
    it('returns { valid: false } with a descriptive message for null', () => {
      const result = validatePhone(null);
      expect(result.valid).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('returns { valid: false } with a descriptive message for undefined', () => {
      const result = validatePhone(undefined);
      expect(result.valid).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe('invalid: non-string types', () => {
    it('returns { valid: false } with a descriptive message for a number type', () => {
      const result = validatePhone(12125551234);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/string|E\.164/i);
    });

    it('returns { valid: false } with a descriptive message for an object', () => {
      const result = validatePhone({ phone: '+12125551234' });
      expect(result.valid).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe('invalid: missing + prefix', () => {
    it('returns { valid: false } with an E.164 message when + is missing', () => {
      const result = validatePhone('12125551234');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/E\.164/i);
    });
  });

  describe('invalid: starts with +0', () => {
    it('returns { valid: false } with a country-code message for +0...', () => {
      const result = validatePhone('+0123456789');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/country|0/i);
    });

    it('returns { valid: false } with a country-code message for +012345', () => {
      const result = validatePhone('+012345');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/country|0/i);
    });
  });

  describe('invalid: too long', () => {
    it('returns { valid: false } with a too-long message for a 16-digit number', () => {
      const result = validatePhone('+1234567890123456');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/long|15/i);
    });

    it('returns { valid: false } with a too-long message for a 20-digit number', () => {
      const result = validatePhone('+12345678901234567890');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/long|15/i);
    });
  });

  describe('invalid: too short', () => {
    it('returns { valid: false } with a too-short message for fewer than 7 digits', () => {
      const result = validatePhone('+12345');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/short|7/i);
    });

    it('returns { valid: false } with a message for bare +', () => {
      const result = validatePhone('+');
      expect(result.valid).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe('invalid: empty string', () => {
    it('returns { valid: false } with a descriptive message for an empty string', () => {
      const result = validatePhone('');
      expect(result.valid).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe('invalid: contains spaces', () => {
    it('returns { valid: false } with a spaces message for a number with spaces', () => {
      const result = validatePhone('+1 212 555 1234');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/space/i);
    });
  });

  describe('invalid: non-numeric characters after +', () => {
    it('returns { valid: false } with a non-numeric message for dashes', () => {
      const result = validatePhone('+1-212-555-1234');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/digit|special/i);
    });

    it('returns { valid: false } with a non-numeric message for parentheses', () => {
      const result = validatePhone('+1(212)5551234');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/digit|special/i);
    });

    it('returns { valid: false } with a non-numeric message for letters', () => {
      const result = validatePhone('+1abc5551234');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/digit|special/i);
    });
  });
});
