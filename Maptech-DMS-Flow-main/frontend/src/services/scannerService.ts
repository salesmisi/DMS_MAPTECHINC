const SCANNER_AGENT_BASE_URL = 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 5000;
const TOKEN_STORAGE_KEYS = ['token', 'dms_token'];

export interface ScannerAgentDevice {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ScanDocumentPayload {
  title: string;
  folder_id: string | number;
  scanner?: string;
  dpi?: number;
  color?: string;
  paperSize?: string;
}

export interface ScanPreviewPayload {
  scanner?: string;
  dpi?: number;
  color?: string;
  paperSize?: string;
}

export interface PreviewResult {
  previewUrl: string;
  isObjectUrl: boolean;
  contentType?: string;
}

// Support both the generic token key and the app's existing dms_token key.
const getToken = () => TOKEN_STORAGE_KEYS
  .map((key) => window.localStorage.getItem(key))
  .find((value): value is string => Boolean(value));

const getRequiredToken = () => {
  const token = getToken();

  if (!token) {
    throw new Error('Authentication required. Please sign in again.');
  }

  return token;
};

const buildHeaders = (includeAuth = false, includeJson = false) => {
  const token = getToken();

  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(includeAuth && token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const buildRequiredAuthHeaders = (includeJson = false) => {
  const token = getRequiredToken();

  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
};

const withTimeout = async (input: RequestInfo | URL, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const readErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    return data.message || data.error || 'Scanner agent request failed.';
  }

  const text = await response.text();
  return text || 'Scanner agent request failed.';
};

const requestJson = async <T>(path: string, init?: RequestInit) => {
  const response = await withTimeout(`${SCANNER_AGENT_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export async function checkAgent() {
  try {
    const response = await withTimeout(`${SCANNER_AGENT_BASE_URL}/health`, {
      headers: buildHeaders(),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function getScanners() {
  const data = await requestJson<ScannerAgentDevice[] | { scanners?: ScannerAgentDevice[] }>('/scanners', {
    headers: buildHeaders(),
  });

  if (Array.isArray(data)) {
    return data;
  }

  return data.scanners || [];
}

export async function scanDocument(payload: ScanDocumentPayload) {
  // The token is forwarded to the local agent so it can upload to the cloud backend per request.
  return requestJson<Record<string, unknown>>('/scan', {
    method: 'POST',
    headers: buildRequiredAuthHeaders(true),
    body: JSON.stringify(payload),
  });
}

export async function scanWithPreview(payload: ScanPreviewPayload = {}) {
  const data = await requestJson<{ sessionId?: string; session_id?: string }>('/scan-local', {
    method: 'POST',
    headers: buildRequiredAuthHeaders(true),
    body: JSON.stringify(payload),
  });

  const sessionId = data.sessionId || data.session_id;

  if (!sessionId) {
    throw new Error('Scanner agent did not return a preview session ID.');
  }

  return sessionId;
}

export async function getPreview(sessionId: string): Promise<PreviewResult> {
  const response = await withTimeout(`${SCANNER_AGENT_BASE_URL}/scan/${sessionId}/preview`, {
    headers: buildRequiredAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json() as { previewUrl?: string; url?: string };
    const previewUrl = data.previewUrl || data.url;

    if (!previewUrl) {
      throw new Error('Scanner agent did not return a preview URL.');
    }

    return {
      previewUrl,
      isObjectUrl: false,
      contentType,
    };
  }

  const blob = await response.blob();
  return {
    previewUrl: URL.createObjectURL(blob),
    isObjectUrl: true,
    contentType: blob.type || contentType,
  };
}

export async function uploadScan(sessionId: string, title: string, folder_id: string | number) {
  // The local agent must receive the same bearer token the backend expects.
  return requestJson<Record<string, unknown>>('/upload', {
    method: 'POST',
    headers: buildRequiredAuthHeaders(true),
    body: JSON.stringify({ sessionId, title, folder_id }),
  });
}

export const scannerService = {
  checkAgent,
  getScanners,
  scanDocument,
  scanWithPreview,
  getPreview,
  uploadScan,
};