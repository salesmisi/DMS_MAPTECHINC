import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  Key,
  Building2,
  Search,
  Shield,
  ChevronDown } from
'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';

interface Department {
  id: string;
  name: string;
  manager: string;
  description: string;
  staffCount: number;
  documentCount: number;
}

export function UserManagement() {
  const { users, addUser, updateUser, deleteUser } = useAuth();
  const { addLog } = useDocuments();
  const [search, setSearch] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'departments'>('users');
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'manager' | 'staff',
    department: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [newDept, setNewDept] = useState({
    name: ''
  });
  // Fix: Only one showPassword state for the password field
  const [showPassword, setShowPassword] = useState(false);

  // Fetch departments from API on mount
  const fetchDepartments = async () => {
    try {
      setLoadingDepts(true);
      const token = localStorage.getItem('dms_token');
      const res = await fetch('http://localhost:5000/api/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      }
    } catch (err) {
      console.error('Failed to fetch departments:', err);
    } finally {
      setLoadingDepts(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  // Create department via API
  const handleCreateDepartment = async () => {
    if (!newDept.name) {
      alert('Department name is required.');
      return;
    }
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch('http://localhost:5000/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
            body: JSON.stringify({ name: newDept.name })
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments((prev) => [...prev, data.department]);
            setNewDept({ name: '' });
        setShowAddDept(false);
        // Refresh folders so the newly-created department folder is available
        window.dispatchEvent(new Event('dms-folders-refresh'));
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create department');
      }
    } catch (err) {
      console.error('Failed to create department:', err);
      alert('Failed to create department');
    }
  };

  // Delete department via API
  const handleDeleteDepartment = async (id: string, name: string) => {
    if (!window.confirm(`Delete department "${name}"?`)) return;
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/departments/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDepartments((prev) => prev.filter((d) => d.id !== id));
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to delete department');
      }
    } catch (err) {
      console.error('Failed to delete department:', err);
      alert('Failed to delete department');
    }
  };

  const filteredUsers = users.filter(
    (u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.department.toLowerCase().includes(search.toLowerCase())
  );
  const [addUserError, setAddUserError] = useState('');
  const handleAddUser = async () => {
    setAddUserError('');
    if (!newUser.name || !newUser.email || !newUser.password || !newUser.department) {
      setAddUserError('Please fill in all required fields including department.');
      return;
    }
    const result = await addUser(newUser);
    if (result && result.error) {
      setAddUserError(result.error);
      return;
    }
    addLog({
      userId: 'user-1',
      userName: 'Admin User',
      userRole: 'admin',
      action: 'USER_CREATED',
      target: newUser.name,
      targetType: 'user',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `New ${newUser.role} account created for ${newUser.department}`
    });
    setNewUser({
      name: '',
      email: '',
      password: '',
      role: 'staff',
      department: '',
      status: 'active'
    });
    setShowAddUser(false);
  };
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await updateUser(id, {
      status: newStatus as 'active' | 'inactive'
    });
  };
  const handleDeleteUser = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete user "${name}"?`)) {
      await deleteUser(id);
      addLog({
        userId: 'user-1',
        userName: 'Admin User',
        userRole: 'admin',
        action: 'USER_DELETED',
        target: name,
        targetType: 'user',
        timestamp: new Date().toISOString(),
        ipAddress: '192.168.1.100'
      });
    }
  };
  const roleColors: Record<string, string> = {
    admin: 'bg-yellow-100 text-yellow-800',
    manager: 'bg-blue-100 text-blue-800',
    staff: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Users size={28} />
            User Management
          </h2>
          <p className="text-[#C0B87A] text-sm">
            Manage system users and departments
          </p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C0B87A] text-[#005F02] font-semibold text-sm rounded-xl hover:bg-[#F2E3BB] transition-colors">

          <Plus size={18} />
          Add User
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>

          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('departments')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'departments' ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>

          Departments ({departments.length})
        </button>
      </div>

      {activeTab === 'users' &&
      <>
          {/* Search */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 max-w-md">
            <Search size={16} className="text-gray-400" />
            <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none flex-1 text-gray-700" />

          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                    Department
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                    Created
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map((u) =>
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        backgroundColor:
                        u.role === 'admin' ?
                        '#FEF3C7' :
                        u.role === 'manager' ?
                        '#D1FAE5' :
                        '#EFF6FF',
                        color: '#005F02'
                      }}>

                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${roleColors[u.role]}`}>

                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      {u.department}
                    </td>
                    <td className="px-4 py-3">
                      <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>

                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                      {u.createdAt}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      className={`p-1.5 rounded transition-colors ${u.status === 'active' ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                      title={
                      u.status === 'active' ? 'Deactivate' : 'Activate'
                      }>

                          {u.status === 'active' ?
                      <UserX size={15} /> :

                      <UserCheck size={15} />
                      }
                        </button>
                        <button
                      onClick={() =>
                      alert(`Password reset link sent to ${u.email}`)
                      }
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Reset Password">

                          <Key size={15} />
                        </button>
                        {u.id !== 'user-1' &&
                    <button
                      onClick={() => handleDeleteUser(u.id, u.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete User">

                            <Trash2 size={15} />
                          </button>
                    }
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </>
      }

      {activeTab === 'departments' &&
      <div className="space-y-4">
          <button
          onClick={() => setShowAddDept(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-xl hover:bg-[#427A43] transition-colors">

            <Plus size={16} />
            Add Department
          </button>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) =>
          <div
            key={dept.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">

                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-[#F0FDF4] rounded-lg">
                    <Building2 size={20} className="text-[#005F02]" />
                  </div>
                  <button
                onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors">

                    <Trash2 size={14} />
                  </button>
                </div>
                <h4 className="font-semibold text-gray-800 mb-1">
                  {dept.name}
                </h4>
                <p className="text-xs text-gray-500 mb-3">{dept.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Manager:{' '}
                    <span className="font-medium text-gray-700">
                      {dept.manager}
                    </span>
                  </span>
                  <span>
                    {dept.staffCount} staff · {dept.documentCount} docs
                  </span>
                </div>
              </div>
          )}
          </div>
        </div>
      }

      {/* Add User Modal */}
      {showAddUser &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
          {/* Custom Error Modal */}
          {addUserError && (
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-white border border-red-300 rounded-xl shadow-2xl px-8 py-6 flex flex-col items-center justify-center">
                <span className="text-red-600 font-semibold text-lg mb-2">Error</span>
                <span className="text-gray-800 text-center mb-4">{addUserError}</span>
                <button
                  className="mt-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  onClick={() => setAddUserError('')}
                >
                  OK
                </button>
              </div>
            </div>
          )}
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                Add New User
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Create a new system account
              </p>
            </div>
            <div className="p-6 space-y-4">
              {[
            {
              label: 'Full Name *',
              key: 'name',
              type: 'text',
              placeholder: 'John Doe'
            },
            {
              label: 'Email Address *',
              key: 'email',
              type: 'email',
              placeholder: 'john@maptech.com'
            },
            {
              label: 'Password *',
              key: 'password',
              type: 'password',
              placeholder: 'Min. 6 characters'
            }].
            map((field) => {
              if (field.key === 'password') {
                return (
                  <div key={field.key} className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {field.label}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={(newUser as any)[field.key]}
                      onChange={(e) =>
                        setNewUser((prev) => ({
                          ...prev,
                          [field.key]: e.target.value
                        }))
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] pr-10" />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700 flex items-center justify-center h-6 w-6 p-0"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      style={{ top: '70%', padding: 0, margin: 0, lineHeight: 0 }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={15} />}
                    </button>
                  </div>
                );
              }
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={(newUser as any)[field.key]}
                    onChange={(e) =>
                      setNewUser((prev) => ({
                        ...prev,
                        [field.key]: e.target.value
                      }))
                    }
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]" />
                </div>
              );
            })}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Role
                  </label>
                  <select
                  value={newUser.role}
                  onChange={(e) =>
                  setNewUser((prev) => ({
                    ...prev,
                    role: e.target.value as any
                  }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]">

                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Department
                  </label>
                  <select
                  value={newUser.department}
                  onChange={(e) =>
                  setNewUser((prev) => ({
                    ...prev,
                    department: e.target.value
                  }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]">
                    <option value="">Select department...</option>
                    {departments.map((dept) =>
                  <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                  )}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
              onClick={handleAddUser}
              className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors">

                Create User
              </button>
              <button
              onClick={() => setShowAddUser(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                Cancel
              </button>
            </div>
          </div>
        </div>
      }

      {/* Add Department Modal */}
      {showAddDept &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                Add New Department
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Department Name *
                </label>
                <input
                type="text"
                value={newDept.name}
                onChange={(e) =>
                setNewDept((prev) => ({
                  ...prev,
                  name: e.target.value
                }))
                }
                placeholder="e.g. Operations"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]" />

              </div>
              {/* Description removed: only department name is required */}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
              onClick={handleCreateDepartment}
              className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors">

                Create Department
              </button>
              <button
              onClick={() => setShowAddDept(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                Cancel
              </button>
            </div>
          </div>
        </div>
      }
    </div>);

}