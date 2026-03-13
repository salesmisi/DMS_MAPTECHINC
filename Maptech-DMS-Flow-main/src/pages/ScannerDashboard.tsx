import React, { useState } from 'react';
import {
  Scan,
  Settings,
  CheckCircle,
  FileText,
  RefreshCw,
  Zap,
  Monitor
} from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { formatDate } from '../utils/locale';
import { useAuth } from '../context/AuthContext';

interface ScanJob {
  id: string;
  filename: string;
  scanner: string;
  date: string;
  pages: number;
  size: string;
  status: 'completed';
}

export function ScannerDashboard() {
  const { addDocument, folders, addLog } = useDocuments();
  const { user } = useAuth();

  // No demo scanners
  const [scanners] = useState<any[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string | null>(null);

  const [fileFormat, setFileFormat] = useState('pdf');
  const [destFolder, setDestFolder] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [scanJobs, setScanJobs] = useState<ScanJob[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const visibleFolders = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;
    return folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      if (vis === 'admin-only') return false;
      if (user.role === 'manager') return folder.department === user.department;
      if (user.role === 'staff') return folder.createdById === user.id;
      return false;
    });
  }, [folders, user]);
  const rootFolders = visibleFolders.filter((f) => f.parentId === null);

  const handleScan = async () => {
    if (!docTitle.trim()) {
      alert('Please enter a document title.');
      return;
    }

    setScanning(true);

    const filename = `${docTitle.replace(/\s+/g, '_')}.${fileFormat}`;

    const newJob: ScanJob = {
      id: `scan-${Date.now()}`,
      filename,
      scanner: 'Manual Upload',
      date: formatDate(new Date()),
      pages: 1,
      size: '0 MB',
      status: 'completed'
    };

    setScanJobs((prev) => [newJob, ...prev]);

    addDocument({
      title: docTitle,
      department: user?.department || 'Administration',
      reference: `SCAN-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      uploadedBy: user?.name || '',
      uploadedById: user?.id || '',
      status: 'pending',
      version: 1,
      fileType: fileFormat as any,
      size: newJob.size,
      folderId: destFolder,
      needsApproval: true,
      scannedFrom: 'Manual Upload',
      tags: ['scanned'],
      description: `Uploaded manually`
    });

    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'SCAN_DOCUMENT',
      target: docTitle,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '',
      details: 'Manual upload'
    });

    setScanning(false);
    setScanComplete(true);
    setDocTitle('');

    setTimeout(() => setScanComplete(false), 3000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Scan size={28} />
            Scanner Dashboard
          </h2>
          <p className="text-[#C0B87A] text-sm">
            Real scan integration ready
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-[#427A43] text-white text-sm rounded-lg hover:bg-[#C0B87A] hover:text-[#005F02] transition-colors"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Connected Devices */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Monitor size={18} className="text-[#427A43]" />
          Connected Devices
        </h3>

        <p className="text-sm text-gray-400">
          No scanners connected.
        </p>
      </div>

      {/* Scan Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Settings size={18} className="text-[#427A43]" />
          Scan Settings
        </h3>

        <div className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Document Title *
            </label>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Format
            </label>
            <select
              value={fileFormat}
              onChange={(e) => setFileFormat(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="jpg">JPEG</option>
              <option value="tiff">TIFF</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Destination Folder
            </label>
            <select
              value={destFolder}
              onChange={(e) => setDestFolder(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {rootFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {scanComplete && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-xs font-medium text-green-700">
                Scan complete! Document added.
              </span>
            </div>
          )}

          <button
            onClick={handleScan}
            disabled={scanning || !docTitle.trim()}
            className="w-full py-3 bg-[#005F02] text-white font-semibold text-sm rounded-xl hover:bg-[#427A43] transition-colors disabled:opacity-50"
          >
            <Zap size={18} className="inline mr-2" />
            {scanning ? 'Processing...' : 'Start Scan'}
          </button>
        </div>
      </div>

      {/* Recent Scans */}
      {scanJobs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={18} className="text-[#427A43]" />
              Recent Scans
            </h3>
          </div>

          <div className="p-4 text-sm text-gray-600">
            {scanJobs.map((job) => (
              <div key={job.id} className="py-2 border-b last:border-none">
                {job.filename} – {job.date}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}