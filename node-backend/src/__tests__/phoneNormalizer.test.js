const { normalizeIndianPhone } = require('../utils/phoneNormalizer');

describe('phoneNormalizer Utility', () => {
  describe('normalizeIndianPhone', () => {
    it('should normalize valid 10-digit Indian numbers by prepending +91', () => {
      expect(normalizeIndianPhone('9876543210')).toBe('+919876543210');
      expect(normalizeIndianPhone('8765432109')).toBe('+918765432109');
    });

    it('should remove spaces, hyphens, brackets, and special characters', () => {
      expect(normalizeIndianPhone('91 9876543210')).toBe('+919876543210');
      expect(normalizeIndianPhone('(98765)43210')).toBe('+919876543210');
      expect(normalizeIndianPhone('987-654-3210')).toBe('+919876543210');
      expect(normalizeIndianPhone('987.654.3210')).toBe('+919876543210');
      expect(normalizeIndianPhone('987 654 3210')).toBe('+919876543210');
    });

    it('should normalize 12-digit numbers starting with 91 by prepending +', () => {
      expect(normalizeIndianPhone('919876543210')).toBe('+919876543210');
      expect(normalizeIndianPhone('91 98765 43210')).toBe('+919876543210');
    });

    it('should keep already formatted E.164 numbers unchanged', () => {
      expect(normalizeIndianPhone('+919876543210')).toBe('+919876543210');
      expect(normalizeIndianPhone('+12025550170')).toBe('+12025550170');
    });

    it('should return cleaned number if it does not match Indian format but is not E.164', () => {
      // Short numbers
      expect(normalizeIndianPhone('12345')).toBe('12345');
      // Other country code without plus
      expect(normalizeIndianPhone('12025550170')).toBe('12025550170');
    });

    it('should handle non-string inputs gracefully', () => {
      expect(normalizeIndianPhone(null)).toBe(null);
      expect(normalizeIndianPhone(undefined)).toBe(undefined);
      expect(normalizeIndianPhone(1234567890)).toBe(1234567890);
    });

    it('should handle empty strings', () => {
      expect(normalizeIndianPhone('')).toBe('');
      expect(normalizeIndianPhone('   ')).toBe('');
    });
  });
});
