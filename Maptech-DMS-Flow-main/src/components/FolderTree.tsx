import React, { useState, Children } from 'react';
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  Trash2 } from
'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { DeleteFolderModal } from './DeleteFolderModal';
import { Folder } from '../data/mockData';
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
  folders
}: FolderNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { deleteFolder } = useDocuments();
  const { user } = useAuth();
  const children = folders.filter((f) => f.parentId === folder.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedFolderId === folder.id;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteModal(true);
  };

  const canDelete = user?.role === 'admin' || folder.createdById === user?.id;

  return (
    <div>
      <div
        className={`group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
          isSelected ? 'bg-maptech-primary text-white' : 'text-maptech-dark hover:bg-maptech-cream'
        }`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => onSelectFolder(folder.id)}>

        {hasChildren &&
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-0.5 hover:bg-black/10 rounded flex-shrink-0">
            {isExpanded ?
          <ChevronDownIcon size={16} /> :
          <ChevronRightIcon size={16} />
          }
          </button>
        }
        {!hasChildren && <span className="w-5 flex-shrink-0" />}
        {isExpanded && hasChildren ?
        <FolderOpenIcon
          size={18}
          className={isSelected ? 'text-white' : 'text-maptech-accent'} /> :
        <FolderIcon
          size={18}
          className={isSelected ? 'text-white' : 'text-maptech-accent'} />
        }
        <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
        {canDelete &&
          <button
            onClick={handleDelete}
            className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0 ${
              isSelected ? 'text-white/70 hover:text-white hover:bg-white/20' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Delete folder">
            <Trash2 size={13} />
          </button>
        }
      </div>      {showDeleteModal && (
        <DeleteFolderModal
          folderName={folder.name}
          hasChildren={hasChildren}
          childCount={children.length}
          onConfirm={() => {
            if (isSelected) onSelectFolder(null);
            deleteFolder(folder.id);
            setShowDeleteModal(false);
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}      {isExpanded && hasChildren &&
      <div>
          {children.map((child) =>
        <FolderNode
          key={child.id}
          folder={child}
          level={level + 1}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          folders={folders} />
        )}
        </div>
      }
    </div>);

}
export function FolderTree({
  selectedFolderId,
  onSelectFolder,
  showCreateButton,
  onCreateFolder
}: FolderTreeProps) {
  const { folders } = useDocuments();
  const { user } = useAuth();
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
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-maptech-dark">Folders</h3>
        {showCreateButton && onCreateFolder &&
        <button
          onClick={() => onCreateFolder(null)}
          className="p-1.5 text-maptech-primary hover:bg-maptech-cream rounded-lg transition-colors"
          title="Create new folder">

            <PlusIcon size={18} />
          </button>
        }
      </div>

      {/* All Documents option */}
      <button
        onClick={() => onSelectFolder(null)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left mb-2 transition-all duration-200 ${selectedFolderId === null ? 'bg-maptech-primary text-white' : 'text-maptech-dark hover:bg-maptech-cream'}`}>

        <FolderIcon
          size={18}
          className={
          selectedFolderId === null ? 'text-white' : 'text-maptech-accent'
          } />

        <span className="text-sm font-medium">All Documents</span>
      </button>

      {/* Folder Tree */}
      <div className="space-y-1">
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