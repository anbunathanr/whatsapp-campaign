/**
 * Tests for encoding detection utility
 * Validates: Requirements 3.1, 3.12, 14.6 (handle different encodings correctly)
 */

const { detectEncoding, detectAndDecodeBuffer, isValidUtf8, BOM } = require('../../utils/encodingDetector');

describe('encodingDetector', () => {
  describe('detectEncoding', () => {
    it('should detect UTF-8 BOM', () => {
      const buffer = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]); // UTF-8 BOM + "Hello"
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should detect UTF-16 LE BOM', () => {
      const buffer = Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00]); // UTF-16 LE BOM + "He"
      expect(detectEncoding(buffer)).toBe('utf-16le');
    });

    it('should detect UTF-16 BE BOM', () => {
      const buffer = Buffer.from([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65]); // UTF-16 BE BOM + "He"
      expect(detectEncoding(buffer)).toBe('utf-16be');
    });

    it('should detect UTF-8 without BOM', () => {
      const buffer = Buffer.from('Hello, World!', 'utf8');
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should fallback to ISO-8859-1 for non-UTF-8 bytes', () => {
      // Create a buffer with bytes that are invalid UTF-8 but valid ISO-8859-1
      const buffer = Buffer.from([0xc0, 0xc1, 0xf5, 0xf6, 0xf7, 0xf8]); // Invalid UTF-8 sequences
      expect(detectEncoding(buffer)).toBe('iso-8859-1');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from([]);
      expect(detectEncoding(buffer)).toBe('utf-8'); // default
    });
  });

  describe('isValidUtf8', () => {
    it('should validate ASCII text as UTF-8', () => {
      const buffer = Buffer.from('Hello, World!', 'utf8');
      expect(isValidUtf8(buffer)).toBe(true);
    });

    it('should validate multi-byte UTF-8 characters', () => {
      const buffer = Buffer.from('Héllo, 世界! 🌍', 'utf8');
      expect(isValidUtf8(buffer)).toBe(true);
    });

    it('should reject invalid UTF-8 sequences', () => {
      // Invalid UTF-8: continuation byte without start byte
      const buffer = Buffer.from([0x80, 0x81, 0x82]);
      expect(isValidUtf8(buffer)).toBe(false);
    });

    it('should reject overlong UTF-8 encoding', () => {
      // Overlong encoding of ASCII 'A' (0x41) as 2-byte sequence
      const buffer = Buffer.from([0xc0, 0x81]);
      expect(isValidUtf8(buffer)).toBe(false);
    });

    it('should reject UTF-8 surrogate pairs', () => {
      // UTF-8 encoding of surrogate pair (invalid in UTF-8)
      const buffer = Buffer.from([0xed, 0xa0, 0x80]); // U+D800
      expect(isValidUtf8(buffer)).toBe(false);
    });
  });

  describe('detectAndDecodeBuffer', () => {
    it('should decode UTF-8 text', () => {
      const buffer = Buffer.from('Hello, World!', 'utf8');
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe('Hello, World!');
    });

    it('should decode UTF-8 with BOM and strip BOM', () => {
      const buffer = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('Hello', 'utf8')]);
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe('Hello');
      expect(decoded.charCodeAt(0)).not.toBe(0xfeff); // BOM should be stripped
    });

    it('should decode UTF-16 LE with BOM', () => {
      const text = 'Hello';
      const buffer = Buffer.concat([
        Buffer.from([0xff, 0xfe]), // UTF-16 LE BOM
        Buffer.from(text, 'utf16le'),
      ]);
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe(text);
    });

    it('should decode UTF-16 BE with BOM', () => {
      const text = 'Hello';
      const textBuffer = Buffer.from(text, 'utf16le');
      // Swap bytes for BE
      const beBuffer = Buffer.alloc(textBuffer.length);
      for (let i = 0; i < textBuffer.length; i += 2) {
        beBuffer[i] = textBuffer[i + 1];
        beBuffer[i + 1] = textBuffer[i];
      }
      const buffer = Buffer.concat([
        Buffer.from([0xfe, 0xff]), // UTF-16 BE BOM
        beBuffer,
      ]);
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe(text);
    });

    it('should decode ISO-8859-1 text', () => {
      // Create text with Latin-1 specific characters (0x80-0xFF range)
      const text = 'Café résumé'; // Contains é (0xE9 in ISO-8859-1)
      const buffer = Buffer.from(text, 'latin1');
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe(text);
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from([]);
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe('');
    });

    it('should throw error for non-Buffer input', () => {
      expect(() => detectAndDecodeBuffer('not a buffer')).toThrow('Input must be a Buffer');
    });

    it('should decode CSV with UTF-8 encoding', () => {
      const csvContent = 'name,phone,company\nJohn Doe,+1234567890,Acme Corp\n';
      const buffer = Buffer.from(csvContent, 'utf8');
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe(csvContent);
    });

    it('should decode CSV with UTF-16 LE encoding', () => {
      const csvContent = 'name,phone,company\nJohn Doe,+1234567890,Acme Corp\n';
      const buffer = Buffer.concat([
        Buffer.from([0xff, 0xfe]), // UTF-16 LE BOM
        Buffer.from(csvContent, 'utf16le'),
      ]);
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe(csvContent);
    });

    it('should decode CSV with ISO-8859-1 encoding', () => {
      const csvContent = 'name,phone,company\nJosé García,+1234567890,Café Inc\n';
      const buffer = Buffer.from(csvContent, 'latin1');
      const decoded = detectAndDecodeBuffer(buffer);
      expect(decoded).toBe(csvContent);
    });
  });

  describe('BOM constants', () => {
    it('should have correct UTF-8 BOM', () => {
      expect(BOM.UTF8).toEqual([0xef, 0xbb, 0xbf]);
    });

    it('should have correct UTF-16 LE BOM', () => {
      expect(BOM.UTF16_LE).toEqual([0xff, 0xfe]);
    });

    it('should have correct UTF-16 BE BOM', () => {
      expect(BOM.UTF16_BE).toEqual([0xfe, 0xff]);
    });
  });
});
