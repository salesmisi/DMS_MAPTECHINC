import React, { useState } from 'react';
import { XIcon, FolderPlusIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';
interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentFolderId?: string | null;
}
export function CreateFolderModal({
  isOpen,
  onClose,
  parentFolderId = null
}: CreateFolderModalProps) {
  const { user } = useAuth();
  const { folders, addFolder, addLog } = useDocuments();
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
  const defaultVisibility = user?.role === 'admin' ? 'admin-only' : user?.role === 'staff' ? 'private' : 'department';
  const [formData, setFormData] = useState({
    name: '',
    parentId: parentFolderId,
    visibility: defaultVisibility
  });
  if (!isOpen) return null;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    addFolder({
      name: formData.name,
      parentId: formData.parentId,
      department: user.department,
      createdBy: user.name,
      createdById: user.id,
      createdByRole: user.role as 'admin' | 'manager' | 'staff',
      visibility: formData.visibility,
      permissions: ['admin', 'manager', 'staff']
    });
    addLog({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'FOLDER_CREATED',
      target: formData.name,
      targetType: 'folder',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    onClose();
    setFormData({ name: '', parentId: null, visibility: defaultVisibility });
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-maptech-cream rounded-lg flex items-center justify-center">
              <FolderPlusIcon className="text-maptech-primary" size={24} />
            </div>
            <h2 className="text-xl font-bold text-maptech-dark">
              Create Folder
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

            <XIcon size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Folder Name */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Folder Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                name: e.target.value
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              placeholder="Enter folder name"
              required />

          </div>

          {/* Parent Folder */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Parent Folder
            </label>
            <select
              value={formData.parentId || ''}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                parentId: e.target.value || null
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary">

              <option value="">Root (No parent)</option>
              {visibleFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department (fixed to user's department) */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Department
            </label>
            <div className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700">
              {user?.department || 'Unassigned'}
            </div>
          </div>

          {/* Visibility: only editable by admin */}
          {user?.role === 'admin' && (
            <div>
              <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                Visibility
              </label>
              <select
                value={formData.visibility}
                onChange={(e) => setFormData((prev) => ({ ...prev, visibility: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary">
                <option value="admin-only">Admin Only</option>
                <option value="department">Department</option>
                <option value="private">Private</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">

              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.name || !formData.department}
              className="flex-1 px-4 py-2.5 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">

              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>);

}