import { useState, useCallback } from 'react';
import { Plus, Upload, Download, Users } from 'lucide-react';
import ContactList from '../components/contacts/ContactList';
import ContactFilter from '../components/contacts/ContactFilter';
import ContactForm from '../components/contacts/ContactForm';
import ContactImport from '../components/contacts/ContactImport';
import SegmentBuilder from '../components/contacts/SegmentBuilder';
import contactService from '../services/contactService';

const EMPTY_FILTERS = {
  search: '',
  industry: '',
  tags: [],
  location: '',
};

// ─── Slide-over panel ─────────────────────────────────────────────────────────

const SlideOver = ({ open, title, onClose, children }) => {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{children}</div>
      </div>
    </>
  );
};

// ─── Contacts page ────────────────────────────────────────────────────────────

const Contacts = () => {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [panelMode, setPanelMode] = useState(null); // null | 'create' | 'edit' | 'import'
  const [editingContact, setEditingContact] = useState(null);
  const [listKey, setListKey] = useState(0); // bump to force ContactList refresh

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFiltersChange = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);

  const openCreate = () => {
    setEditingContact(null);
    setPanelMode('create');
  };

  const openCreateSegment = () => {
    setEditingContact(null);
    setPanelMode('createSegment');
  };

  const openEdit = (contact) => {
    setEditingContact(contact);
    setPanelMode('edit');
  };

  const openImport = () => {
    setEditingContact(null);
    setPanelMode('import');
  };

  const closePanel = () => {
    setPanelMode(null);
    setEditingContact(null);
  };

  const handleFormSuccess = () => {
    closePanel();
    setListKey((k) => k + 1); // refresh list
  };

  const handleImportSuccess = () => {
    setListKey((k) => k + 1); // refresh list after import
  };

  const handleExport = async () => {
    try {
      const blob = await contactService.exportContacts(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail – a notification system would handle this in production
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Contacts</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage and segment your contact database</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:border-slate-600 text-sm transition-colors"
            aria-label="Export contacts to CSV"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export
          </button>
          <button
            type="button"
            onClick={openImport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:border-slate-600 text-sm transition-colors"
            aria-label="Import contacts from file"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Import
          </button>
          <button
            type="button"
            onClick={openCreateSegment}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 text-sm font-medium transition-colors"
            aria-label="Create new segment"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create Segment
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            aria-label="Add new contact"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Contact
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
        <ContactFilter filters={filters} onFiltersChange={handleFiltersChange} />
      </div>

      {/* ── Contact list ── */}
      <div className="flex-1 min-h-0">
        <ContactList
          key={listKey}
          filters={filters}
          onContactSelect={openEdit}
          onBulkAction={() => setListKey((k) => k + 1)}
        />
      </div>

      {/* ── Create / Edit / Import slide-over ── */}
      <SlideOver
        open={panelMode !== null}
        title={
          panelMode === 'edit'
            ? 'Edit Contact'
            : panelMode === 'import'
            ? 'Import Contacts'
            : panelMode === 'createSegment'
            ? 'Create Segment'
            : 'New Contact'
        }
        onClose={closePanel}
      >
        {panelMode === 'import' ? (
          <ContactImport onSuccess={handleImportSuccess} onCancel={closePanel} />
        ) : panelMode === 'createSegment' ? (
          <SegmentBuilder onSuccess={handleFormSuccess} onCancel={closePanel} />
        ) : (
          <ContactForm
            contact={editingContact}
            onSuccess={handleFormSuccess}
            onCancel={closePanel}
          />
        )}
      </SlideOver>
    </div>
  );
};

export default Contacts;
