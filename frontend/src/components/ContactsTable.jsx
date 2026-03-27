import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, AlertTriangle, ShieldCheck, ChevronDown } from 'lucide-react';

// Dropdown that shows top-3 alternative industry predictions for low-confidence rows
const AlternativesDropdown = ({ alternatives, currentIndustry, onSelect }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
            >
                <AlertTriangle className="w-2.5 h-2.5" />
                View Alternatives
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute bottom-full mb-1.5 left-0 z-50 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
                    >
                        <div className="px-3 py-2 border-b border-slate-700">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Top Predictions — Click to Override</p>
                        </div>
                        {alternatives.map((alt, idx) => {
                            const isCurrent = alt.industry === currentIndustry;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => { onSelect(alt.industry); setOpen(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800 transition-colors ${isCurrent ? 'bg-indigo-500/10' : ''}`}
                                >
                                    <span className={`text-[11px] font-medium truncate mr-2 ${isCurrent ? 'text-indigo-400' : 'text-slate-300'}`}>
                                        {idx === 0 && '🥇 '}{idx === 1 && '🥈 '}{idx === 2 && '🥉 '}
                                        {alt.industry}
                                    </span>
                                    <span className={`text-[10px] font-bold shrink-0 ${alt.confidence >= 0.7 ? 'text-emerald-400' :
                                            alt.confidence >= 0.4 ? 'text-amber-400' : 'text-red-400'
                                        }`}>
                                        {Math.round(alt.confidence * 100)}%
                                    </span>
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const ContactsTable = ({
    contacts,
    selectedContacts,
    onToggleSelect,
    onToggleSelectAll,
    isAllSelected
}) => {
    // Track manual overrides per contact: { [contactId]: 'NewIndustry' }
    const [overrides, setOverrides] = useState({});

    const handleOverride = (contactId, newIndustry) => {
        setOverrides(prev => ({ ...prev, [contactId]: newIndustry }));
    };

    return (
        <div className="flex-1 overflow-auto">
            {contacts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                    <Database className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium opacity-50">No contacts to display</p>
                    <p className="text-sm opacity-40">Upload a CSV to get started</p>
                </div>
            ) : (
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-800 shadow-sm z-10">
                        <tr className="text-slate-400 text-sm border-b border-slate-700">
                            <th className="px-6 py-4 w-12">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 accent-blue-500 cursor-pointer"
                                    checked={isAllSelected}
                                    onChange={onToggleSelectAll}
                                />
                            </th>
                            <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Name</th>
                            <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Job Title &amp; Company</th>
                            <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Industry</th>
                            <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Confidence</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        <AnimatePresence mode="popLayout">
                            {contacts.map((contact) => {
                                const isSelected = selectedContacts.has(contact.id);
                                const isLowConfidence = contact.isLowConfidence;
                                const displayedIndustry = overrides[contact.id] || contact.predictedIndustry;
                                const isOverridden = !!overrides[contact.id];

                                return (
                                    <motion.tr
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        key={contact.id}
                                        className={`hover:bg-slate-700/30 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-500/10' : ''}`}
                                        onClick={() => onToggleSelect(contact.id)}
                                    >
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500 accent-indigo-500 cursor-pointer"
                                                checked={isSelected}
                                                onChange={() => onToggleSelect(contact.id)}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-semibold text-slate-100">{contact.name}</p>
                                            <p className="font-mono text-indigo-400 text-[10px] mt-1">{contact.phone}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-slate-300 font-medium">{contact.jobTitle}</p>
                                            <p className="text-[11px] text-slate-500 italic mt-0.5">{contact.companyName || 'Unknown Company'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-tighter ${isOverridden
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : isLowConfidence
                                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                        : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                                }`}>
                                                {isOverridden && <span title="Manually overridden">✎</span>}
                                                {displayedIndustry}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    {isLowConfidence && !isOverridden ? (
                                                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                    ) : (
                                                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                                    )}
                                                    <span className={`text-xs font-bold ${isLowConfidence && !isOverridden ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                        {Math.round(contact.confidenceScore * 100)}%
                                                    </span>
                                                </div>
                                                {isLowConfidence && contact.alternativePredictions?.length > 0 && (
                                                    <AlternativesDropdown
                                                        alternatives={contact.alternativePredictions}
                                                        currentIndustry={displayedIndustry}
                                                        onSelect={(ind) => handleOverride(contact.id, ind)}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </AnimatePresence>
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ContactsTable;
