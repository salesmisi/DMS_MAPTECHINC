import React, { useState } from 'react';
import {
  BuildingIcon,
  PlusIcon,
  SearchIcon,
  EditIcon,
  Trash2Icon,
  UsersIcon,
  XIcon } from
'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';
export function DepartmentManagement() {
  const { users, user: currentUser } = useAuth();
  const { departments, createDepartment, deleteDepartment, addActivityLog } =
  useDocuments();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const filteredDepartments = departments.filter((dept) =>
  dept.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const getUserCount = (deptName: string) =>
  users.filter((u) => u.department === deptName).length;
  const handleCreateDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    createDepartment({
      name: newDeptName.trim()
    });
    if (currentUser) {
      addActivityLog({
        action: 'CREATE_DEPARTMENT',
        userId: currentUser.id,
        userName: currentUser.name,
        details: `Created department: ${newDeptName}`,
        ipAddress: '192.168.1.100'
      });
    }
    setNewDeptName('');
    setShowCreateModal(false);
  };
  const handleDeleteDepartment = (deptId: string, deptName: string) => {
    const userCount = getUserCount(deptName);
    if (userCount > 0) {
      alert(
        `Cannot delete "${deptName}" because it has ${userCount} user(s) assigned. Please reassign users first.`
      );
      return;
    }
    if (confirm(`Are you sure you want to delete "${deptName}"?`)) {
      deleteDepartment(deptId);
      if (currentUser) {
        addActivityLog({
          action: 'DELETE_DEPARTMENT',
          userId: currentUser.id,
          userName: currentUser.name,
          details: `Deleted department: ${deptName}`,
          ipAddress: '192.168.1.100'
        });
      }
    }
  };
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-maptech-dark">
            Department Management
          </h2>
          <p className="text-gray-500 mt-1">Manage company departments</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-maptech-primary text-white rounded-lg font-medium hover:bg-maptech-primary/90 transition-colors">

          <PlusIcon size={20} />
          Add Department
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="relative max-w-md">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18} />

          <input
            type="text"
            placeholder="Search departments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary text-sm" />

        </div>
      </div>

      {/* Departments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDepartments.map((dept) => {
          const userCount = getUserCount(dept.name);
          const manager = users.find((u) => u.id === dept.managerId);
          return (
            <div
              key={dept.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">

              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-maptech-cream rounded-xl flex items-center justify-center">
                  <BuildingIcon className="text-maptech-primary" size={24} />
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 text-gray-500 hover:text-maptech-primary hover:bg-maptech-cream rounded-lg transition-colors">
                    <EditIcon size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">

                    <Trash2Icon size={18} />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-maptech-dark mb-2">
                {dept.name}
              </h3>

              <div className="flex items-center gap-2 text-gray-600 mb-3">
                <UsersIcon size={16} />
                <span className="text-sm">
                  {userCount} member{userCount !== 1 ? 's' : ''}
                </span>
              </div>

              {manager &&
              <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">
                    Department Manager
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-maptech-accent rounded-full flex items-center justify-center">
                      <span className="text-maptech-dark font-bold text-xs">
                        {manager.name.
                      split(' ').
                      map((n) => n[0]).
                      join('')}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-maptech-dark">
                      {manager.name}
                    </span>
                  </div>
                </div>
              }
            </div>);

        })}
      </div>

      {filteredDepartments.length === 0 &&
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <BuildingIcon className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500">No departments found</p>
        </div>
      }

      {/* Create Department Modal */}
      {showCreateModal &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-maptech-dark">
                Create Department
              </h2>
              <button
              onClick={() => setShowCreateModal(false)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateDepartment} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-maptech-dark mb-1.5">
                  Department Name *
                </label>
                <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
                placeholder="Enter department name"
                required />

              </div>
              <div className="flex gap-3 pt-4">
                <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">

                  Cancel
                </button>
                <button
                type="submit"
                disabled={!newDeptName.trim()}
                className="flex-1 px-4 py-2.5 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">

                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>);

}