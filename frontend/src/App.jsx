import React, { useState, useMemo } from 'react';
import { Database, List, CheckCircle2, AlertCircle, Users, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import CSVUploadComponent from './components/CSVUploadComponent';
import PosterUploadComponent from './components/PosterUploadComponent';
import IndustryFilter from './components/IndustryFilter';
import ContactsTable from './components/ContactsTable';

const App = () => {
  const [contacts, setContacts] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState('All');
  const [selectedContactIds, setSelectedContactIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [campaignData, setCampaignData] = useState(null);

  // Notifications
  const showNotification = (type, message) => {
    if (type === 'success') {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Filtered Contacts memo
  const filteredContacts = useMemo(() => {
    if (selectedIndustry === 'All') return contacts;
    return contacts.filter(c => c.predictedIndustry === selectedIndustry);
  }, [contacts, selectedIndustry]);

  // Industry Counts memo
  const industries = useMemo(() => {
    const counts = {};
    contacts.forEach(c => {
      counts[c.predictedIndustry] = (counts[c.predictedIndustry] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({ name, count: counts[name] })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  // Handle Selection
  const toggleSelectContact = (id) => {
    const newSelected = new Set(selectedContactIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContactIds(newSelected);
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredContacts.map(c => c.id);
    const areAllVisibleSelected = visibleIds.every(id => selectedContactIds.has(id));

    const newSelected = new Set(selectedContactIds);
    if (areAllVisibleSelected) {
      visibleIds.forEach(id => newSelected.delete(id));
    } else {
      visibleIds.forEach(id => newSelected.add(id));
    }
    setSelectedContactIds(newSelected);
  };

  const isAllSelected = useMemo(() => {
    if (filteredContacts.length === 0) return false;
    return filteredContacts.every(c => selectedContactIds.has(c.id));
  }, [filteredContacts, selectedContactIds]);

  const handleUploadSuccess = (newResults) => {
    // Assign unique IDs to each new contact
    const resultsWithIds = newResults.map((contact, index) => ({
      ...contact,
      id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
    }));
    setContacts(prev => [...resultsWithIds, ...prev]);
    showNotification('success', `Successfully processed ${resultsWithIds.length} contacts`);
  };

  const handleCampaignSuccess = (data) => {
    setCampaignData(data);
    if (data.detectedIndustry) {
      setSelectedIndustry(data.detectedIndustry);
      showNotification('success', `Poster analyzed! Auto-selected industry: ${data.detectedIndustry}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans transition-colors">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center p-4 bg-indigo-600/10 rounded-3xl mb-4 border border-indigo-500/20 shadow-2xl"
        >
          <Database className="w-8 h-8 text-indigo-400 mr-3" />
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-blue-400 to-emerald-400">
            Industry Classification Hub
          </h1>
        </motion.div>
        <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
          Upload your contact lists and automatically categorize them into target industries using advanced machine learning.
        </p>
      </header>

      {/* Notifications */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, x: 50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className="bg-slate-900/80 border border-red-500/30 backdrop-blur-xl text-red-400 px-6 py-4 rounded-2xl flex items-center shadow-2xl ring-1 ring-red-500/20"
            >
              <AlertCircle className="w-5 h-5 mr-3 text-red-500" /> {error}
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, x: 50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className="bg-slate-900/80 border border-emerald-500/30 backdrop-blur-xl text-emerald-400 px-6 py-4 rounded-2xl flex items-center shadow-2xl ring-1 ring-emerald-500/20"
            >
              <CheckCircle2 className="w-5 h-5 mr-3 text-emerald-500" /> {success}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar: Controls */}
        <div className="lg:col-span-4 space-y-6">
          <CSVUploadComponent
            onUploadSuccess={handleUploadSuccess}
            onError={(msg) => showNotification('error', msg)}
          />

          <PosterUploadComponent 
            onAnalyzeSuccess={handleCampaignSuccess}
            onError={(msg) => showNotification('error', msg)}
          />

          {campaignData && (
            <div className="bg-slate-800/40 border border-indigo-500/30 p-6 rounded-3xl backdrop-blur-md shadow-2xl ring-1 ring-indigo-500/20">
              <h3 className="text-lg font-bold flex items-center text-indigo-300 mb-4">
                Campaign Insights
              </h3>
              
              <div className="space-y-4">
                {campaignData.previewImage && (
                  <div className="rounded-xl overflow-hidden border border-slate-700/50">
                    <img src={campaignData.previewImage} alt="Campaign Poster" className="w-full h-auto object-cover max-h-48" />
                  </div>
                )}
                
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/30">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Detected Industry</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-lg font-bold text-emerald-400">{campaignData.detectedIndustry}</span>
                    {campaignData.confidenceScore && (
                      <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20">
                        {Math.round(campaignData.confidenceScore * 100)}% Match
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/30">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1 block">Target Audience Size</span>
                  <div className="text-2xl font-black text-white">{filteredContacts.length} <span className="text-sm font-normal text-slate-500">matching contacts</span></div>
                </div>

                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/30 max-h-32 overflow-y-auto custom-scrollbar">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1 block">Extracted Keywords</span>
                  <p className="text-sm text-slate-300 italic">"{campaignData.extractedText}"</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-3xl backdrop-blur-md shadow-2xl ring-1 ring-white/5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center text-slate-200">
                <BarChart3 className="w-5 h-5 mr-3 text-indigo-400" /> Reach Summary
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-700/30">
                <span className="text-slate-400 font-medium">Total Analyzed</span>
                <span className="text-2xl font-black font-mono text-white">{contacts.length}</span>
              </div>
              <div className="flex justify-between items-center bg-indigo-500/5 p-4 rounded-2xl border border-indigo-500/20">
                <span className="text-indigo-300/80 font-medium">Selected for Export</span>
                <span className="text-2xl font-black font-mono text-indigo-400">{selectedContactIds.size}</span>
              </div>
            </div>

            {selectedContactIds.size > 0 && (
              <button
                onClick={() => setSelectedContactIds(new Set())}
                className="w-full mt-6 py-3 px-4 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-all"
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="hidden lg:block p-6 bg-gradient-to-br from-indigo-600/20 to-blue-600/20 rounded-3xl border border-indigo-500/20">
            <h4 className="font-bold text-indigo-300 mb-2">Pro Tip</h4>
            <p className="text-sm text-indigo-200/60 leading-relaxed">
              Filter by an industry like <strong>Healthcare</strong> and use <strong>Select All</strong> to quickly build targeted marketing lists.
            </p>
          </div>
        </div>

        {/* Main Content: Table & Filter */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-slate-800/40 p-6 rounded-3xl border border-slate-700/50 backdrop-blur-md shadow-lg ring-1 ring-white/5">
            <div className="flex items-center">
              <div className="p-3 bg-emerald-500/10 rounded-2xl mr-4 border border-emerald-500/20">
                <List className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Contact Database</h2>
                <p className="text-sm text-slate-500">Industry-specific segmentation</p>
              </div>
            </div>
            <IndustryFilter
              industries={industries}
              selectedIndustry={selectedIndustry}
              onSelectIndustry={setSelectedIndustry}
            />
          </div>

          <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl overflow-hidden flex flex-col h-[650px] shadow-2xl backdrop-blur-md ring-1 ring-white/5">
            <ContactsTable
              contacts={filteredContacts}
              selectedContacts={selectedContactIds}
              onToggleSelect={toggleSelectContact}
              onToggleSelectAll={toggleSelectAll}
              isAllSelected={isAllSelected}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
