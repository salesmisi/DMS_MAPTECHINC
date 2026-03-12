import React, { useState, createContext, useContext } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocumentProvider } from './context/DocumentContext';
import { NotificationProvider } from './context/NotificationContext';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { StaffDashboard } from './pages/StaffDashboard';
import { DocumentsPage } from './pages/DocumentsPage';
import { ScannerDashboard } from './pages/ScannerDashboard';
import { UserManagement } from './pages/UserManagement';
import { FolderManagement } from './pages/FolderManagement';
import { StaffFolderDashboard } from './pages/StaffFolderDashboard';
import { ArchivePage } from './pages/ArchivePage';
import { TrashPage } from './pages/TrashPage';
import { ActivityLog } from './pages/ActivityLog';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
export type PageName =
'dashboard' |
'documents' |
'scanner' |
'users' |
'folders' |
'departments' |
'archive' |
'trash' |
'activity-log' |
'approvals' |
'profile' |
'settings';
interface NavigationContextType {
  currentPage: PageName;
  navigate: (page: PageName) => void;
  selectedFolderId?: string | null;
  selectFolder?: (id: string | null) => void;
}
export const NavigationContext = createContext<NavigationContextType>({
  currentPage: 'dashboard',
  navigate: () => {throw new Error('navigate function must be used inside NavigationProvider');},
  selectedFolderId: null,
  selectFolder: () => {throw new Error('selectFolder must be used inside NavigationProvider');}
});
export function useNavigation() {
  return useContext(NavigationContext);
}
function AppContent() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageName>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const navigate = (page: PageName) => setCurrentPage(page);
  const selectFolder = (id: string | null) => setSelectedFolderId(id);
  if (!user) {
    return <LoginPage />;
  }
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        if (user.role === 'admin') return <AdminDashboard />;
        if (user.role === 'manager') return <ManagerDashboard />;
        return <StaffDashboard />;
      case 'approvals':
        return <ManagerDashboard />;
      case 'documents':
        return <DocumentsPage />;
      case 'scanner':
        return <ScannerDashboard />;
      case 'users':
        return user.role === 'admin' ? <UserManagement /> : <StaffDashboard />;
      case 'folders':
        return user.role === 'admin' ? <FolderManagement /> : <StaffFolderDashboard />;
      case 'archive':
        return <ArchivePage />;
      case 'trash':
        return <TrashPage />;
      case 'activity-log':
        return user.role === 'admin' ? <ActivityLog /> : <StaffDashboard />;
      case 'profile':
        return <ProfilePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        if (user.role === 'admin') return <AdminDashboard />;
        if (user.role === 'manager') return <ManagerDashboard />;
        return <StaffDashboard />;
    }
  };
  return (
    <NavigationContext.Provider
      value={{
        currentPage,
        navigate,
        selectedFolderId,
        selectFolder
      }}>

      <div
        className="flex h-screen overflow-hidden"
        style={{
          backgroundColor: '#EEEEEE'
        }}>

        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            currentPage={currentPage} />

          <main className="flex-1 overflow-y-auto p-6">{renderPage()}</main>
        </div>
      </div>
    </NavigationContext.Provider>);

}
export function App() {
  return (
    <AuthProvider>
      <DocumentProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </DocumentProvider>
    </AuthProvider>);

}