import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { User, Mail, Building, Shield, Camera, Save, Lock } from 'lucide-react';
export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    department: user?.department || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMessage('');
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    updateProfile({
      name: formData.name,
      email: formData.email
      // In a real app, we might update department here if allowed
    });
    setIsLoading(false);
    setSuccessMessage('Profile updated successfully');
    setTimeout(() => setSuccessMessage(''), 3000);
  };
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    // Password update logic would go here
    alert('Password update functionality would be implemented here');
  };
  if (!user) return null;
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Column - Avatar & Identity */}
        <div className="w-full md:w-1/3 space-y-6">
          <Card className="p-6 flex flex-col items-center text-center">
            <div className="relative mb-4 group">
              <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-4xl font-bold text-primary border-4 border-white shadow-lg">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <button className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-md border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors">
                <Camera size={18} />
              </button>
            </div>

            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            <p className="text-gray-500 mb-4">{user.email}</p>

            <div className="flex flex-wrap gap-2 justify-center mb-6">
              <Badge
                variant={
                user.role === 'admin' ?
                'danger' :
                user.role === 'manager' ?
                'warning' :
                'success'
                }>

                {user.role.toUpperCase()}
              </Badge>
              <Badge variant="default">{user.department}</Badge>
            </div>

            <div className="w-full border-t border-gray-100 pt-4 text-left text-sm text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Member since</span>
                <span className="font-medium">{user.createdAt}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Active
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Edit Profile */}
        <div className="w-full md:w-2/3 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <User size={20} className="text-gray-400" />
                Profile Details
              </h3>
            </div>

            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter your full name" />

                <Input
                  label="Email Address"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@company.com" />

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Department"
                  name="department"
                  value={formData.department}
                  disabled={user.role !== 'admin'}
                  readOnly={user.role !== 'admin'}
                  helperText={
                  user.role !== 'admin' ?
                  'Contact admin to change department' :
                  ''
                  } />

                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <div className="flex h-10 w-full items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                    <Shield size={16} className="mr-2" />
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Roles cannot be changed by user
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-6">
                {successMessage ?
                <span className="text-green-600 text-sm font-medium animate-fade-in">
                    {successMessage}
                  </span> :

                <span></span>
                }
                <Button
                  type="submit"
                  isLoading={isLoading}
                  leftIcon={<Save size={16} />}>

                  Save Changes
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Lock size={20} className="text-gray-400" />
                Security
              </h3>
            </div>

            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <Input
                label="Current Password"
                name="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={handleChange} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="New Password"
                  name="newPassword"
                  type="password"
                  value={formData.newPassword}
                  onChange={handleChange} />

                <Input
                  label="Confirm New Password"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange} />

              </div>
              <div className="flex justify-end pt-4">
                <Button variant="outline" type="submit">
                  Update Password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>);

}