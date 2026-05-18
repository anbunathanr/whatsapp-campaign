import React, { useState } from 'react';
import axios from 'axios';
import { Upload, Loader2 } from 'lucide-react';

const CSVUploadComponent = ({ onUploadSuccess, onError }) => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && (selectedFile.type === "text/csv" || selectedFile.name.endsWith('.csv'))) {
            setFile(selectedFile);
        } else {
            onError('Please select a valid CSV file');
        }
    };

    const handleUpload = async () => {
        if (!file) {
            onError('No file selected');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post('http://3.87.169.54:8000/api/classify-csv', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onUploadSuccess(response.data.results);
            setFile(null);
        } catch (err) {
            onError(err.response?.data?.detail || 'Failed to process CSV');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl backdrop-blur-sm shadow-xl">
            <div className="flex items-center mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-lg mr-3">
                    <Upload className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-semibold">CSV Data Upload</h2>
            </div>

            <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-indigo-500/50 transition-colors">
                <input
                    type="file"
                    id="csv-upload"
                    className="hidden"
                    accept=".csv"
                    onChange={handleFileChange}
                />
                <label htmlFor="csv-upload" className="cursor-pointer group block">
                    <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3 group-hover:text-indigo-400 transition-colors" />
                    <p className="text-slate-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                        {file ? file.name : "Click to select CSV file"}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">Accepts flexible column formats</p>
                </label>
            </div>

            <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Processing Contacts...
                    </>
                ) : (
                    "Classify and Upload"
                )}
            </button>
        </section>
    );
};

export default CSVUploadComponent;
