/**
 * Encoding Detector Utility
 *
 * Detects and decodes file buffers with different encodings:
 *   - UTF-8 (with or without BOM)
 *   - UTF-16 LE (with BOM: 0xFF 0xFE)
 *   - UTF-16 BE (with BOM: 0xFE 0xFF)
 *   - ISO-8859-1 / Latin-1 (heuristic fallback)
 *
 * Uses iconv-lite for encoding conversion.
 * Validates: Requirements 3.1, 3.12, 14.6 (handle different encodings correctly)
 */

const iconv = require('iconv-lite');

/**
 * BOM (Byte Order Mark) byte sequences for encoding detection.
 */
const BOM = {
  UTF8: [0xef, 0xbb, 0xbf],
  UTF16_LE: [0xff, 0xfe],
  UTF16_BE: [0xfe, 0xff],
};

/**
 * Detect the encoding of a buffer by inspecting BOM bytes.
 *
 * @param {Buffer} buffer - The raw file buffer to inspect
 * @returns {'utf-8'|'utf-16le'|'utf-16be'|'iso-8859-1'} Detected encoding name
 */
const detectEncoding = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return 'utf-8';
  }

  // Check for UTF-16 LE BOM (0xFF 0xFE)
  if (buffer.length >= 2 && buffer[0] === BOM.UTF16_LE[0] && buffer[1] === BOM.UTF16_LE[1]) {
    // Make sure it's not UTF-32 LE (0xFF 0xFE 0x00 0x00)
    if (buffer.length < 4 || buffer[2] !== 0x00 || buffer[3] !== 0x00) {
      return 'utf-16le';
    }
  }

  // Check for UTF-16 BE BOM (0xFE 0xFF)
  if (buffer.length >= 2 && buffer[0] === BOM.UTF16_BE[0] && buffer[1] === BOM.UTF16_BE[1]) {
    return 'utf-16be';
  }

  // Check for UTF-8 BOM (0xEF 0xBB 0xBF)
  if (
    buffer.length >= 3 &&
    buffer[0] === BOM.UTF8[0] &&
    buffer[1] === BOM.UTF8[1] &&
    buffer[2] === BOM.UTF8[2]
  ) {
    return 'utf-8'; // UTF-8 with BOM — still UTF-8
  }

  // Heuristic: check if the buffer is valid UTF-8
  if (isValidUtf8(buffer)) {
    return 'utf-8';
  }

  // Fallback: ISO-8859-1 (Latin-1) — handles bytes 0x80-0xFF as Latin characters
  return 'iso-8859-1';
};

/**
 * Check if a buffer contains valid UTF-8 encoded text.
 * Scans for invalid UTF-8 byte sequences.
 *
 * @param {Buffer} buffer - Buffer to validate
 * @returns {boolean} true if the buffer is valid UTF-8
 */
const isValidUtf8 = (buffer) => {
  let i = 0;
  while (i < buffer.length) {
    const byte = buffer[i];

    if (byte <= 0x7f) {
      // Single-byte ASCII character
      i += 1;
    } else if ((byte & 0xe0) === 0xc0) {
      // 2-byte sequence: 110xxxxx 10xxxxxx
      if (i + 1 >= buffer.length || (buffer[i + 1] & 0xc0) !== 0x80) {
        return false;
      }
      // Check for overlong encoding
      if ((byte & 0x1e) === 0) {
        return false;
      }
      i += 2;
    } else if ((byte & 0xf0) === 0xe0) {
      // 3-byte sequence: 1110xxxx 10xxxxxx 10xxxxxx
      if (
        i + 2 >= buffer.length ||
        (buffer[i + 1] & 0xc0) !== 0x80 ||
        (buffer[i + 2] & 0xc0) !== 0x80
      ) {
        return false;
      }
      // Check for overlong encoding and surrogate pairs
      const codePoint = ((byte & 0x0f) << 12) | ((buffer[i + 1] & 0x3f) << 6) | (buffer[i + 2] & 0x3f);
      if (codePoint < 0x800 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return false;
      }
      i += 3;
    } else if ((byte & 0xf8) === 0xf0) {
      // 4-byte sequence: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (
        i + 3 >= buffer.length ||
        (buffer[i + 1] & 0xc0) !== 0x80 ||
        (buffer[i + 2] & 0xc0) !== 0x80 ||
        (buffer[i + 3] & 0xc0) !== 0x80
      ) {
        return false;
      }
      // Check for overlong encoding and values beyond Unicode range
      const codePoint =
        ((byte & 0x07) << 18) |
        ((buffer[i + 1] & 0x3f) << 12) |
        ((buffer[i + 2] & 0x3f) << 6) |
        (buffer[i + 3] & 0x3f);
      if (codePoint < 0x10000 || codePoint > 0x10ffff) {
        return false;
      }
      i += 4;
    } else {
      // Invalid UTF-8 byte
      return false;
    }
  }
  return true;
};

/**
 * Detect the encoding of a buffer and decode it to a UTF-8 string.
 *
 * This is the primary function to use when importing CSV/Excel files.
 * It handles:
 *   - UTF-8 (with or without BOM) — most common
 *   - UTF-16 LE (with BOM 0xFF 0xFE) — common on Windows
 *   - UTF-16 BE (with BOM 0xFE 0xFF) — less common
 *   - ISO-8859-1 / Latin-1 — common in European locales
 *
 * After decoding, any BOM character (U+FEFF) at the start of the string
 * is stripped to prevent it from appearing in the first field name.
 *
 * @param {Buffer} buffer - The raw file buffer to decode
 * @returns {string} UTF-8 decoded string with BOM stripped
 * @throws {Error} If the buffer cannot be decoded
 */
const detectAndDecodeBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }

  if (buffer.length === 0) {
    return '';
  }

  const encoding = detectEncoding(buffer);

  let decoded;

  switch (encoding) {
    case 'utf-16le':
      // iconv-lite handles UTF-16 LE with BOM stripping
      decoded = iconv.decode(buffer, 'utf-16le');
      break;

    case 'utf-16be':
      // iconv-lite handles UTF-16 BE
      decoded = iconv.decode(buffer, 'utf-16be');
      break;

    case 'iso-8859-1':
      // iconv-lite decodes ISO-8859-1 (Latin-1) correctly
      decoded = iconv.decode(buffer, 'iso-8859-1');
      break;

    case 'utf-8':
    default:
      // Use iconv-lite for consistent UTF-8 decoding
      decoded = iconv.decode(buffer, 'utf-8');
      break;
  }

  // Strip BOM character (U+FEFF) if present at the start
  // This can appear after decoding UTF-8 with BOM or UTF-16 files
  if (decoded.charCodeAt(0) === 0xfeff) {
    decoded = decoded.slice(1);
  }

  return decoded;
};

module.exports = {
  detectEncoding,
  detectAndDecodeBuffer,
  isValidUtf8,
  BOM,
};
