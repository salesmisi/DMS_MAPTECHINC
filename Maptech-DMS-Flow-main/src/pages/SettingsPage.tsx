import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Bell, Moon, Globe, Shield, Smartphone, Monitor } from 'lucide-react';
export function SettingsPage() {
  const [notifications, setNotifications] = useState({
    email: true,
    browser: true,
    approvals: true,
    comments: false
  });
  const [appearance, setAppearance] = useState({
    theme: 'light',
    density: 'comfortable'
  });
  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-gray-500">
          Manage your application preferences and configuration
        </p>
      </div>

      {/* Notifications Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Bell className="text-blue-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Notifications
            </h3>
            <p className="text-sm text-gray-500">
              Choose how you want to be notified
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Email Notifications</p>
              <p className="text-sm text-gray-500">
                Receive daily summaries and important alerts
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications.email}
                onChange={() => toggleNotification('email')} />

              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Browser Notifications</p>
              <p className="text-sm text-gray-500">
                Show popup notifications when online
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications.browser}
                onChange={() => toggleNotification('browser')} />

              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-gray-900">Approval Requests</p>
              <p className="text-sm text-gray-500">
                Notify me when documents need approval
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications.approvals}
                onChange={() => toggleNotification('approvals')} />

              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </Card>

      {/* Appearance Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Moon className="text-purple-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Appearance</h3>
            <p className="text-sm text-gray-500">
              Customize how the application looks
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() =>
            setAppearance({
              ...appearance,
              theme: 'light'
            })
            }
            className={`p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${appearance.theme === 'light' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>

            <div className="w-full h-24 bg-white border border-gray-200 rounded-lg shadow-sm"></div>
            <span className="font-medium text-gray-900">Light Mode</span>
          </button>

          <button
            onClick={() =>
            setAppearance({
              ...appearance,
              theme: 'dark'
            })
            }
            className={`p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${appearance.theme === 'dark' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>

            <div className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg shadow-sm"></div>
            <span className="font-medium text-gray-900">Dark Mode</span>
          </button>

          <button
            onClick={() =>
            setAppearance({
              ...appearance,
              theme: 'system'
            })
            }
            className={`p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${appearance.theme === 'system' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>

            <div className="w-full h-24 bg-gradient-to-r from-white to-gray-900 border border-gray-200 rounded-lg shadow-sm"></div>
            <span className="font-medium text-gray-900">System</span>
          </button>
        </div>
      </Card>

      {/* Regional Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-50 rounded-lg">
            <Globe className="text-green-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Regional</h3>
            <p className="text-sm text-gray-500">
              Language and timezone preferences
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Language
            </label>
            <select className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option>English (US)</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <select className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option>Pacific Time (US & Canada)</option>
              <option>Eastern Time (US & Canada)</option>
              <option>London (GMT)</option>
              <option>Tokyo (JST)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Sessions */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-50 rounded-lg">
            <Shield className="text-orange-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Active Sessions
            </h3>
            <p className="text-sm text-gray-500">Manage your active sessions</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <Monitor className="text-gray-400" size={24} />
              <div>
                <p className="font-medium text-gray-900">Windows PC - Chrome</p>
                <p className="text-xs text-gray-500">
                  San Francisco, CA • Active now
                </p>
              </div>
            </div>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              Current
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <Smartphone className="text-gray-400" size={24} />
              <div>
                <p className="font-medium text-gray-900">iPhone 13 - Safari</p>
                <p className="text-xs text-gray-500">
                  San Francisco, CA • 2 hours ago
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Revoke
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline">Cancel</Button>
        <Button>Save Preferences</Button>
      </div>
    </div>);

}