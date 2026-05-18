/**
 * MediaUploader – reusable, self-contained media attachment component.
 *
 * Props:
 *   campaignId      {string}   Optional. If provided, uploads to POST /campaigns/:id/media.
 *                              If omitted, uploads to POST /campaigns/media (standalone).
 *   onUploadSuccess {Function} Called with { url, filename, size, type } after a successful upload.
 *   onRemove        {Function} Called when the user removes the current attachment.
 *   existingMedia   {Object}   Pre-populated attachment: { url, filename, size, type }.
 *   disabled        {boolean}  Disables all interactions.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  Image,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import campaignService from '../../services/campaignService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.pdf';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format bytes to a human-readable string (e.g. "2.34 MB").
 * @param {number} bytes
 * @returns {string}
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

/**
 * Validate a File object against accepted types and max size.
 * @param {File} file
 * @returns {string|null} Error message, or null if valid.
 */
const validateFile = (file) => {
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, and PDF files are accepted.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File size must not exceed 5 MB (current: ${formatBytes(file.size)}).`;
  }
  return null;
};

/**
 * Derive a normalised media type string from a MIME type or existing type field.
 * @param {string} mimeOrType
 * @returns {'image'|'pdf'|'unknown'}
 */
const resolveMediaType = (mimeOrType) => {
  if (!mimeOrType) return 'unknown';
  if (mimeOrType === 'application/pdf' || mimeOrType === 'pdf') return 'pdf';
  if (mimeOrType.startsWith('image/') || mimeOrType === 'image') return 'image';
  return 'unknown';
};

// ─── Component ────────────────────────────────────────────────────────────────

const MediaUploader = ({
  campaignId,
  onUploadSuccess,
  onRemove,
  existingMedia,
  disabled = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  // ── Upload logic ───────────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file) => {
      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        setUploadSuccess(false);
        return;
      }

      setUploadError('');
      setUploadSuccess(false);
      setUploading(true);

      try {
        let result;
        if (campaignId) {
          // Attach directly to a campaign
          const campaign = await campaignService.attachMedia(campaignId, file);
          // Normalise to { url, filename, size, type }
          const attachment = campaign?.mediaAttachment ?? campaign;
          result = {
            url: attachment?.url ?? '',
            filename: attachment?.filename ?? file.name,
            size: attachment?.size ?? file.size,
            type: attachment?.type ?? resolveMediaType(file.type),
          };
        } else {
          // Standalone upload
          const data = await campaignService.uploadMedia(file);
          result = {
            url: data?.url ?? '',
            filename: data?.filename ?? file.name,
            size: data?.size ?? file.size,
            type: resolveMediaType(data?.mimetype ?? file.type),
          };
        }

        setUploadSuccess(true);
        onUploadSuccess?.(result);
      } catch (err) {
        const message =
          err?.response?.data?.message ?? err.message ?? 'Upload failed. Please try again.';
        setUploadError(message);
        setUploadSuccess(false);
      } finally {
        setUploading(false);
        // Reset the file input so the same file can be re-selected after removal
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [campaignId, onUploadSuccess]
  );

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !uploading) setIsDragOver(true);
    },
    [disabled, uploading]
  );

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled || uploading) return;

      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [disabled, uploading, uploadFile]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled && !uploading) {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [disabled, uploading]
  );

  const handleRemove = useCallback(() => {
    setUploadError('');
    setUploadSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onRemove?.();
  }, [onRemove]);

  // ── Derived display values ─────────────────────────────────────────────────

  const hasAttachment = Boolean(existingMedia?.url || existingMedia?.filename);
  const mediaType = hasAttachment ? resolveMediaType(existingMedia?.type) : 'unknown';
  const MediaIcon = mediaType === 'pdf' ? FileText : Image;
  const displayName = existingMedia?.filename ?? 'Attached file';
  const displaySize = existingMedia?.size ? formatBytes(existingMedia.size) : null;

  const isInteractive = !disabled && !uploading;

  // ── Render: attached file view ─────────────────────────────────────────────

  if (hasAttachment) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 bg-slate-700/40 border border-slate-600 rounded-lg"
        aria-label="Attached media file"
      >
        <MediaIcon className="w-5 h-5 text-slate-400 flex-shrink-0" aria-hidden="true" />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-300 truncate" title={displayName}>
            {displayName}
          </p>
          {displaySize && (
            <p className="text-xs text-slate-500 mt-0.5">{displaySize}</p>
          )}
        </div>

        {uploadSuccess && (
          <CheckCircle2
            className="w-4 h-4 text-green-400 flex-shrink-0"
            aria-label="Upload successful"
          />
        )}

        {!disabled && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // ── Render: upload area ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">
      {/* Drop zone / click-to-upload area */}
      <div
        role="button"
        tabIndex={isInteractive ? 0 : -1}
        aria-label="Upload media attachment — click or drag and drop a file here"
        aria-disabled={!isInteractive}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onClick={() => isInteractive && fileInputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center gap-2 px-4 py-6',
          'border-2 border-dashed rounded-lg transition-colors select-none',
          isInteractive ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
          isDragOver
            ? 'border-indigo-400 bg-indigo-500/10'
            : uploadError
            ? 'border-red-500/50 bg-red-500/5'
            : 'border-slate-600 hover:border-indigo-500/50 bg-slate-700/20 hover:bg-indigo-500/5',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800',
        ].join(' ')}
      >
        {uploading ? (
          <>
            <Loader2
              className="w-6 h-6 text-indigo-400 animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm text-slate-400">Uploading…</p>
          </>
        ) : (
          <>
            <Upload
              className={[
                'w-6 h-6',
                isDragOver ? 'text-indigo-400' : 'text-slate-500',
              ].join(' ')}
              aria-hidden="true"
            />
            <div className="text-center">
              <p className="text-sm text-slate-400">
                <span className="text-indigo-400 font-medium">Click to upload</span>
                {' '}or drag and drop
              </p>
              <p className="text-xs text-slate-500 mt-1">
                JPEG, PNG or PDF — max 5 MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileInputChange}
        disabled={!isInteractive}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Error message */}
      {uploadError && (
        <p
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-1.5 text-xs text-red-400"
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {uploadError}
        </p>
      )}
    </div>
  );
};

export default MediaUploader;
