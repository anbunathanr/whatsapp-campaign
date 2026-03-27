import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, CheckCircle, Loader2 } from 'lucide-react';

const PosterUploadComponent = ({ onAnalyzeSuccess, onError }) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleUpload = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onError('Please upload a valid image file (JPG, PNG).');
      return;
    }

    // Show preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/api/analyze-campaign', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to analyze campaign poster.');
      }

      onAnalyzeSuccess({ ...data, previewImage: objectUrl });
    } catch (err) {
      onError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsHovering(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsHovering(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsHovering(false);
    const file = e.dataTransfer.files[0];
    handleUpload(file);
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  const handleChange = (e) => {
    const file = e.target.files[0];
    handleUpload(file);
    e.target.value = null; // reset input
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-3xl backdrop-blur-md shadow-2xl ring-1 ring-white/5 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <ImageIcon className="w-32 h-32 text-indigo-500" />
      </div>

      <div className="relative z-10">
        <h2 className="text-xl font-bold mb-2 flex items-center text-white">
          <ImageIcon className="w-5 h-5 mr-3 text-indigo-400" />
          Campaign Analyzer
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Upload a poster, flyer, or banner to automatically detect the target industry and select the best audience.
        </p>

        <div
          onClick={isLoading ? undefined : handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={isLoading ? undefined : handleDrop}
          className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all ${
            isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ${
            isHovering
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-slate-600 hover:border-indigo-500/50 hover:bg-slate-800/50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleChange}
            accept="image/png, image/jpeg, image/jpg, image/webp"
            className="hidden"
          />

          {isLoading ? (
            <div className="flex flex-col items-center text-indigo-400">
              <Loader2 className="w-12 h-12 mb-4 animate-spin" />
              <p className="font-semibold text-lg">Analyzing Poster Content...</p>
              <p className="text-xs text-slate-400 mt-2">Extracting text and identifying industry</p>
            </div>
          ) : preview ? (
            <div className="flex flex-col items-center text-emerald-400">
              <CheckCircle className="w-12 h-12 mb-4" />
              <p className="font-semibold">Analysis Complete</p>
              <p className="text-xs text-slate-400 mt-1">Click to upload a different poster</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-slate-400">
              <UploadCloud className="w-12 h-12 mb-4 text-indigo-400 group-hover:scale-110 transition-transform" />
              <p className="font-semibold mb-1">
                <span className="text-indigo-400">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs">PNG, JPG, WEBP (Max 5MB)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosterUploadComponent;
