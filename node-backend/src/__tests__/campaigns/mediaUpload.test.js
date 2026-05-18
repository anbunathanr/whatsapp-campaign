'use strict';

/**
 * Tests for POST /api/campaigns/media — media file upload (Task 4.9)
 *
 * Validates: Requirements 4.9 (file type validation — JPEG, PNG, PDF)
 *
 * Tests:
 *   - Accepts valid JPEG file (correct MIME + extension + magic bytes)
 *   - Accepts valid PNG file
 *   - Accepts valid PDF file
 *   - Rejects file with disallowed MIME type (text/plain)
 *   - Rejects file with disallowed extension (.gif)
 *   - Rejects file with mismatched MIME/extension (.jpg extension but PDF MIME)
 *   - Rejects file exceeding 5 MB size limit
 *   - Rejects request with no file
 *   - Rejects spoofed file (correct MIME + extension but wrong magic bytes)
 *   - Returns correct response shape on success: { url, filename, mimetype, size }
 *
 * Uses supertest for HTTP testing. Auth middleware is mocked so no real JWT is needed.
 */

process.env.NODE_ENV = 'test';

// ── Mock auth middleware before app is loaded ─────────────────────────────────
jest.mock('../../middleware/auth', () => ({
  authenticate: (_req, _res, next) => {
    _req.user = { _id: 'test-user-id', role: 'Admin' };
    next();
  },
  authorize: (..._roles) => (_req, _res, next) => next(),
}));

const request = require('supertest');
const app = require('../../app');

// ── Minimal valid magic-byte buffers ─────────────────────────────────────────
// These are the smallest byte sequences that satisfy each format's signature.

/** JPEG: starts with FF D8 FF */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** PNG: exact 8-byte PNG signature */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PDF: starts with %PDF-1.4 */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

/** Spoofed: 8 null bytes — no valid magic signature */
const SPOOFED_MAGIC = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/media with a buffer as the attached file.
 *
 * @param {Buffer} buffer       - File content
 * @param {string} filename     - Original filename (determines extension)
 * @param {string} contentType  - MIME type declared to multer
 */
const uploadBuffer = (buffer, filename, contentType) =>
  request(app)
    .post('/api/campaigns/media')
    .attach('media', buffer, { filename, contentType });

// ── Valid file uploads ────────────────────────────────────────────────────────

describe('POST /api/campaigns/media — valid files', () => {
  it('accepts a valid JPEG file', async () => {
    const res = await uploadBuffer(JPEG_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts a valid JPEG file with .jpeg extension', async () => {
    const res = await uploadBuffer(JPEG_MAGIC, 'photo.jpeg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts a valid PNG file', async () => {
    const res = await uploadBuffer(PNG_MAGIC, 'image.png', 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts a valid PDF file', async () => {
    const res = await uploadBuffer(PDF_MAGIC, 'document.pdf', 'application/pdf');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── Response shape ────────────────────────────────────────────────────────────

describe('POST /api/campaigns/media — response shape on success', () => {
  it('returns url, filename, mimetype, and size on success', async () => {
    const res = await uploadBuffer(JPEG_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('url');
    expect(res.body.data).toHaveProperty('filename');
    expect(res.body.data).toHaveProperty('mimetype');
    expect(res.body.data).toHaveProperty('size');
  });

  it('url points to /uploads/media/ path', async () => {
    const res = await uploadBuffer(PNG_MAGIC, 'image.png', 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^\/uploads\/media\//);
  });

  it('returns the original filename', async () => {
    const res = await uploadBuffer(PDF_MAGIC, 'my-document.pdf', 'application/pdf');
    expect(res.status).toBe(200);
    expect(res.body.data.filename).toBe('my-document.pdf');
  });

  it('returns the correct mimetype', async () => {
    const res = await uploadBuffer(JPEG_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.data.mimetype).toBe('image/jpeg');
  });

  it('returns a numeric size', async () => {
    const res = await uploadBuffer(PNG_MAGIC, 'image.png', 'image/png');
    expect(res.status).toBe(200);
    expect(typeof res.body.data.size).toBe('number');
    expect(res.body.data.size).toBeGreaterThan(0);
  });
});

// ── Rejected file types ───────────────────────────────────────────────────────

describe('POST /api/campaigns/media — rejected file types', () => {
  it('rejects a text/plain file with .txt extension', async () => {
    const buf = Buffer.from('hello world');
    const res = await uploadBuffer(buf, 'file.txt', 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a GIF file (.gif extension, image/gif MIME)', async () => {
    // GIF magic: GIF89a
    const gifBuf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
    const res = await uploadBuffer(gifBuf, 'animation.gif', 'image/gif');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a file with .jpg extension but application/pdf MIME type', async () => {
    // Multer's file filter checks both MIME and extension — mismatched pair is rejected
    // by the magic bytes middleware's MIME-extension cross-check
    const res = await uploadBuffer(PDF_MAGIC, 'file.jpg', 'application/pdf');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a file with .pdf extension but image/jpeg MIME type', async () => {
    // .pdf extension is not valid for image/jpeg MIME — cross-check rejects it
    const res = await uploadBuffer(JPEG_MAGIC, 'file.pdf', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── No file uploaded ──────────────────────────────────────────────────────────

describe('POST /api/campaigns/media — no file', () => {
  it('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/api/campaigns/media');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('error message mentions the "media" field', async () => {
    const res = await request(app).post('/api/campaigns/media');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/media/i);
  });
});

// ── File size limit ───────────────────────────────────────────────────────────

describe('POST /api/campaigns/media — file size limit', () => {
  it('rejects a file exceeding 5 MB', async () => {
    // Create a buffer slightly over 5 MB
    const oversizedBuf = Buffer.alloc(6 * 1024 * 1024, 0xff);
    // Prepend valid JPEG magic bytes so it passes the file filter
    JPEG_MAGIC.copy(oversizedBuf, 0);

    const res = await uploadBuffer(oversizedBuf, 'large.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/too large|size/i);
  });
});

// ── Magic bytes validation (spoofed files) ────────────────────────────────────

describe('POST /api/campaigns/media — magic bytes validation', () => {
  it('rejects a .jpg file with image/jpeg MIME but wrong magic bytes (spoofed)', async () => {
    // MIME type and extension are valid, but the file content is all null bytes
    const res = await uploadBuffer(SPOOFED_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/does not match/i);
  });

  it('rejects a .png file with image/png MIME but wrong magic bytes', async () => {
    const res = await uploadBuffer(SPOOFED_MAGIC, 'image.png', 'image/png');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/does not match/i);
  });

  it('rejects a .pdf file with application/pdf MIME but wrong magic bytes', async () => {
    const res = await uploadBuffer(SPOOFED_MAGIC, 'document.pdf', 'application/pdf');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/does not match/i);
  });

  it('rejects a .jpg file that contains PDF magic bytes (content/MIME mismatch)', async () => {
    // File has PDF magic bytes but is declared as image/jpeg with .jpg extension
    // Multer filter passes (MIME=image/jpeg, ext=.jpg), but magic bytes check fails
    const res = await uploadBuffer(PDF_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/does not match/i);
  });

  it('accepts a valid JPEG after magic bytes check passes', async () => {
    // Sanity check: valid JPEG magic bytes should pass both layers
    const res = await uploadBuffer(JPEG_MAGIC, 'photo.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
