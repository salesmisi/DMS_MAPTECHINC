import React, { useState, Children } from 'react';
import RequestDeleteModal from '../components/RequestDeleteModal';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import {
  Search,
  Filter,
  Grid,
  List,
  Upload,
  FileText,
  Download,
  Edit2,
  Trash2,
  Archive,
  Eye,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  RefreshCw,
  Lock,
  Plus,
  X } from
'lucide-react';
import { useDocuments, Document } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { UploadModal } from '../components/UploadModal';
import { DeleteFolderModal } from '../components/DeleteFolderModal';
import FilePreview from '../components/FilePreview';
import { useNavigation } from '../App';
import { useLanguage } from '../context/LanguageContext';

// Recursive folder tree item component
const DT_INDENT = 10;
const DT_MAX = 6;

interface FolderTreeItemProps {
  folder: { id: string; name: string; parentId: string | null };
  selectedFolder: string | null;
  selectFolder: ((id: string | null) => void) | null;
  getChildren: (parentId: string) => { id: string; name: string; parentId: string | null }[];
  onCreateSubfolder: (parentId: string) => void;
  level: number;
}

function FolderTreeItem({ folder, selectedFolder, selectFolder, getChildren, onCreateSubfolder, level }: FolderTreeItemProps) {
  const [expanded, setExpanded] = React.useState(level < 2);
  const [deleteModal, setDeleteModal] = React.useState(false);
  const { deleteFolder, folders } = useDocuments();
  const { user, users } = useAuth();
  const children = getChildren(folder.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedFolder === folder.id;
  const depth = Math.min(level, DT_MAX);
  // Find the full folder object to check isDepartment
  const fullFolder = folders.find(f => f.id === folder.id) || (folder as any);
  const isDepartment = fullFolder.isDepartment || fullFolder.is_department;
  // Only admin can delete/rename department folders
  const canDelete = !isDepartment || (user && user.role === 'admin');

  return (
    <div className="ft-node">
      <div
        className={`ft-row group ${
          isSelected ? 'bg-[#427A43] text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${4 + depth * DT_INDENT}px` }}
      >
        {/* Guide lines */}
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="ft-guide" style={{ left: `${4 + (i + 1) * DT_INDENT - 5}px` }} />
        ))}

        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="ft-chevron">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="ft-spacer" />
        )}

        <button
          onClick={() => selectFolder && selectFolder(isSelected ? null : folder.id)}
          className="ft-name-btn"
        >
          <FolderOpen size={14} className="ft-icon" />
          <span className="ft-label" title={folder.name}>{folder.name}</span>
          {isDepartment && (
            <span className="ml-2 text-xs text-gray-400 flex items-center" title="Department Folder — protected">
              <Lock size={12} />
            </span>
          )}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onCreateSubfolder(folder.id); }}
          className={`ft-action ${
            isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-200 text-gray-500'
          }`}
          title="Create subfolder"
        >
          <Plus size={12} />
        </button>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteModal(true); }}
            className={`ft-action ${
              isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-red-100 text-red-400'
            }`}
            title="Delete folder"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {deleteModal && (
        <DeleteFolderModal
          folderName={folder.name}
          hasChildren={hasChildren}
          childCount={children.length}
          onConfirm={() => {
            (async () => {
              if (isSelected) selectFolder && selectFolder(null);
              const res = await deleteFolder(folder.id);
              if (res && res.status === 202) {
                alert(res.message || 'Delete approval requested');
              } else if (res && !res.ok) {
                alert(res.error || 'Failed to delete folder');
              }
              setDeleteModal(false);
            })();
          }}
          onCancel={() => setDeleteModal(false)}
        />
      )}

      {expanded && hasChildren && (
        <div className="ft-children">
          {children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              selectedFolder={selectedFolder}
              selectFolder={selectFolder}
              getChildren={getChildren}
              onCreateSubfolder={onCreateSubfolder}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentsPage() {
  const {
    documents,
    folders,
    trashDocument,
    archiveDocument,
    addLog,
    uploadNewVersion,
    addFolder
  } = useDocuments();
  const { user, users } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  // selectedFolder is shared via NavigationContext so other pages can set it
  const { selectedFolderId, selectFolder } = useNavigation();
  const selectedFolder = selectedFolderId ?? null;
  const visibleFolders = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;

    // Build a set of visible folder IDs including descendants
    const visibleIds = new Set<string>();

    // First pass: find all directly visible root/parent folders
    const directlyVisible = folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      if (vis === 'admin-only') return false;
      if (user.role === 'manager') {
        return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
      }
      if (user.role === 'staff') {
        if (vis === 'department' && String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase()) return true;
        if (vis === 'private' && String(folder.createdById || '') === String(user.id || '')) return true;
        return false;
      }
      return false;
    });

    directlyVisible.forEach((f) => visibleIds.add(f.id));

    // Second pass: recursively add all descendants of visible folders
    const addDescendants = (parentId: string) => {
      folders.forEach((f) => {
        if (f.parentId === parentId && !visibleIds.has(f.id)) {
          visibleIds.add(f.id);
          addDescendants(f.id);
        }
      });
    };

    directlyVisible.forEach((f) => addDescendants(f.id));

    // Third pass: add ancestors of visible folders (so tree structure is complete)
    const addAncestors = (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      if (folder?.parentId && !visibleIds.has(folder.parentId)) {
        visibleIds.add(folder.parentId);
        addAncestors(folder.parentId);
      }
    };

    directlyVisible.forEach((f) => addAncestors(f.id));

    return folders.filter((f) => visibleIds.has(f.id));
  }, [folders, user]);
  const [showUpload, setShowUpload] = useState(false);
  const [actionDoc, setActionDoc] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [trashTarget, setTrashTarget] = useState<Document | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const departments = React.useMemo(() => {
    // derive departments from root folders that are marked as department (locked)
    // and only include those that also have at least one assigned user
    if (!folders || folders.length === 0) return [];
    const rootDeptSet = new Set<string>();
    folders.forEach((f) => {
      const isDept = (f as any).is_department || (f as any).isDepartment || false;
      if ((!f.parentId && f.parent_id === undefined) || f.parentId === null || f.parent_id === null) {
        if (isDept) {
          const d = String(f.department || f.name || '').trim();
          if (d) rootDeptSet.add(d);
        }
      }
    });
    if (!users || users.length === 0) return Array.from(rootDeptSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const userDeptSet = new Set<string>();
    users.forEach((u: any) => {
      const d = String(u.department || '').trim();
      if (d) userDeptSet.add(d);
    });
    const intersection = Array.from(rootDeptSet).filter((d) => userDeptSet.has(d));
    return intersection.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [folders, users]);

  const activeDocuments = documents.filter((d) => d.status !== 'trashed' && d.status !== 'archived');

  // Build a set of visible folder IDs for quick lookup
  const visibleFolderIds = React.useMemo(() => {
    return new Set(visibleFolders.map((f) => f.id));
  }, [visibleFolders]);

  // Role-based document visibility:
  // admin -> all documents
  // manager -> documents in their department OR in any visible folder
  // staff -> documents they uploaded OR in their department OR in any visible folder
  const hasDocumentAccess = (doc: Document) => {
    if (!user) return false;
    if (user.role === 'admin') return true;

    // Check if document is in a visible folder
    const inVisibleFolder = doc.folderId && visibleFolderIds.has(doc.folderId);

    if (user.role === 'manager') {
      return doc.department === user.department || inVisibleFolder;
    }

    // staff: allow staff to see documents in their department, their uploads, or in visible folders
    return doc.uploadedById === user.id ||
           String(doc.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase() ||
           inVisibleFolder;
  };

  const filtered = activeDocuments.filter((doc) => {
    const matchSearch =
    !search ||
    doc.title.toLowerCase().includes(search.toLowerCase()) ||
    doc.reference.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all' || doc.department === filterDept;
    const matchStatus = filterStatus === 'all' || doc.status === filterStatus;
    const matchType = filterType === 'all' || doc.fileType === filterType;
    const matchFolder = !selectedFolder || (doc.folderId && doc.folderId === selectedFolder);
    return matchSearch && matchDept && matchStatus && matchType && matchFolder && hasDocumentAccess(doc);
  });

  React.useEffect(() => {
    const pendingDocId = sessionStorage.getItem('dms_preview_doc_id');
    if (!pendingDocId) return;

    const docToPreview = activeDocuments.find((d) => String(d.id) === String(pendingDocId));
    if (!docToPreview) return;

    if (docToPreview.folderId && selectFolder) {
      selectFolder(docToPreview.folderId);
    }

    setViewingDoc(docToPreview);
    sessionStorage.removeItem('dms_preview_doc_id');
  }, [activeDocuments, selectFolder]);

  const searchSuggestions = React.useMemo(() =>
    activeDocuments.filter(d => hasDocumentAccess(d)).flatMap((d) => [d.title, d.reference]).filter(Boolean),
    [activeDocuments, user]
  );
  const rootFolders = visibleFolders.filter((f) => f.parentId === null);
  const getChildren = (parentId: string) => visibleFolders.filter((f) => f.parentId === parentId);
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      archived: 'bg-blue-100 text-blue-700'
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  };
  const fileTypeColors: Record<string, string> = {
    pdf: 'bg-red-100 text-red-700',
    docx: 'bg-blue-100 text-blue-700',
    xlsx: 'bg-green-100 text-green-700',
    jpg: 'bg-purple-100 text-purple-700',
    png: 'bg-pink-100 text-pink-700',
    tiff: 'bg-cyan-100 text-cyan-700',
    mp4: 'bg-indigo-100 text-indigo-700',
    mov: 'bg-indigo-100 text-indigo-700',
    avi: 'bg-indigo-100 text-indigo-700',
    mkv: 'bg-indigo-100 text-indigo-700'
  };
  const handleTrash = (doc: Document) => {
    setTrashTarget(doc);
    setActionDoc(null);
  };
  const confirmTrash = (doc: Document) => {
    trashDocument(doc.id);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_TRASHED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    setTrashTarget(null);
  };
  const handleArchive = (doc: Document) => {
    archiveDocument(doc.id);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_ARCHIVED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    setActionDoc(null);
  };
  const handleView = (doc: Document) => {
    setViewingDoc(doc);
    addLog({
      userId: user?.id || '',
      userName: user?.name || '',
      userRole: user?.role || '',
      action: 'DOCUMENT_VIEWED',
      target: doc.title,
      targetType: 'document',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `Viewed document: ${doc.reference} in folder ${doc.folderId || 'root'}`
    });
  };
  const handleDownload = async (doc: Document) => {
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title}.${doc.fileType}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addLog({
        userId: user?.id || '',
        userName: user?.name || '',
        userRole: user?.role || '',
        action: 'DOCUMENT_DOWNLOAD',
        target: doc.title,
        targetType: 'document',
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100'
      });
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file.');
    }
  };
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizing = React.useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    e.preventDefault();
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(ev.clientX - 16, 160), 480);
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Wrapper for folder selection with activity logging
  const handleFolderSelect = (folderId: string | null) => {
    if (selectFolder) {
      selectFolder(folderId);
      if (folderId) {
        const folder = visibleFolders.find(f => f.id === folderId);
        addLog({
          userId: user?.id || '',
          userName: user?.name || '',
          userRole: user?.role || '',
          action: 'FOLDER_ACCESSED',
          target: folder?.name || folderId,
          targetType: 'folder',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100',
          details: `Accessed folder: ${folder?.name || folderId}`
        });
      }
    }
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Folder Tree Sidebar */}
      <div className="ft-container flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-100 p-3 relative" style={{ width: sidebarWidth }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <FolderOpen size={16} className="text-[#427A43]" />
            Folders
          </h3>
            {user?.role !== 'staff' && (
              <button
                onClick={() => setShowCreateFolder(true)}
                className="p-1 rounded-md bg-[#005F02] text-white hover:bg-[#427A43] transition-colors"
                title="Create Folder">
                <Plus size={14} />
              </button>
            )}
        </div>
        <div
          className={`ft-row cursor-pointer mb-1 ${
            !selectedFolder ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: '4px' }}
          onClick={() => handleFolderSelect(null)}
        >
          <FolderOpen size={14} className="ft-icon" />
          <span className="ft-label">All Documents</span>
        </div>
        <div className="ft-scroll">
          {rootFolders.map((folder) =>
          <FolderTreeItem
            key={folder.id}
            folder={folder}
            selectedFolder={selectedFolder}
            selectFolder={handleFolderSelect}
            getChildren={getChildren}
            onCreateSubfolder={(parentId) => {
              setNewFolderParentId(parentId);
              setShowCreateFolder(true);
            }}
            level={0}
          />
          )}
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[#427A43]/30 rounded-r-xl transition-colors"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <AutocompleteSearch
              value={search}
              onChange={setSearch}
              suggestions={searchSuggestions}
              placeholder="Search by title or reference..."
              className="bg-gray-100 rounded-lg px-3 py-2 flex-1 min-w-48"
            />

            {/* Filters */}
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#427A43]">

              <option value="all">All Departments</option>
              {departments.map((d) =>
              <option key={d} value={d}>
                  {d}
                </option>
              )}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#427A43]">

              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#427A43]">

              <option value="all">All Types</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="xlsx">XLSX</option>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option value="mp4">MP4</option>
              <option value="mov">MOV</option>
              <option value="avi">AVI</option>
              <option value="mkv">MKV</option>
            </select>

            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-[#005F02] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>

                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-[#005F02] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>

                <Grid size={16} />
              </button>
            </div>

            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors">

              <Upload size={16} />
              Upload
            </button>
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-gray-500 px-1">
          Showing{' '}
          <span className="font-medium text-gray-700">{filtered.length}</span>{' '}
          documents
        </p>

        {/* Document List */}
        {viewMode === 'list' ?
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Document
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Department
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    Version
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ?
              <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">
                      <FileText size={40} className="mx-auto mb-3 opacity-30" />
                      <p>No documents found</p>
                    </td>
                  </tr> :

              filtered.map((doc) =>
              <tr
                key={doc.id}
                className="hover:bg-gray-50 transition-colors">

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>

                            {doc.fileType}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 truncate max-w-48">
                              {doc.title}
                            </p>
                            <p className="text-xs text-gray-400">
                              {doc.reference}
                            </p>
                          </div>
                          {doc.isEncrypted &&
                    <Lock
                      size={12}
                      className="text-yellow-500 flex-shrink-0" />

                    }
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                        {doc.department}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                        {doc.date}
                      </td>
                      <td className="px-4 py-3">
                        <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(doc.status)}`}>

                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                        v{doc.version}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                      onClick={() => handleView(doc)}
                      className="p-1.5 text-gray-400 hover:text-[#005F02] hover:bg-green-50 rounded transition-colors"
                      title="View">

                            <Eye size={15} />
                          </button>
                          <button
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Download">

                            <Download size={15} />
                          </button>
                          {user?.role === 'admin' && (
                            <>
                              <button
                                onClick={() => handleArchive(doc)}
                                className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                title="Archive">
                                <Archive size={15} />
                              </button>
                              <button
                                onClick={() => handleTrash(doc)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Move to Trash">
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                          {user?.role !== 'admin' && (
                            <button
                              onClick={() => setActionDoc(doc.id)}
                              className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                              title="Request Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
              )
              }
              </tbody>
            </table>
          </div> :

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((doc) =>
          <div
            key={doc.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">

                <div className="flex items-center justify-between mb-3">
                  <span
                className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${fileTypeColors[doc.fileType] || 'bg-gray-100 text-gray-600'}`}>

                    {doc.fileType}
                  </span>
                  <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(doc.status)}`}>

                    {doc.status}
                  </span>
                </div>
                <h4 className="font-medium text-gray-800 text-sm mb-1 line-clamp-2">
                  {doc.title}
                </h4>
                <p className="text-xs text-gray-500 mb-1">{doc.department}</p>
                <p className="text-xs text-gray-400">
                  {doc.date} · v{doc.version}
                </p>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                  <button
                onClick={() => handleView(doc)}
                className="flex-1 py-1.5 text-xs text-[#005F02] hover:bg-green-50 rounded transition-colors">

                    View
                  </button>
                  <button
                onClick={() => handleDownload(doc)}
                className="flex-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors">

                    Download
                  </button>
                  {(user?.role === 'admin' ||
              doc.uploadedById === user?.id) &&
              <button
                onClick={() => handleTrash(doc)}
                className="flex-1 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded transition-colors">

                      Delete
                    </button>
              }
                </div>
              </div>
          )}
          </div>
        }
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} defaultFolderId={selectedFolder || undefined} />}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-lg">Create New Folder</h3>
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#427A43] text-gray-800"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Parent Folder (optional)</label>
                <select
                  value={newFolderParentId || ''}
                  onChange={(e) => setNewFolderParentId(e.target.value || null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#427A43] text-gray-800"
                >
                  <option value="">None (Root folder)</option>
                  {visibleFolders.map((f) => (
                    <option key={f.id} value={f.id}>{f.parentId ? `  └ ${f.name}` : f.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={() => {
                  if (!newFolderName.trim() || !user) return;
                  addFolder({
                    name: newFolderName.trim(),
                    parentId: newFolderParentId,
                    department: user.department,
                    createdBy: user.name,
                    createdById: user.id,
                    createdByRole: user.role,
                    visibility: 'private',
                    permissions: ['admin', 'manager']
                  });
                  setNewFolderName('');
                  setNewFolderParentId(null);
                  setShowCreateFolder(false);
                }}
                disabled={!newFolderName.trim()}
                className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Create Folder
              </button>
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setNewFolderParentId(null); }}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document View Modal */}
      {viewingDoc &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 text-lg">
                    {viewingDoc.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {viewingDoc.reference}
                  </p>
                </div>
                <button
                onClick={() => setViewingDoc(null)}
                className="p-1 text-gray-400 hover:text-gray-600">

                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {viewingDoc && (
                <div className="mb-3">
                  <FilePreview doc={viewingDoc} />
                </div>
              )}
              {[
            ['Department', viewingDoc.department],
            ['Uploaded By', viewingDoc.uploadedBy],
            ['Date', viewingDoc.date],
            ['File Type', viewingDoc.fileType.toUpperCase()],
            ['File Size', viewingDoc.size],
            ['Version', `v${viewingDoc.version}`],
            ['Status', viewingDoc.status],
            ['Needs Approval', viewingDoc.needsApproval ? 'Yes' : 'No'],
            ['Approved By', viewingDoc.approvedBy || 'N/A'],
            ['Encrypted', viewingDoc.isEncrypted ? 'Yes' : 'No'],
            ['Description', viewingDoc.description || 'N/A']].
            map(([label, value]) =>
            <div
              key={label}
              className="flex justify-between text-sm border-b border-gray-50 pb-2">

                  <span className="text-gray-500">{label}</span>
                  <span className="text-gray-800 font-medium text-right max-w-48">
                    {value}
                  </span>
                </div>
            )}
              {viewingDoc.tags && viewingDoc.tags.length > 0 &&
            <div>
                  <p className="text-sm text-gray-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {viewingDoc.tags.map((tag) =>
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-[#F2E3BB] text-[#005F02] text-xs rounded-full">

                        {tag}
                      </span>
                )}
                  </div>
                </div>
            }
              {viewingDoc.rejectionReason &&
            <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs font-medium text-red-700">
                    Rejection Reason:
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    {viewingDoc.rejectionReason}
                  </p>
                </div>
            }
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
              onClick={() => {
                handleDownload(viewingDoc);
                setViewingDoc(null);
              }}
              className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors">

                Download
              </button>
              <button
              onClick={() => setViewingDoc(null)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                Close
              </button>
            </div>
          </div>
        </div>
      }

      {/* Move to Trash Confirmation (Admins only) */}
      {user?.role === 'admin' && trashTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setTrashTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-50 rounded-xl flex-shrink-0">
                  <Trash2 size={22} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 text-base">Move to Trash</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Move <span className="font-medium text-gray-700">"{trashTarget.title}"</span> to trash?<br />
                    You can restore it from the Trash page.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setTrashTarget(null)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmTrash(trashTarget)}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Delete Modal for staff */}
      {user?.role !== 'admin' && actionDoc && (
        <RequestDeleteModal
          document={filtered.find((d) => d.id === actionDoc)}
          onClose={() => setActionDoc(null)}
          onRequested={() => setActionDoc(null)}
        />
      )}
    </div>);

}