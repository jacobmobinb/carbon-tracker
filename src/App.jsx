import React, { useState, useEffect } from 'react';
import { Upload, FileText, Zap, Droplet, Fuel, TrendingUp, Download, Database, RefreshCw, Bell, BarChart3, Leaf, Lock, LogOut, ChevronRight } from 'lucide-react';

const CarbonFootprintTracker = () => {
  const [files, setFiles] = useState([]);
  const [extractedData, setExtractedData] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderEmails, setReminderEmails] = useState('');
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [processedFiles, setProcessedFiles] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  const ADMIN_PASSWORD = 'SunEng2025';

  const FUEL_PRICES = { petrol: 1.85, diesel: 1.90, lpg: 0.85 };
  const EMISSION_FACTORS = { electricity: 0.78, diesel: 2.68, petrol: 2.31, water: 0.34, naturalGas: 2.0, lpg: 1.51 };

  useEffect(() => {
    if (typeof window.storage === 'undefined') {
      window.tempStorage = {};
      window.storage = {
        get: async (key) => window.tempStorage[key] ? { key, value: window.tempStorage[key] } : null,
        set: async (key, value) => { window.tempStorage[key] = value; return { key, value }; },
        delete: async (key) => { delete window.tempStorage[key]; return { key, deleted: true }; },
        list: async (prefix) => ({ keys: Object.keys(window.tempStorage).filter(k => k.startsWith(prefix || '')) })
      };
    }
    
    loadAllData();
    if (sessionStorage.getItem('carbonTrackerAdmin') === 'true') setIsAdmin(true);
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const keys = await window.storage.list('invoice:', true);
      if (keys?.keys) {
        const allData = [];
        for (const key of keys.keys) {
          try {
            const result = await window.storage.get(key, true);
            if (result?.value) allData.push(JSON.parse(result.value));
          } catch (err) {}
        }
        setExtractedData(allData.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)));
        updateSummary(allData);
      }
    } catch (error) {} finally { setLoading(false); }
  };

  const handleLogin = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      sessionStorage.setItem('carbonTrackerAdmin', 'true');
      setShowLoginModal(false);
      setPasswordInput('');
    } else {
      alert('❌ Incorrect password');
      setPasswordInput('');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('carbonTrackerAdmin');
  };

  const checkForDuplicate = async (newInvoice) => {
    for (const existing of extractedData) {
      if (newInvoice.invoiceNumber && existing.invoiceNumber && 
          newInvoice.invoiceNumber === existing.invoiceNumber && 
          newInvoice.supplier === existing.supplier) return true;
      if (newInvoice.fileName === existing.fileName) return true;
    }
    return false;
  };

  const handleFileUpload = (event) => {
    setFiles(prev => [...prev, ...Array.from(event.target.files)]);
  };

  const extractDataFromPDF = async (file, isBatchMode = false) => {
    if (!isBatchMode) setProcessing(true);
    
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: [{
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64Data }
            }, {
              type: "text",
              text: `Extract utility and fuel usage data. Return ONLY JSON:
{
  "documentType": "electricity|water|fuel|lpg|creditcard|gas",
  "supplier": "company name",
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "number",
  "electricity_kwh": number or null,
  "water_kl": number or null,
  "gas_m3": number or null,
  "diesel_litres": number or null,
  "petrol_litres": number or null,
  "lpg_litres": number or null,
  "fuelType": "petrol|diesel|lpg" or null,
  "fuelCost": number or null,
  "totalCost": number or null,
  "carbonEmissions_tonnes": number or null
}`
            }]
          }]
        })
      });

      const data = await response.json();
      const textContent = data.content.find(item => item.type === 'text')?.text || '';
      const cleanJson = textContent.replace(/```json|```/g, '').trim();
      const extracted = JSON.parse(cleanJson);
      
      if (extracted.fuelCost && !extracted.petrol_litres && !extracted.diesel_litres) {
        const fuelType = extracted.fuelType || 'petrol';
        const litres = extracted.fuelCost / (FUEL_PRICES[fuelType] || FUEL_PRICES.petrol);
        if (fuelType === 'petrol') extracted.petrol_litres = litres;
        else if (fuelType === 'diesel') extracted.diesel_litres = litres;
        else if (fuelType === 'lpg') extracted.lpg_litres = litres;
        extracted.calculatedFromCost = true;
      }
      
      let totalEmissions = extracted.carbonEmissions_tonnes || 0;
      if (!totalEmissions) {
        if (extracted.electricity_kwh) totalEmissions += (extracted.electricity_kwh * EMISSION_FACTORS.electricity) / 1000;
        if (extracted.water_kl) totalEmissions += (extracted.water_kl * EMISSION_FACTORS.water) / 1000;
        if (extracted.diesel_litres) totalEmissions += (extracted.diesel_litres * EMISSION_FACTORS.diesel) / 1000;
        if (extracted.petrol_litres) totalEmissions += (extracted.petrol_litres * EMISSION_FACTORS.petrol) / 1000;
        if (extracted.lpg_litres) totalEmissions += (extracted.lpg_litres * EMISSION_FACTORS.lpg) / 1000;
      }
      
      const result = {
        ...extracted,
        calculatedEmissions_tonnes: totalEmissions,
        fileName: file.name,
        uploadDate: new Date().toISOString(),
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
      };

      if (await checkForDuplicate(result)) {
        if (!isBatchMode) {
          alert(`⚠️ Duplicate: ${file.name}`);
          setFiles(prev => prev.filter(f => f.name !== file.name));
          setProcessing(false);
        }
        return { error: true, isDuplicate: true, fileName: file.name };
      }

      await window.storage.set(`invoice:${result.id}`, JSON.stringify(result), true);
      
      if (!isBatchMode) {
        await loadAllData();
        setFiles(prev => prev.filter(f => f.name !== file.name));
        alert(`✅ Successfully processed ${file.name}`);
      }
      
      return { success: true, data: result };
    } catch (error) {
      if (!isBatchMode) alert(`❌ Error: ${error.message}`);
      return { error: true, message: error.message };
    } finally {
      if (!isBatchMode) setProcessing(false);
    }
  };

  const processAllFiles = async () => {
    if (!files.length || !isAdmin) return;
    if (!window.confirm(`Process ${files.length} files?`)) return;
    
    setProcessing(true);
    setProcessingProgress({ current: 0, total: files.length });
    setProcessedFiles([]);
    
    let success = 0, errors = 0, duplicates = 0;
    
    for (let i = 0; i < files.length; i++) {
      setProcessingProgress({ current: i + 1, total: files.length });
      const result = await extractDataFromPDF(files[i], true);
      
      if (result?.success) {
        success++;
        setProcessedFiles(p => [...p, { fileName: files[i].name, status: 'success' }]);
      } else if (result?.isDuplicate) {
        duplicates++;
        setProcessedFiles(p => [...p, { fileName: files[i].name, status: 'duplicate' }]);
      } else {
        errors++;
        setProcessedFiles(p => [...p, { fileName: files[i].name, status: 'error' }]);
      }
      
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    
    await loadAllData();
    setProcessing(false);
    setProcessingProgress({ current: 0, total: 0 });
    setFiles([]);
    alert(`✅ Complete!\nSuccess: ${success} | Duplicates: ${duplicates} | Errors: ${errors}`);
    setProcessedFiles([]);
  };

  const updateSummary = (data) => {
    const s = {
      totalElectricity: 0, totalWater: 0, totalDiesel: 0, totalPetrol: 0,
      totalLPG: 0, totalEmissions: 0, totalCost: 0, invoiceCount: data.length
    };
    data.forEach(item => {
      s.totalElectricity += item.electricity_kwh || 0;
      s.totalWater += item.water_kl || 0;
      s.totalDiesel += item.diesel_litres || 0;
      s.totalPetrol += item.petrol_litres || 0;
      s.totalLPG += item.lpg_litres || 0;
      s.totalEmissions += item.calculatedEmissions_tonnes || 0;
      s.totalCost += item.totalCost || 0;
    });
    setSummary(s);
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Supplier', 'Invoice #', 'Electricity (kWh)', 'Water (kL)', 
                    'Petrol (L)', 'Diesel (L)', 'Cost ($)', 'CO₂ (t)'];
    const rows = extractedData.map(i => [
      new Date(i.uploadDate).toLocaleDateString(),
      i.documentType || '', i.supplier || '', i.invoiceNumber || '',
      i.electricity_kwh || '', i.water_kl || '', i.petrol_litres || '', i.diesel_litres || '',
      i.totalCost || '', i.calculatedEmissions_tonnes?.toFixed(2) || ''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carbon-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const deleteInvoice = async (id) => {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      await window.storage.delete(`invoice:${id}`, true);
      await loadAllData();
      alert('✅ Deleted');
    } catch (error) {
      alert('❌ Error deleting');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-emerald-400" size={48} />
          <p className="text-xl text-slate-300">Loading system...</p>
        </div>
      </div>
    );
  }

  if (processing && processingProgress.total > 0) {
    const pct = Math.round((processingProgress.current / processingProgress.total) * 100);
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-3xl shadow-2xl p-10 max-w-lg w-full border border-slate-700">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-2xl inline-block mb-6">
              <BarChart3 className="text-white animate-pulse" size={48} />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Processing Documents</h2>
            <p className="text-slate-400 text-lg">
              {processingProgress.current} of {processingProgress.total} files
            </p>
          </div>
          
          <div className="mb-8">
            <div className="bg-slate-700 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-center mt-3 text-2xl font-bold text-emerald-400">{pct}%</p>
          </div>

          {processedFiles.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-2 bg-slate-900 rounded-xl p-4">
              {processedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  {file.status === 'success' && <span className="text-emerald-400 text-lg">✓</span>}
                  {file.status === 'error' && <span className="text-red-400 text-lg">✗</span>}
                  {file.status === 'duplicate' && <span className="text-yellow-400 text-lg">⊘</span>}
                  <span className="text-slate-300 truncate flex-1">{file.fileName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalFuel = (summary?.totalDiesel || 0) + (summary?.totalPetrol || 0) + (summary?.totalLPG || 0);

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Modern Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-3 rounded-xl">
                <Leaf className="text-white" size={32} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">Carbon Footprint Tracker</h1>
                <p className="text-slate-400">Sun Engineering {isAdmin && '· Administrator'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {!isAdmin ? (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-5 py-3 rounded-xl transition-all font-semibold"
                >
                  <Lock size={18} />
                  Admin Login
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowReminderModal(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-xl transition-all"
                    title="Send reminders"
                  >
                    <Bell size={20} />
                  </button>
                  <button
                    onClick={loadAllData}
                    className="bg-slate-700 hover:bg-slate-600 text-white p-3 rounded-xl transition-all"
                    title="Refresh"
                  >
                    <RefreshCw size={20} />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl transition-all font-semibold"
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Banner */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-2xl p-5 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="text-emerald-400" size={24} />
              <div>
                <p className="text-white font-semibold text-lg">
                  {isAdmin ? `${extractedData.length} Invoices Tracked` : 'Upload Portal Active'}
                </p>
                <p className="text-slate-400 text-sm">
                  {isAdmin ? 'Administrator access enabled' : 'Team members can upload documents'}
                </p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-lg">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-emerald-400 text-sm font-semibold">System Online</span>
              </div>
            )}
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 mb-8">
          <div className="border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-2xl p-12 text-center transition-all bg-slate-900/50">
            <Upload className="mx-auto mb-4 text-slate-400" size={48} />
            <label className="cursor-pointer block">
              <span className="text-2xl font-bold text-white block mb-2">
                Drop Files or Click to Upload
              </span>
              <p className="text-slate-400 mb-6">
                PDF invoices · Electricity, Water, Fuel, LPG, Gas
              </p>
              <div className="inline-block bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all shadow-lg shadow-emerald-500/20">
                Select Files
              </div>
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Files Queue - Admin */}
        {files.length > 0 && isAdmin && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="text-emerald-400" size={24} />
                Ready to Process ({files.length})
              </h3>
              <button
                onClick={processAllFiles}
                disabled={processing}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-slate-600 disabled:to-slate-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg"
              >
                ⚡ Process All
              </button>
            </div>
            <div className="space-y-3">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-900 border border-slate-700 p-4 rounded-xl hover:border-emerald-500 transition-all">
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="text-emerald-400" size={20} />
                    <span className="text-white font-medium">{file.name}</span>
                  </div>
                  <button
                    onClick={() => extractDataFromPDF(file, false)}
                    disabled={processing}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-6 py-2 rounded-lg font-semibold transition-all"
                  >
                    Extract
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files Queue - Team */}
        {files.length > 0 && !isAdmin && (
          <div className="bg-slate-800 border border-emerald-500/30 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-bold text-white mb-4">✅ Files Uploaded ({files.length})</h3>
            <p className="text-slate-400 mb-4">Administrator will process these documents</p>
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-slate-300 text-sm mb-2">
                <FileText size={16} className="text-emerald-400" />
                {file.name}
              </div>
            ))}
          </div>
        )}

        {/* Summary Cards - Admin */}
        {isAdmin && summary && summary.invoiceCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-6">
              <Zap className="text-yellow-400 mb-3" size={28} />
              <p className="text-3xl font-bold text-white mb-1">{summary.totalElectricity.toLocaleString()}</p>
              <p className="text-yellow-400 font-semibold">kWh Electricity</p>
              <p className="text-slate-400 text-sm mt-2">
                {(summary.totalElectricity * EMISSION_FACTORS.electricity / 1000).toFixed(2)} t CO₂
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-6">
              <Droplet className="text-blue-400 mb-3" size={28} />
              <p className="text-3xl font-bold text-white mb-1">{summary.totalWater.toLocaleString()}</p>
              <p className="text-blue-400 font-semibold">kL Water</p>
              <p className="text-slate-400 text-sm mt-2">
                {(summary.totalWater * EMISSION_FACTORS.water / 1000).toFixed(2)} t CO₂
              </p>
            </div>

            <div className="bg-gradient-to-br from-red-500/10 to-pink-500/10 border border-red-500/20 rounded-2xl p-6">
              <Fuel className="text-red-400 mb-3" size={28} />
              <p className="text-3xl font-bold text-white mb-1">{totalFuel.toLocaleString()}</p>
              <p className="text-red-400 font-semibold">L Fuel</p>
              <p className="text-slate-400 text-sm mt-2">
                Petrol {summary.totalPetrol.toFixed(0)}L · Diesel {summary.totalDiesel.toFixed(0)}L
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-6">
              <TrendingUp className="text-emerald-400 mb-3" size={28} />
              <p className="text-3xl font-bold text-white mb-1">{summary.totalEmissions.toFixed(2)}</p>
              <p className="text-emerald-400 font-semibold">tonnes CO₂</p>
              <p className="text-slate-400 text-sm mt-2">
                From {summary.invoiceCount} invoices
              </p>
            </div>
          </div>
        )}

        {/* Data Table - Admin */}
        {isAdmin && extractedData.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Invoice Registry</h2>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download size={20} />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase">Date</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase">Type</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-slate-400 uppercase">Supplier</th>
                    <th className="px-4 py-4 text-right text-xs font-bold text-slate-400 uppercase">Usage</th>
                    <th className="px-4 py-4 text-right text-xs font-bold text-slate-400 uppercase">CO₂ (t)</th>
                    <th className="px-4 py-4 text-right text-xs font-bold text-slate-400 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedData.map((item, idx) => {
                    let usage = '';
                    if (item.electricity_kwh) usage = `${item.electricity_kwh.toLocaleString()} kWh`;
                    else if (item.water_kl) usage = `${item.water_kl.toLocaleString()} kL`;
                    else if (item.petrol_litres) usage = `${item.petrol_litres.toFixed(1)} L petrol`;
                    else if (item.diesel_litres) usage = `${item.diesel_litres.toFixed(1)} L diesel`;
                    
                    return (
                      <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString('en-AU') : '-'}
                        </td>
                        <td className="px-4 py-4">
                          <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold capitalize border border-emerald-500/20">
                            {item.documentType || 'other'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-white font-medium">{item.supplier || 'Unknown'}</td>
                        <td className="px-4 py-4 text-sm text-slate-300 text-right">{usage || '-'}</td>
                        <td className="px-4 py-4 text-sm font-bold text-emerald-400 text-right">
                          {item.calculatedEmissions_tonnes?.toFixed(2) || '-'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => deleteInvoice(item.id)}
                            className="text-red-400 hover:text-red-300 text-sm font-semibold transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-8">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 rounded-2xl inline-block mb-4">
                <Lock className="text-white" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Administrator Login</h2>
              <p className="text-slate-400">Enter password to access admin features</p>
            </div>

            <div className="space-y-4">
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Enter password"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                autoFocus
              />

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-xs text-blue-400">
                  <strong>Default:</strong> SunEng2025
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleLogin}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setShowLoginModal(false);
                    setPasswordInput('');
                  }}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {isAdmin && showReminderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl max-w-2xl w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Bell className="text-emerald-400" size={28} />
                <h2 className="text-2xl font-bold text-white">Send Reminders</h2>
              </div>
              <button
                onClick={() => setShowReminderModal(false)}
                className="text-slate-400 hover:text-white text-3xl transition-colors"
              >
                ×
              </button>
            </div>

            <textarea
              value={reminderEmails}
              onChange={(e) => setReminderEmails(e.target.value)}
              placeholder="Enter email addresses (comma separated)&#10;example: sarah@suneng.com.au, mark@suneng.com.au"
              className="w-full h-32 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  const emails = reminderEmails.split(/[,;\n]/).map(e => e.trim()).filter(e => e);
                  if (emails.length) {
                    const url = window.location.href;
                    window.location.href = `mailto:${emails.join(',')}?subject=${encodeURIComponent('Upload Monthly Bills')}&body=${encodeURIComponent(`Hi,\n\nPlease upload your bills: ${url}\n\nThanks!`)}`;
                    setShowReminderModal(false);
                  }
                }}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
              >
                Send Email
              </button>
              <button
                onClick={() => setShowReminderModal(false)}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarbonFootprintTracker;
