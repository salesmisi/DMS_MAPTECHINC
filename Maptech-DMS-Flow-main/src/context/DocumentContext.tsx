import React, {
  useState,
  createContext,
  useContext,
  ReactNode,
  useEffect
} from 'react';

export interface Document {
  id: string;
  title: string;
  department: string;
  reference: string;
  date: string;
  uploadedBy: string;
  uploadedById: string;
  status: 'pending' | 'approved' | 'rejected' | 'archived' | 'trashed';
  version: number;
  fileType: 'pdf' | 'doc' | 'docx' | 'xlsx' | 'jpg' | 'png' | 'tiff' | 'mp4' | 'mov' | 'avi' | 'mkv';
  size: string;
  folderId: string;
  needsApproval: boolean;
  approvedBy?: string;
  rejectionReason?: string;
  metadata?: Record<string, string>;
  isEncrypted?: boolean;
  retentionDays?: number;
  trashedAt?: string;
  archivedAt?: string;
  tags?: string[];
  description?: string;
  scannedFrom?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  department: string;
  createdBy: string;
  createdById: string;
  createdByRole: 'admin' | 'manager' | 'staff';
  visibility: 'private' | 'department' | 'admin-only';
  permissions: string[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  target: string;
  targetType: 'document' | 'folder' | 'user' | 'system';
  timestamp: string;
  ipAddress: string;
  details?: string;
}

interface DocumentContextType {
  documents: Document[];
  folders: Folder[];
  activityLogs: ActivityLog[];
  addDocument: (doc: Omit<Document, 'id'>) => Document;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  deleteDocument: (id: string) => void;
  approveDocument: (id: string, approvedBy: string) => void;
  rejectDocument: (id: string, reason: string, rejectedBy: string) => void;
  trashDocument: (id: string) => void;
  restoreDocument: (id: string) => void;
  archiveDocument: (id: string) => void;
  permanentlyDelete: (id: string) => void;
  addFolder: (folder: Omit<Folder, 'id' | 'createdAt'>) => void;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  addLog: (log: Omit<ActivityLog, 'id'>) => void;
  uploadNewVersion: (id: string, uploadedBy: string) => void;
  refreshDocuments: () => Promise<void>;
}

const DocumentContext = createContext<DocumentContextType>(
  {} as DocumentContextType
);

export function useDocuments() {
  return useContext(DocumentContext);
}

const DOCS_KEY = 'dms_documents';

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // 🔹 NORMALIZE folder row from DB (snake_case -> camelCase)
  const normalizeFolder = (f: any): Folder => ({
    id: f.id,
    name: f.name,
    parentId: f.parent_id ?? f.parentId ?? null,
    department: f.department,
    createdBy: f.created_by ?? f.createdBy ?? '',
    createdById: f.created_by_id ?? f.createdById ?? '',
    createdByRole: f.created_by_role ?? f.createdByRole ?? 'staff',
    visibility: f.visibility ?? 'private',
    permissions: f.permissions ?? [],
    createdAt: f.created_at ?? f.createdAt ?? '',
  });

  // 🔹 LOAD FOLDERS FROM BACKEND
  const fetchFolders = async () => {
    try {
      const token = localStorage.getItem("dms_token");

      const res = await fetch("http://localhost:5000/api/folders", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();

      if (data.folders) {
        setFolders(data.folders.map(normalizeFolder));
      }

    } catch (err) {
      console.error("Failed to fetch folders:", err);
    }
  };

  // 🔹 NORMALIZE document row from DB (snake_case -> camelCase)
  const normalizeDocument = (d: any): Document => ({
    id: d.id,
    title: d.title,
    department: d.department || '',
    reference: d.reference || '',
    date: d.date ? (typeof d.date === 'string' ? d.date.split('T')[0] : d.date) : '',
    uploadedBy: d.uploaded_by ?? d.uploadedBy ?? '',
    uploadedById: d.uploaded_by_id ?? d.uploadedById ?? '',
    status: d.status || 'pending',
    version: d.version || 1,
    fileType: d.file_type ?? d.fileType ?? 'pdf',
    size: d.size || '',
    folderId: d.folder_id ?? d.folderId ?? '',
    needsApproval: d.needs_approval ?? d.needsApproval ?? true,
    approvedBy: d.approved_by ?? d.approvedBy ?? undefined,
    rejectionReason: d.rejection_reason ?? d.rejectionReason ?? undefined,
    metadata: d.metadata ?? undefined,
    isEncrypted: d.is_encrypted ?? d.isEncrypted ?? false,
    retentionDays: d.retention_days ?? d.retentionDays ?? undefined,
    trashedAt: d.trashed_at ?? d.trashedAt ?? undefined,
    archivedAt: d.archived_at ?? d.archivedAt ?? undefined,
    tags: d.tags ?? [],
    description: d.description ?? undefined,
    scannedFrom: d.scanned_from ?? d.scannedFrom ?? undefined,
  });

  // 🔹 LOAD DOCUMENTS FROM BACKEND
  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem("dms_token");
      if (!token) {
        // Fallback to localStorage if not authenticated yet
        const storedDocs = localStorage.getItem(DOCS_KEY);
        if (storedDocs) setDocuments(JSON.parse(storedDocs));
        return;
      }
      const res = await fetch("http://localhost:5000/api/documents", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        // Fallback to localStorage
        const storedDocs = localStorage.getItem(DOCS_KEY);
        if (storedDocs) setDocuments(JSON.parse(storedDocs));
        return;
      }
      const data = await res.json();
      if (data.documents && data.documents.length > 0) {
        setDocuments(data.documents.map(normalizeDocument));
      } else {
        // Fallback to localStorage if DB empty
        const storedDocs = localStorage.getItem(DOCS_KEY);
        if (storedDocs) setDocuments(JSON.parse(storedDocs));
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
      const storedDocs = localStorage.getItem(DOCS_KEY);
      if (storedDocs) setDocuments(JSON.parse(storedDocs));
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchFolders();
    fetchActivityLogs();
  }, []);

  // 🔹 Re-fetch documents when token changes (e.g. after login)
  useEffect(() => {
    const handleStorageChange = () => {
      const token = localStorage.getItem("dms_token");
      if (token) {
        fetchDocuments();
        fetchFolders();
      }
    };

    // Listen for storage events (cross-tab) and custom event (same-tab)
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dms-auth-change', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dms-auth-change', handleStorageChange);
    };
  }, []);

  // 🔹 AUTO SAVE (keep localStorage as cache)
  useEffect(() => {
    if (documents.length > 0) {
      localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
    }
  }, [documents]);

  // Fetch activity logs from backend
  const fetchActivityLogs = async () => {
    try {
      const token = localStorage.getItem('dms_token');
      if (!token) return;
      const res = await fetch('http://localhost:5000/api/activity-logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.logs) setActivityLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    }
  };

  const addLog = async (log: Omit<ActivityLog, 'id'>) => {
    // Optimistically add to local state
    const tempId = `log-${Date.now()}`;
    const newLog: ActivityLog = { ...log, id: tempId };
    setActivityLogs((prev) => [newLog, ...prev]);

    // Send to backend
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch('http://localhost:5000/api/activity-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: log.action,
          target: log.target,
          targetType: log.targetType,
          ipAddress: log.ipAddress,
          details: log.details,
          userName: log.userName,
          userRole: log.userRole
        })
      });
      if (res.ok) {
        const data = await res.json();
        // Replace temp entry with real one from server
        if (data.log) {
          setActivityLogs((prev) =>
            prev.map((l) => (l.id === tempId ? data.log : l))
          );
        }
      }
    } catch (err) {
      console.error('Failed to save activity log:', err);
    }
  };

  const addDocument = (doc: Omit<Document, 'id'>): Document => {
    const newDoc: Document = {
      ...doc,
      id: `doc-${Date.now()}`
    };
    setDocuments((prev) => [newDoc, ...prev]);
    return newDoc;
  };

  const updateDocument = (id: string, updates: Partial<Document>) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const deleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const approveDocument = async (id: string, approvedBy: string) => {
    updateDocument(id, { status: 'approved', approvedBy });
    try {
      const token = localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Failed to approve document on server:', err); }
  };

  const rejectDocument = async (id: string, reason: string, rejectedBy: string) => {
    updateDocument(id, { status: 'rejected', rejectionReason: reason, approvedBy: rejectedBy });
    try {
      const token = localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason })
      });
    } catch (err) { console.error('Failed to reject document on server:', err); }
  };

  const trashDocument = async (id: string) => {
    updateDocument(id, { status: 'trashed', trashedAt: new Date().toISOString() });
    try {
      const token = localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/trash`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Failed to trash document on server:', err); }
  };

  const restoreDocument = async (id: string) => {
    updateDocument(id, { status: 'approved', trashedAt: undefined, archivedAt: undefined });
    try {
      const token = localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/restore`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Failed to restore document on server:', err); }
  };

  const archiveDocument = async (id: string) => {
    updateDocument(id, { status: 'archived', archivedAt: new Date().toISOString(), retentionDays: 30 });
    try {
      const token = localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}/archive`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Failed to archive document on server:', err); }
  };

  const permanentlyDelete = async (id: string) => {
    deleteDocument(id);
    try {
      const token = localStorage.getItem('dms_token');
      await fetch(`http://localhost:5000/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Failed to permanently delete document on server:', err); }
  };

  const uploadNewVersion = (id: string, uploadedBy: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              version: d.version + 1,
              uploadedBy,
              date: new Date().toISOString().split('T')[0]
            }
          : d
      )
    );
  };

  // 🔹 CREATE FOLDER (API)
  const addFolder = async (folder: Omit<Folder, 'id' | 'createdAt'>) => {
    try {
      const token = localStorage.getItem("dms_token");

      const res = await fetch("http://localhost:5000/api/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: folder.name,
          parentId: folder.parentId,
          department: folder.department,
          createdBy: folder.createdBy,
          createdById: folder.createdById,
          createdByRole: folder.createdByRole,
          visibility: folder.visibility,
          permissions: folder.permissions
        })
      });

      // Always refetch folders after creation to ensure UI is up to date
      await fetchFolders();

    } catch (err) {
      console.error("Error creating folder:", err);
    }
  };

  const updateFolder = (id: string, updates: Partial<Folder>) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const deleteFolder = (id: string) => {
    setFolders((prev) =>
      prev.filter((f) => f.id !== id && f.parentId !== id)
    );
  };

  return (
    <DocumentContext.Provider
      value={{
        documents,
        folders,
        activityLogs,
        addDocument,
        updateDocument,
        deleteDocument,
        approveDocument,
        rejectDocument,
        trashDocument,
        restoreDocument,
        archiveDocument,
        permanentlyDelete,
        addFolder,
        updateFolder,
        deleteFolder,
        addLog,
        uploadNewVersion,
        refreshDocuments: fetchDocuments
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}