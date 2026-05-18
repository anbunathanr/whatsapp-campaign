import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import contactService from '../../services/contactService';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isAcceptedFile = (file) => {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext) || ACCEPTED_TYPES.includes(file.type);
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Collapsible error list for rows that failed to import */
const ErrorList = ({ errors }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? errors : errors.slice(0, 5);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {expanded ? 'Hide' : 'Show'} {errors.length} error{errors.length !== 1 ? 's' : ''}
      </button>

      {expanded && (
        <ul
          className="mt-2 max-h-40 overflow-y-auto custom-scrollbar space-y-1"
          aria-label="Import errors"
        >
          {visible.map((err, i) => (
            <li
              key={i}
              className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5"
            >
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Result summary shown after a successful (or partial) import */
const ImportResult = ({ result, onClose, onImportAnother }) => {
  const { imported = 0, skipped = 0, normalized = 0, invalid = 0, errors = [] } = result;
  const hasErrors = errors.length > 0;
  const allFailed = imported === 0 && (skipped > 0 || hasErrors);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'rounded-xl border p-5 flex flex-col gap-3',
        allFailed
          ? 'bg-red-500/10 border-red-500/30'
          : hasErrors
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : 'bg-green-500/10 border-green-500/30',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {allFailed ? (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2
              className={`w-5 h-5 flex-shrink-0 ${hasErrors ? 'text-yellow-400' : 'text-green-400'}`}
              aria-hidden="true"
            />
          )}
          <span
            className={`font-semibold text-sm ${
              allFailed ? 'text-red-300' : hasErrors ? 'text-yellow-300' : 'text-green-300'
            }`}
          >
            {allFailed
              ? 'Import failed'
              : hasErrors
              ? 'Import completed with warnings'
              : 'Import successful'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss result"
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-800/60 rounded-lg px-2 py-2 text-center">
          <p className="text-lg font-bold text-green-400">{imported.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Imported</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg px-2 py-2 text-center">
          <p className="text-lg font-bold text-indigo-400">{normalized.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Normalized</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg px-2 py-2 text-center">
          <p className="text-lg font-bold text-yellow-400">{skipped.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Skipped</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg px-2 py-2 text-center">
          <p className="text-lg font-bold text-orange-400">{invalid.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Invalid</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg px-2 py-2 text-center">
          <p className="text-lg font-bold text-red-400">{errors.length.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Errors</p>
        </div>
      </div>

      {/* Skipped note */}
      {skipped > 0 && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" aria-hidden="true" />
          {skipped} duplicate phone number{skipped !== 1 ? 's were' : ' was'} skipped.
        </p>
      )}

      {/* Error list */}
      {hasErrors && <ErrorList errors={errors} />}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onImportAnother}
          className="flex-1 px-3 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors"
        >
          Import another file
        </button>
      </div>
    </div>
  );
};

// ─── Main ContactImport component ─────────────────────────────────────────────

/**
 * ContactImport – drag-and-drop / click-to-select file upload for CSV and Excel
 * contact imports.
 *
 * @param {Object}   props
 * @param {Function} [props.onSuccess] - Called with the import result after a
 *                                       successful upload so the parent can
 *                                       refresh the contact list.
 * @param {Function} [props.onCancel]  - Called when the user dismisses the panel.
 */
const ContactImport = ({ onSuccess, onCancel }) => {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState(null);

  const inputRef = useRef(null);

  // ── File validation ────────────────────────────────────────────────────────

  const validateAndSetFile = useCallback((candidate) => {
    setFileError('');
    setResult(null);

    if (!candidate) return;

    if (!isAcceptedFile(candidate)) {
      setFileError('Unsupported file type. Please upload a CSV, XLS, or XLSX file.');
      return;
    }

    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setFile(candidate);
  }, []);

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const dropped = e.dataTransfer.files?.[0];
      validateAndSetFile(dropped ?? null);
    },
    [validateAndSetFile]
  );

  // ── Input change ───────────────────────────────────────────────────────────

  const handleInputChange = useCallback(
    (e) => {
      validateAndSetFile(e.target.files?.[0] ?? null);
      // Reset input so the same file can be re-selected after clearing
      e.target.value = '';
    },
    [validateAndSetFile]
  );

  // ── Clear selected file ────────────────────────────────────────────────────

  const clearFile = useCallback(() => {
    setFile(null);
    setFileError('');
    setResult(null);
  }, []);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setFileError('');

    try {
      const importResult = await contactService.importContacts(file);
      setResult(importResult);
      setFile(null);
      onSuccess?.(importResult);
    } catch (err) {
      const message =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err.message ??
        'Import failed. Please check your file and try again.';
      setFileError(message);
    } finally {
      setUploading(false);
    }
  };

  // ── Reset after viewing result ─────────────────────────────────────────────

  const handleImportAnother = useCallback(() => {
    setResult(null);
    setFile(null);
    setFileError('');
  }, []);

  // ── Download sample CSV ────────────────────────────────────────────────────

  const downloadSample = () => {
    const header = 'name,phone,jobTitle,company,industry,tags,city,state,country';
    const row1 = 'Jane Doe,+12025551234,Marketing Manager,Acme Corp,Technology,"vip,prospect",New York,NY,United States';
    const row2 = 'John Smith,+447911123456,Sales Director,Beta Ltd,Finance,lead,London,,United Kingdom';
    const csv = [header, row1, row2].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5" aria-label="Import contacts">

      {/* ── Instructions ── */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-300">How it works</span>
        </div>
        <ul className="text-xs text-slate-400 space-y-1 pl-6 list-disc">
          <li>Upload a CSV, XLS, or XLSX file (max {MAX_FILE_SIZE_MB} MB).</li>
          <li>
            Columns are detected automatically — common names like{' '}
            <code className="text-indigo-300">Name</code>,{' '}
            <code className="text-indigo-300">Phone</code>,{' '}
            <code className="text-indigo-300">Company</code> are all recognised.
          </li>
          <li>Industry is classified automatically using the ML model.</li>
          <li>Duplicate phone numbers are skipped and reported.</li>
        </ul>
        <button
          type="button"
          onClick={downloadSample}
          className="self-start flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
          aria-label="Download sample CSV template"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download sample CSV
        </button>
      </div>

      {/* ── Result panel (shown after upload) ── */}
      {result && (
        <ImportResult
          result={result}
          onClose={() => setResult(null)}
          onImportAnother={handleImportAnother}
        />
      )}

      {/* ── Drop zone (hidden while showing result) ── */}
      {!result && (
        <>
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop zone: drag and drop a file here or click to browse"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !file) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={[
              'relative rounded-xl border-2 border-dashed transition-colors cursor-pointer',
              'flex flex-col items-center justify-center gap-3 py-10 px-6 text-center',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900',
              dragOver
                ? 'border-indigo-500 bg-indigo-500/10'
                : file
                ? 'border-slate-600 bg-slate-800/40 cursor-default'
                : 'border-slate-700 bg-slate-800/20 hover:border-indigo-500/60 hover:bg-indigo-500/5',
            ].join(' ')}
          >
            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={handleInputChange}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            />

            {file ? (
              /* ── File selected state ── */
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-indigo-400" aria-hidden="true" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-200 break-all">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  aria-label="Remove selected file"
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            ) : (
              /* ── Empty / drag-over state ── */
              <>
                <div
                  className={[
                    'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                    dragOver ? 'bg-indigo-600/30' : 'bg-slate-700/60',
                  ].join(' ')}
                >
                  <Upload
                    className={`w-6 h-6 transition-colors ${dragOver ? 'text-indigo-300' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    {dragOver ? 'Drop your file here' : 'Drag & drop your file here'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    or{' '}
                    <span className="text-indigo-400 hover:text-indigo-300 transition-colors">
                      click to browse
                    </span>
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  CSV, XLS, XLSX · max {MAX_FILE_SIZE_MB} MB
                </p>
              </>
            )}
          </div>

          {/* ── File validation error ── */}
          {fileError && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1">{fileError}</span>
              <button
                type="button"
                onClick={() => setFileError('')}
                aria-label="Dismiss error"
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-700">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={uploading}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-busy={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  Import Contacts
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ContactImport;
