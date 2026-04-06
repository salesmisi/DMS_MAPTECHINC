import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ScanLine, Upload, WifiOff, XCircle } from 'lucide-react';
import { useScanner } from '../hooks/useScanner';

interface FolderOption {
  id: string;
  name: string;
}

interface ScannerPanelProps {
  folders: FolderOption[];
  onUploaded?: () => Promise<void> | void;
}

export function ScannerPanel({ folders, onUploaded }: ScannerPanelProps) {
  const {
    agentOnline,
    scanners,
    selectedScanner,
    setSelectedScanner,
    loading,
    error,
    successMessage,
    previewUrl,
    previewContentType,
    initializeScanner,
    scanNow,
    scanWithPreviewFlow,
    uploadPreview,
    cancelPreview,
    clearMessages,
  } = useScanner();

  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState('');
  const [dpi, setDpi] = useState(300);
  const [color, setColor] = useState('color');
  const [paperSize, setPaperSize] = useState('A4');

  useEffect(() => {
    void initializeScanner();
  }, [initializeScanner]);

  useEffect(() => {
    if (!folderId && folders.length > 0) {
      setFolderId(folders[0].id);
    }
  }, [folderId, folders]);

  const previewIsPdf = useMemo(() => {
    if (!previewUrl) {
      return false;
    }

    return (previewContentType || '').includes('pdf') || previewUrl.toLowerCase().includes('.pdf');
  }, [previewContentType, previewUrl]);

  const validateBeforeScan = () => {
    clearMessages();

    if (!title.trim()) {
      return false;
    }

    if (!folderId) {
      return false;
    }

    return true;
  };

  const handleScanNow = async () => {
    if (!validateBeforeScan()) {
      return;
    }

    await scanNow({
      title,
      folderId,
      scanner: selectedScanner,
      dpi,
      color,
      paperSize,
    });

    await onUploaded?.();
  };

  const handlePreviewScan = async () => {
    clearMessages();

    await scanWithPreviewFlow({
      scanner: selectedScanner,
      dpi,
      color,
      paperSize,
    });
  };

  const handleUploadPreview = async () => {
    if (!validateBeforeScan()) {
      return;
    }

    await uploadPreview(title, folderId);
    await onUploaded?.();
  };

  return (
    <section className="rounded-3xl border border-[#d9d2b0] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#ece6ca] pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#1f3d1c]">Local Scanner Agent</h2>
          <p className="mt-1 text-sm text-[#5f6f52]">
            Scan from a local NAPS2-connected device and upload straight into the DMS.
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            agentOnline
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {agentOnline ? <CheckCircle2 size={16} /> : <WifiOff size={16} />}
          <span>{agentOnline ? 'Scanner Agent Connected ✅' : 'Scanner Agent Not Found ❌'}</span>
        </div>
      </div>

      {!agentOnline && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Scanner agent not running. Please install or start the scanner agent.
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="block text-sm font-medium text-[#244120]">
          Document Title
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            placeholder="Enter a title for the scanned document"
            disabled={loading}
          />
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Save To Folder
          <select
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading || folders.length === 0}
          >
            <option value="">Select a folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Scanner
          <select
            value={selectedScanner}
            onChange={(event) => setSelectedScanner(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading || scanners.length === 0 || !agentOnline}
          >
            <option value="">Default scanner</option>
            {scanners.map((scanner) => (
              <option key={scanner.id} value={scanner.id}>
                {scanner.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          DPI
          <select
            value={dpi}
            onChange={(event) => setDpi(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value={200}>200 DPI</option>
            <option value={300}>300 DPI</option>
            <option value={600}>600 DPI</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Color
          <select
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value="color">Color</option>
            <option value="grayscale">Grayscale</option>
            <option value="bw">Black & White</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-[#244120]">
          Paper Size
          <select
            value={paperSize}
            onChange={(event) => setPaperSize(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#d7d1b4] px-4 py-3 text-sm outline-none transition focus:border-[#7a8b52]"
            disabled={loading}
          >
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
        </label>
      </div>

      {!title.trim() && agentOnline && (
        <p className="mt-3 text-sm text-[#7b6f3d]">A document title is required before scanning or uploading.</p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleScanNow()}
          disabled={loading || !agentOnline || !title.trim() || !folderId}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1f6f43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#175736] disabled:cursor-not-allowed disabled:bg-[#9fb9a9]"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <ScanLine size={18} />}
          Scan Now
        </button>

        <button
          type="button"
          onClick={() => void handlePreviewScan()}
          disabled={loading || !agentOnline}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#c7be98] bg-[#f8f5e8] px-5 py-3 text-sm font-semibold text-[#3c4d2d] transition hover:bg-[#efe9d2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <ScanLine size={18} />}
          Scan with Preview
        </button>

        <button
          type="button"
          onClick={() => void initializeScanner()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d7d1b4] px-5 py-3 text-sm font-semibold text-[#435233] transition hover:bg-[#f7f4e7] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Loader2 size={18} />}
          Refresh Agent
        </button>
      </div>

      {loading && (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#f3f0e1] px-4 py-2 text-sm text-[#465438]">
          <Loader2 className="animate-spin" size={16} />
          Processing scan request...
        </div>
      )}

      {previewUrl && (
        <div className="mt-8 rounded-3xl border border-[#ddd4af] bg-[#fcfbf4] p-5">
          <div className="flex flex-col gap-3 border-b border-[#ece6ca] pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[#1f3d1c]">Preview</h3>
              <p className="text-sm text-[#627255]">Review the scan before uploading it to the selected folder.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleUploadPreview()}
                disabled={loading || !title.trim() || !folderId}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#205f34] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18492a] disabled:cursor-not-allowed disabled:bg-[#9fb9a9]"
              >
                <Upload size={16} />
                Upload
              </button>

              <button
                type="button"
                onClick={cancelPreview}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8cfad] px-4 py-2.5 text-sm font-semibold text-[#5e5a43] transition hover:bg-[#f5f0da] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XCircle size={16} />
                Cancel
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-[#e3dbc1] bg-white">
            {previewIsPdf ? (
              <iframe
                src={previewUrl}
                title="Scanned document preview"
                className="h-[520px] w-full"
              />
            ) : (
              <img
                src={previewUrl}
                alt="Scanned document preview"
                className="max-h-[520px] w-full object-contain"
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}