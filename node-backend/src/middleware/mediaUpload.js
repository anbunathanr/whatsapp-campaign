const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// ── Ensure upload directory exists ───────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', '..', config.upload.dir, 'media');
fs.mkdirSync(uploadDir, { recursive: true });

// ── Disk storage configuration ───────────────────────────────────────────────
const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ── File filter: JPEG, PNG, PDF only ─────────────────────────────────────────
const mediaFileFilter = (_req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG images and PDF files are allowed'), false);
  }
};

// ── Multer instance ───────────────────────────────────────────────────────────
const uploadMedia = multer({
  storage: mediaStorage,
  fileFilter: mediaFileFilter,
  limits: {
    fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
  },
}).single('media');

// ── MIME type to allowed extensions mapping ───────────────────────────────────
const MIME_EXTENSION_MAP = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

// ── Magic byte signatures ─────────────────────────────────────────────────────
// Each entry maps a MIME type to its expected file signature (magic bytes).
const MAGIC_BYTES = {
  'image/jpeg': { bytes: [0xff, 0xd8, 0xff], length: 3 },
  'image/png': { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], length: 8 },
  'application/pdf': { bytes: [0x25, 0x50, 0x44, 0x46], length: 4 }, // %PDF
};

/**
 * Express middleware (second layer of defence) that validates the saved file's
 * magic bytes against its declared MIME type, and also cross-checks that the
 * file extension is consistent with the declared MIME type.
 *
 * Must be called AFTER multer has saved the file to disk (i.e. after uploadMedia
 * has run successfully and req.file is populated).
 *
 * On mismatch: deletes the uploaded file and returns 400.
 * On match (or no file): calls next().
 */
const validateMediaMagicBytes = (req, res, next) => {
  // Skip if multer didn't save a file (that error is handled elsewhere)
  if (!req.file) {
    return next();
  }

  const { path: filePath, mimetype, originalname } = req.file;
  const ext = path.extname(originalname).toLowerCase();

  // Cross-check: extension must be consistent with the declared MIME type
  const allowedExtsForMime = MIME_EXTENSION_MAP[mimetype];
  if (!allowedExtsForMime || !allowedExtsForMime.includes(ext)) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore cleanup errors */ }
    return next(new Error('File content does not match its declared type'));
  }

  const signature = MAGIC_BYTES[mimetype];

  if (!signature) {
    // MIME type not in our magic-bytes map — shouldn't reach here given the
    // file filter, but treat it as invalid to be safe.
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore cleanup errors */ }
    return next(new Error('File content does not match its declared type'));
  }

  let header;
  try {
    // Read only the bytes we need (up to 8 bytes max)
    const fd = fs.openSync(filePath, 'r');
    header = Buffer.alloc(signature.length);
    fs.readSync(fd, header, 0, signature.length, 0);
    fs.closeSync(fd);
  } catch (readErr) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore cleanup errors */ }
    return next(new Error('Could not read uploaded file'));
  }

  // Compare each expected byte
  const matches = signature.bytes.every((byte, i) => header[i] === byte);

  if (!matches) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore cleanup errors */ }
    return next(new Error('File content does not match its declared type'));
  }

  return next();
};

module.exports = { uploadMedia, validateMediaMagicBytes };
