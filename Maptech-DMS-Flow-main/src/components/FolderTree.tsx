import React, { useState } from 'react';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  Trash2,
  Lock,
} from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { DeleteFolderModal } from './DeleteFolderModal';
import { Folder } from '../context/DocumentContext';

const INDENT = 10;
const MAX_LVL = 6;

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  showCreateButton?: boolean;
  onCreateFolder?: (parentId: string | null) => void;
}

interface FolderNodeProps {
  folder: Folder;
  level: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  folders: Folder[];
}

function FolderNode({
  folder,
  level,
  selectedFolderId,
  onSelectFolder,
  folders,
}: FolderNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { deleteFolder } = useDocuments();
  const { user } = useAuth();
  const children = folders.filter((f) => f.parentId === folder.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const isDepartment = (folder as any).is_department || (folder as any).isDepartment || false;
  let canDelete = user?.role === 'admin' || folder.createdById === user?.id;
  if (isDepartment && user?.role !== 'admin') canDelete = false;
  const depth = Math.min(level, MAX_LVL);

  return (
    <div className="ft-node">
      <div
        className={`ft-row group ${
          isSelected ? 'bg-maptech-primary text-white' : 'text-maptech-dark hover:bg-maptech-cream'
        }`}
        style={{ paddingLeft: `${4 + depth * INDENT}px` }}
        onClick={() => onSelectFolder(folder.id)}
      >
        {/* Guide lines */}
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="ft-guide" style={{ left: `${4 + (i + 1) * INDENT - 5}px` }} />
        ))}

        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="ft-chevron"
          >
            {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </button>
        ) : (
          <span className="ft-spacer" />
        )}

        {isExpanded && hasChildren ? (
          <FolderOpenIcon size={15} className={`ft-icon ${isSelected ? 'text-white' : 'text-maptech-accent'}`} />
        ) : (
          <FolderIcon size={15} className={`ft-icon ${isSelected ? 'text-white' : 'text-maptech-accent'}`} />
        )}

        <span className="ft-label" title={folder.name}>{folder.name}</span>
        {isDepartment && (
          <span className="ml-2 text-xs text-gray-400 flex items-center" title="Department Folder — protected">
            <Lock size={12} />
          </span>
        )}

        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); }}
            className={`ft-action ${
              isSelected ? 'text-white/70 hover:text-white hover:bg-white/20' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Delete folder"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {showDeleteModal && (
        <DeleteFolderModal
          folderName={folder.name}
          hasChildren={hasChildren}
          childCount={children.length}
          onConfirm={() => {
            (async () => {
              if (isSelected) onSelectFolder(null);
              const res = await deleteFolder(folder.id);
              if (res && res.status === 202) {
                alert(res.message || 'Delete approval requested');
              } else if (res && !res.ok) {
                alert(res.error || 'Failed to delete folder');
              }
              setShowDeleteModal(false);
            })();
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {isExpanded && hasChildren && (
        <div className="ft-children">
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              folders={folders}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  selectedFolderId,
  onSelectFolder,
  showCreateButton,
  onCreateFolder,
}: FolderTreeProps) {
  const { folders } = useDocuments();
  const { user } = useAuth();

  const visibleFolders = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return folders;
    return folders.filter((folder) => {
      const vis = (folder as any).visibility || 'private';
      // admin-only folders hidden from non-admins
      if (vis === 'admin-only') return false;
      // department-scoped folders visible to users of the same department
      if (vis === 'department') return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
      // private folders only visible to their creator
      if (vis === 'private') return folder.createdById === user.id;
      return false;
    });
  }, [folders, user]);

  const rootFolders = visibleFolders.filter((f) => f.parentId === null);

  return (
    <div className="ft-container bg-white rounded-lg shadow-sm border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-maptech-dark text-sm">Folders</h3>
        {showCreateButton && onCreateFolder && (
          <button
            onClick={() => onCreateFolder(null)}
            className="p-1 text-maptech-primary hover:bg-maptech-cream rounded-lg transition-colors"
            title="Create new folder"
          >
            <PlusIcon size={16} />
          </button>
        )}
      </div>

      {/* All Documents */}
      <div
        className={`ft-row cursor-pointer mb-1 ${
          selectedFolderId === null ? 'bg-maptech-primary text-white' : 'text-maptech-dark hover:bg-maptech-cream'
        }`}
        style={{ paddingLeft: '4px' }}
        onClick={() => onSelectFolder(null)}
      >
        <FolderIcon size={15} className={`ft-icon ${selectedFolderId === null ? 'text-white' : 'text-maptech-accent'}`} />
        <span className="ft-label">All Documents</span>
      </div>

      {/* Scrollable tree */}
      <div className="ft-scroll">
        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            level={0}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            folders={visibleFolders}
          />
        ))}
      </div>
    </div>);

}