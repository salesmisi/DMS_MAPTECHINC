import React, {
  useState,
  createContext,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';

const API_URL = 'http://localhost:5000/api';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  documentId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  createNotification: (data: {
    userId: string;
    type?: string;
    title: string;
    message: string;
    documentId?: string;
  }) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>(
  {} as NotificationContextType
);

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const { refreshCurrentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const headers = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [token]);

  // Fetch all notifications
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/notifications`, {
        headers: headers(),
      });
      if (res.ok) {
        const data: Notification[] = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.isRead).length);
        // If there's a new assignment notification, trigger folders refresh
        const hasAssignment = data.some((n) => !n.isRead && (n.type === 'assignment' || /assigned to department/i.test(n.title)));
        if (hasAssignment) {
          // Refresh the current user's profile (in case department changed), then refresh folders
          try {
            await refreshCurrentUser?.();
          } catch (e) {
            // ignore
          }
          window.dispatchEvent(new Event('dms-folders-refresh'));
        }
      }
    } catch (err) {
      console.error('fetchNotifications error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, headers]);

  // Mark a single notification as read — immediate UI update
  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const res = await fetch(`${API_URL}/notifications/${id}/read`, {
          method: 'PUT',
          headers: headers(),
        });
        if (!res.ok) {
          // Rollback on failure
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: false } : n))
          );
          setUnreadCount((prev) => prev + 1);
        }
      } catch (err) {
        console.error('markAsRead error:', err);
        // Rollback
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: false } : n))
        );
        setUnreadCount((prev) => prev + 1);
      }
    },
    [headers]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const previousNotifications = [...notifications];
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      const res = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: headers(),
      });
      if (!res.ok) {
        setNotifications(previousNotifications);
        setUnreadCount(previousCount);
      }
    } catch (err) {
      console.error('markAllAsRead error:', err);
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
    }
  }, [headers, notifications, unreadCount]);

  // Create a notification
  const createNotification = useCallback(
    async (data: {
      userId: string;
      type?: string;
      title: string;
      message: string;
      documentId?: string;
    }) => {
      try {
        const res = await fetch(`${API_URL}/notifications`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(data),
        });
        if (res.ok) {
          // Re-fetch to stay in sync
          await fetchNotifications();
        }
      } catch (err) {
        console.error('createNotification error:', err);
      }
    },
    [headers, fetchNotifications]
  );

  // Auto-fetch when user logs in
  useEffect(() => {
    if (token && user) {
      fetchNotifications();
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [token, user, fetchNotifications]);

  // Poll every 30 seconds for new notifications
  useEffect(() => {
    if (!token || !user) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [token, user, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        createNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
