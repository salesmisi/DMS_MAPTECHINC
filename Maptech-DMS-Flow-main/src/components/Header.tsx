import React, { useState } from 'react';
import {
  Menu,
  Bell,
  Search,
  ChevronDown,
  User,
  Settings,
  LogOut,
  FileText,
  CheckCheck } from
'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation, PageName } from '../App';
import { useDocuments } from '../context/DocumentContext';
import { useNotifications } from '../context/NotificationContext';
import { hasApprovalAccess } from '../utils/roles';
interface HeaderProps {
  onMenuToggle: () => void;
  currentPage: PageName;
}
const pageTitles: Record<PageName, string> = {
  dashboard: 'Dashboard',
  documents: 'Document Management',
  scanner: 'Scanner Dashboard',
  users: 'User Management',
  folders: 'Folder Management',
  departments: 'Department Management',
  archive: 'Archives',
  trash: 'Trash',
  'activity-log': 'Activity Log',
  approvals: 'Pending Approvals',
  profile: 'My Profile',
  settings: 'Settings'
};
export function Header({ onMenuToggle, currentPage }: HeaderProps) {
  const { user, logout } = useAuth();
  const { navigate } = useNavigation();
  const { documents } = useDocuments();
  const { notifications: dbNotifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isApprover = hasApprovalAccess(user);

  // Use backend unread count for the badge
  const pendingCount = unreadCount;

  // Use backend notifications for the dropdown; fall back to documents if none in DB yet
  const notifications = dbNotifications.length > 0
    ? dbNotifications.filter((n) => !n.isRead).slice(0, 5).map((n) => ({
        id: n.id,
        message: n.title,
        time: new Date(n.createdAt).toLocaleDateString(),
        type: n.type,
        documentId: n.documentId,
      }))
    : isApprover
    ? documents
        .filter((d) => d.status === 'pending')
        .slice(0, 5)
        .map((d) => ({
          id: d.id,
          message: `"${d.title}" needs approval`,
          time: d.date,
          type: 'approval',
          documentId: d.id,
        }))
    : [];
  const roleColors: Record<string, string> = {
    admin: '#C0B87A',
    manager: '#427A43',
    staff: '#F2E3BB'
  };
  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    manager: 'Department Manager',
    staff: 'Staff'
  };
  return (
    <header className="bg-white border-b-2 border-[#427A43] px-4 py-3 flex items-center gap-4 z-10 flex-shrink-0">
      {/* Menu Toggle */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">

        <Menu size={20} />
      </button>

      {/* Page Title */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-[#005F02]">
          {pageTitles[currentPage] || 'Dashboard'}
        </h1>
        <p className="text-xs text-gray-500">
          Maptech Information Solution Inc. — Document Management System
        </p>
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-64">
        <Search size={16} className="text-gray-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery.trim()) {
              navigate('documents');
            }
          }}
          className="bg-transparent text-sm outline-none flex-1 text-gray-700 placeholder-gray-400" />

      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => {
            setShowNotifications(!showNotifications);
            setShowUserMenu(false);
          }}
          className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">

          <Bell size={20} />
          {isApprover && pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>

        {showNotifications && (
          isApprover ? (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Notifications</h3>
                <p className="text-xs text-gray-500">{pendingCount} pending approvals</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">No new notifications</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={async () => {
                        // Mark this notification as read in DB — badge decreases immediately
                        await markAsRead(n.id);
                        navigate('approvals');
                        setShowNotifications(false);
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileText size={14} className="text-yellow-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{n.message}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{n.time}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => {
                      navigate('approvals');
                      setShowNotifications(false);
                    }}
                    className="text-sm text-[#005F02] hover:underline font-medium">
                    View all approvals →
                  </button>
                  <button
                    onClick={async () => {
                      await markAllAsRead();
                    }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#005F02] transition-colors"
                    title="Mark all as read">
                    <CheckCheck size={14} />
                    Mark all read
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
              <div className="px-4 py-6 text-center text-gray-500 text-sm">No approvals available</div>
            </div>
          )
        )}
      </div>

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => {
            setShowUserMenu(!showUserMenu);
            setShowNotifications(false);
          }}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors">

          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
            style={{
              backgroundColor: roleColors[user?.role || 'staff'],
              color: '#005F02'
            }}>

            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-sm font-medium text-gray-800 leading-tight">
              {user?.name}
            </p>
            <p className="text-xs text-gray-500">
              {roleLabels[user?.role || 'staff']}
            </p>
          </div>
          <ChevronDown size={16} className="text-gray-400 hidden md:block" />
        </button>

        {showUserMenu &&
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
              <span
              className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor:
                user?.role === 'admin' ?
                '#FEF3C7' :
                user?.role === 'manager' ?
                '#D1FAE5' :
                '#EFF6FF',
                color:
                user?.role === 'admin' ?
                '#92400E' :
                user?.role === 'manager' ?
                '#065F46' :
                '#1E40AF'
              }}>

                {roleLabels[user?.role || 'staff']}
              </span>
            </div>
            <div className="py-1">
              <button
              onClick={() => {
                navigate('profile');
                setShowUserMenu(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">

                <User size={16} className="text-gray-400" />
                My Profile
              </button>
              <button
              onClick={() => {
                navigate('settings');
                setShowUserMenu(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">

                <Settings size={16} className="text-gray-400" />
                Settings
              </button>
            </div>
            <div className="border-t border-gray-100 py-1">
              <button
              onClick={() => {
                setShowUserMenu(false);
                logout();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">

                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        }
      </div>

      {/* Click outside to close menus */}
      {(showUserMenu || showNotifications) &&
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          setShowUserMenu(false);
          setShowNotifications(false);
        }} />

      }
    </header>);

}