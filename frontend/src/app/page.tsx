'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Home() {
  const [dataset, setDataset] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [showValidation, setShowValidation] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  // Check backend on client only
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkBackend = async () => {
      try {
        await axios.get('http://localhost:8000/health');
        setBackendStatus('ready');
      } catch {
        setBackendStatus('error');
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleValidate = async () => {
    if (!file || !dataset) return alert('Please select dataset and file');
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`http://localhost:8000/validate/${dataset}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setShowValidation(true);
      setShowPreview(true);
    } catch (err: any) {
      console.error('Full error:', err);
      if (err.response?.status === 500) {
        alert(`Server error: ${err.response.data.detail || 'Validation crashed. Check backend logs.'}`);
      } else if (err.code === 'ERR_NETWORK') {
        alert('Network error — backend may be down. Check if uvicorn is running on port 8000.');
      } else {
        alert(`Validation failed: ${err.response?.data?.detail || err.message}`);
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!result?.valid) return alert('Fix validation errors first');
    try {
      await axios.post(`http://localhost:8000/save/${dataset}`, result.previews);
      alert('Data saved to SQLite database!');
      setResult(null);
      setFile(null);
      setDataset('');
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    }
  };

const handleClear = () => {
  setResult(null);
  setFile(null);
  setDataset('');
  setShowValidation(true);
  setShowPreview(true);

  // reset file-input label
  const label = document.querySelector('label[for="excel-file"]') as HTMLLabelElement;
  if (label) label.textContent = 'Select file for upload';

  // reset native input value
  const input = document.getElementById('excel-file') as HTMLInputElement;
  if (input) input.value = '';
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header with Centered Logo */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <img
              src="/logo_large.png"
              alt="DataDock Logo"
              className="w-full max-w-md h-auto rounded-2xl shadow-2xl"
              key="logo-v2"
            />
          </div>
          <p className="text-xl text-gray-600">Upload • Validate • Save</p>
        </div>

        {/* Backend Status */}
        {backendStatus === 'checking' && (
          <div className="text-center p-4 bg-yellow-100 border border-yellow-300 rounded-lg mb-8">
            Checking Python backend...
          </div>
        )}
        {backendStatus === 'ready' && (
          <div className="text-center p-4 bg-green-100 border border-green-300 rounded-lg mb-8">
            Backend ready! You can upload files.
          </div>
        )}
        {backendStatus === 'error' && (
          <div className="text-center p-4 bg-red-100 border border-red-300 rounded-lg mb-8">
            Backend not running. <br/>
            <strong>Run in Terminal:</strong><br/>
            <code className="bg-gray-800 text-white px-2 py-1 rounded mt-2 inline-block">
              cd backend && uvicorn main:app --reload
            </code>
          </div>
        )}

        {/* Upload Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid md:grid-cols-3 gap-6 items-end">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Dataset</label>
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-500 font-medium"
              >
                <option value="">Select dataset...</option>
                <option value="Valuations">Valuations</option>
                <option value="Risk">Risk</option>
                <option value="P&L">P&L</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Excel File
              </label>

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const selected = e.target.files?.[0] || null;
                  setFile(selected);
                  const label = e.target.nextElementSibling as HTMLLabelElement;
                  if (label) {
                    label.textContent = selected ? `${selected.name} selected` : 'Select file for upload';
                  }
                }}
                id="excel-file"
                className="hidden"
              />

              <label
                htmlFor="excel-file"
                className="flex items-center justify-center w-full h-12 p-3 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 transition-colors text-center cursor-pointer font-medium text-gray-700 bg-white"
              >
                Select file for upload
              </label>
            </div>

            <button
              onClick={handleValidate}
              disabled={loading || !file || !dataset || backendStatus !== 'ready'}
              className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-blue-700 h-12 text-white font-bold px-8 rounded-xl text-lg shadow-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 transition-all duration-200"
            >
              {loading ? 'Validating...' : 'Validate & Preview'}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-8">
            {/* Validation Summary */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <button
                onClick={() => setShowValidation(!showValidation)}
                className="w-full text-left flex items-center justify-between group"
              >
                <h2 className="text-3xl font-black text-gray-700 flex items-center tracking-tight">
                  Validation Summary
                  <span className={`ml-3 px-4 py-1 rounded-full text-sm font-bold ${
                    result.valid ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'
                  }`}>
                    {result.valid ? 'PASSED' : 'FAILED'}
                  </span>
                </h2>
                <span className="text-2xl text-gray-600 group-hover:text-gray-800 transition-transform duration-200"
                      style={{ transform: showValidation ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
                </span>
              </button>

              {showValidation && (
                <div className="mt-6">
                  {Object.entries(result.check_results).map(([tableName, checks]: [string, any]) => (
                    <div key={tableName} className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h3 className="font-bold text-gray-700 text-lg mb-3">
                        {tableName.replace('pnl_', '').toUpperCase()}
                      </h3>
                      {Object.entries(checks).map(([checkName, check]: [string, any]) => {
                        const passed = check.passed === true;
                        const msg = check.msg || 'No message';
                        return (
                          <div key={checkName} className={`p-2 rounded-lg mb-2 ${
                            passed ? 'bg-green-50 border-l-4 border-green-400' : 'bg-red-50 border-l-4 border-red-400'
                          }`}>
                            <span className="font-bold text-gray-700">{checkName}:</span>
                            <span className={`ml-2 font-medium ${passed ? 'text-green-900' : 'text-red-900'}`}>
                              {passed ? 'PASSED' : 'FAILED'} {msg}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Data Preview */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="w-full text-left flex items-center justify-between group"
              >
                <h2 className="text-3xl font-black text-gray-700 mb-0">Data Preview</h2>
                <span className="text-2xl text-gray-600 group-hover:text-gray-800 transition-transform duration-200"
                      style={{ transform: showPreview ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
                </span>
              </button>

              {showPreview && (
                <div className="mt-6">
                  {Object.entries(result.previews).map(([tableName, rows]: [string, any[]]) => (
                    <div key={tableName} className="mb-12">
                      <h3 className="text-xl font-extrabold text-gray-700 mb-4 bg-blue-100 px-4 py-2 rounded-xl inline-block shadow-sm">
                        {tableName.replace('pnl_', '').toUpperCase()}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse bg-white rounded-xl shadow-inner">
                          <thead>
                            <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                              {rows[0] && Object.keys(rows[0]).map((col) => (
                                <th key={col} className="px-4 py-3 text-left font-bold text-gray-100">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 20).map((row: any, rowIndex: number) => (
                              <tr key={rowIndex} className="hover:bg-gray-50 border-b">
                                {Object.entries(row).map(([col, value]: [string, any]) => {
                                  const errors = result.error_locations[tableName] || [];
                                  const hasError = errors.some(([r, c]: [number, string]) =>
                                    r === rowIndex && c === col
                                  );
                                  return (
                                    <td
                                      key={col}
                                      className={`px-4 py-3 font-medium text-gray-700 ${
                                        hasError ? 'bg-red-200 text-red-900 font-bold animate-pulse' : ''
                                      }`}
                                    >
                                      {value ?? 'NULL'}
                                      {hasError && <span className="ml-1">Warning</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {rows.length > 20 && (
                        <p className="mt-2 text-sm text-gray-500">Showing first 20 rows of {rows.length}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save & Clear Buttons */}
            <div className="flex justify-center gap-4">
              {result.valid && (
                <button
                  onClick={handleSave}
                  className="bg-gradient-to-r from-green-500 to-green-600 text-white font-black py-4 px-10 text-xl rounded-2xl shadow-2xl hover:from-green-600 hover:to-green-700 transform hover:scale-105 transition-all duration-300"
                >
                  SAVE TO DATABASE
                </button>
              )}
              <button
                onClick={handleClear}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-4 px-10 text-xl rounded-2xl shadow-2xl transition-all duration-300"
              >
                CLEAR & START OVER
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}