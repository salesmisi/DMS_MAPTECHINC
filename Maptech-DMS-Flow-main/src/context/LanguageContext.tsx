import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

type LangCode = 'en' | 'tl';

const LANG_KEY = 'dms_language';

const resources: Record<LangCode, any> = {
  en: {
    settings: 'Settings',
    settingsDescription: 'Manage your application preferences and configuration',
    regional: 'Regional',
    language: 'Language',
    timezone: 'Timezone',
    appearance: 'Appearance',
    notifications: 'Notifications',
    notificationsDescription: 'Choose how you want to be notified',
    emailNotificationsTitle: 'Email Notifications',
    emailNotificationsDesc: 'Receive daily summaries and important alerts',
    browserNotificationsTitle: 'Browser Notifications',
    browserNotificationsDesc: 'Show popup notifications when online',
    approvalRequestsTitle: 'Approval Requests',
    approvalRequestsDesc: 'Notify me when documents need approval',
    appearanceDescription: 'Customize how the application looks',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    system: 'System',
    securityDesc: 'Change your password',
    activeSessions: 'Active Sessions',
    manageActiveSessions: 'Manage your active sessions',
    revoke: 'Revoke',
    current: 'Current',
    savePreferences: 'Save Preferences',
    cancel: 'Cancel',
    updatePassword: 'Update Password',
    profileDetails: 'Profile Details',
    security: 'Security',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    passwordChangedMsg: 'Password changed — you will be logged out',
    pageTitles: {
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
    }
  },
  tl: {
    settings: 'Mga Setting',
    settingsDescription: 'Pamahalaan ang iyong mga kagustuhan at pagsasaayos ng aplikasyon',
    regional: 'Rehiyon',
    language: 'Wika',
    timezone: 'Time Zone',
    appearance: 'Hitsura',
    notifications: 'Mga Abiso',
    notificationsDescription: 'Piliin kung paano ka nais abisuhan',
    emailNotificationsTitle: 'Mga Email na Abiso',
    emailNotificationsDesc: 'Tanggapin ang pang-araw-araw na buod at mahahalagang abiso',
    browserNotificationsTitle: 'Browser na Abiso',
    browserNotificationsDesc: 'Ipakita ang popup na abiso kapag online',
    approvalRequestsTitle: 'Mga Request para sa Pag-apruba',
    approvalRequestsDesc: 'Abisuhan ako kapag ang mga dokumento ay nangangailangan ng pag-apruba',
    appearanceDescription: 'I-customize kung paano lumilitaw ang aplikasyon',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    system: 'System',
    securityDesc: 'Palitan ang iyong password',
    activeSessions: 'Aktibong Sesyon',
    manageActiveSessions: 'Pamahalaan ang iyong mga aktibong sesyon',
    revoke: 'I-revoke',
    current: 'Kasalukuyan',
    savePreferences: 'I-save ang Mga Setting',
    cancel: 'Kanselahin',
    updatePassword: 'I-update ang Password',
    profileDetails: 'Mga Detalye ng Profile',
    security: 'Seguridad',
    currentPassword: 'Kasalukuyang Password',
    newPassword: 'Bagong Password',
    confirmNewPassword: 'Kumpirmahin ang Bagong Password',
    passwordChangedMsg: 'Nabago ang password — magla-logout ang system',
    pageTitles: {
      dashboard: 'Dashboard',
      documents: 'Pamamahala ng Dokumento',
      scanner: 'Scanner Dashboard',
      users: 'Pamamahala ng User',
      folders: 'Pamamahala ng Folder',
      departments: 'Pamamahala ng Departamento',
      archive: 'Archive',
      trash: 'Trash',
      'activity-log': 'Activity Log',
      approvals: 'Mga Pending na Pag-apruba',
      profile: 'Aking Profile',
      settings: 'Mga Setting'
    }
  }
};

interface LanguageContextType {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function getFromPath(obj: any, path: string) {
  return path.split('.').reduce((acc: any, p: string) => (acc ? acc[p] : undefined), obj);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    const stored = localStorage.getItem(LANG_KEY) || 'English (US)';
    if (stored === 'Tagalog') return 'tl';
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang === 'tl' ? 'Tagalog' : 'English (US)');
  }, [lang]);

  const setLang = (l: LangCode) => setLangState(l);

  const t = (key: string) => {
    const v = getFromPath(resources[lang], key);
    if (v === undefined) return key;
    return String(v);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
