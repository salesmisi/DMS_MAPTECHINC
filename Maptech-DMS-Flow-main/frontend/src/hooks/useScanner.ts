import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkAgent,
  getPreview,
  getScanners,
  scanDocument,
  scanWithPreview,
  uploadScan,
  type PreviewResult,
  type ScanDocumentPayload,
  type ScanPreviewPayload,
  type ScannerAgentDevice,
} from '../services/scannerService';

export interface ScannerFlowValues {
  title: string;
  folderId: string;
  scanner?: string;
  dpi?: number;
  color?: string;
  paperSize?: string;
}

const normalizeFolderId = (folderId: string) => {
  const trimmedFolderId = folderId.trim();

  if (!trimmedFolderId) {
    throw new Error('A valid folder must be selected before scanning.');
  }

  return trimmedFolderId;
};

export function useScanner() {
  const [agentOnline, setAgentOnline] = useState(false);
  const [scanners, setScanners] = useState<ScannerAgentDevice[]>([]);
  const [selectedScanner, setSelectedScanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const clearPreview = useCallback(() => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }

    setPreviewSessionId(null);
    setPreviewUrl(null);
    setPreviewContentType(null);
  }, []);

  const initializeScanner = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const online = await checkAgent();
      setAgentOnline(online);

      if (!online) {
        setScanners([]);
        setSelectedScanner('');
        setError('Scanner agent not running. Please install or start the scanner agent.');
        return false;
      }

      const availableScanners = await getScanners();
      setScanners(availableScanners);
      setSelectedScanner((current) => {
        if (current && availableScanners.some((scanner) => scanner.id === current)) {
          return current;
        }

        return availableScanners[0]?.id || '';
      });

      return true;
    } catch (err) {
      setAgentOnline(false);
      setScanners([]);
      setSelectedScanner('');
      setError(err instanceof Error ? err.message : 'Failed to initialize the scanner agent.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  const scanNow = useCallback(async (values: ScannerFlowValues) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload: ScanDocumentPayload = {
        title: values.title.trim(),
        folder_id: normalizeFolderId(values.folderId),
        scanner: values.scanner || selectedScanner || undefined,
        dpi: values.dpi,
        color: values.color,
        paperSize: values.paperSize,
      };

      const result = await scanDocument(payload);
      setSuccessMessage('Document scanned and uploaded successfully.');
      clearPreview();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, selectedScanner]);

  const scanWithPreviewFlow = useCallback(async (values?: Omit<ScannerFlowValues, 'title' | 'folderId'>) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload: ScanPreviewPayload = {
        scanner: values?.scanner || selectedScanner || undefined,
        dpi: values?.dpi,
        color: values?.color,
        paperSize: values?.paperSize,
      };

      clearPreview();

      const sessionId = await scanWithPreview(payload);
      const preview: PreviewResult = await getPreview(sessionId);

      if (preview.isObjectUrl) {
        previewObjectUrlRef.current = preview.previewUrl;
      }

      setPreviewSessionId(sessionId);
      setPreviewUrl(preview.previewUrl);
      setPreviewContentType(preview.contentType || null);

      return sessionId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview scan failed.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, selectedScanner]);

  const uploadPreview = useCallback(async (title: string, folderId: string) => {
    if (!previewSessionId) {
      const message = 'No preview session is available to upload.';
      setError(message);
      throw new Error(message);
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await uploadScan(previewSessionId, title.trim(), normalizeFolderId(folderId));
      setSuccessMessage('Scanned document uploaded successfully.');
      clearPreview();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [clearPreview, previewSessionId]);

  return {
    agentOnline,
    scanners,
    selectedScanner,
    setSelectedScanner,
    loading,
    error,
    successMessage,
    previewSessionId,
    previewUrl,
    previewContentType,
    initializeScanner,
    scanNow,
    scanWithPreviewFlow,
    uploadPreview,
    cancelPreview: clearPreview,
    clearMessages: () => {
      setError(null);
      setSuccessMessage(null);
    },
  };
}