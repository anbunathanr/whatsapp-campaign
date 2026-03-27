import React from 'react';
import { Filter } from 'lucide-react';

const IndustryFilter = ({ industries, selectedIndustry, onSelectIndustry }) => {
    return (
        <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700 p-4 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 text-slate-400">
                <Filter className="w-5 h-5" />
                <span className="font-medium">Filter by Industry:</span>
            </div>
            <select
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer text-slate-200"
                value={selectedIndustry}
                onChange={(e) => onSelectIndustry(e.target.value)}
            >
                <option value="All">All Industries (Total {industries.reduce((acc, curr) => acc + curr.count, 0)})</option>
                {industries.map((ind) => (
                    <option key={ind.name} value={ind.name}>
                        {ind.name} ({ind.count})
                    </option>
                ))}
            </select>
        </div>
    );
};

export default IndustryFilter;
