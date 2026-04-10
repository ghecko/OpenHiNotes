import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuthStore } from '@/store/useAuthStore';
import { authApi } from '@/api/auth';
import { Save, Loader, Fingerprint, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { VoiceProfileManager } from '@/components/VoiceProfileManager';
import { settingsApi } from '@/api/settings';

function ChangePasswordCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Auto-collapse after a moment
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Security</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Password
          </label>

          {!isOpen ? (
            <button
              onClick={() => { resetForm(); setIsOpen(true); }}
              className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Change Password
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200/60 dark:border-green-800/40 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Password changed successfully!</span>
                </div>
              )}

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isLoading || success}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 transition-all placeholder:text-gray-400 text-sm"
                  placeholder="Current password"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading || success}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 transition-all placeholder:text-gray-400 text-sm"
                  placeholder="New password (min. 8 characters)"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading || success}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 transition-all placeholder:text-gray-400 text-sm"
                  placeholder="Confirm new password"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); resetForm(); }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium text-sm transition-colors hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || success}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader className="w-4 h-4 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const { user } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [voiceFingerprintingEnabled, setVoiceFingerprintingEnabled] = useState<boolean | null>(null);

  // Check if voice fingerprinting is enabled by admin (uses /features endpoint, no admin required)
  useEffect(() => {
    fetch('/api/settings/features', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((flags) => {
        setVoiceFingerprintingEnabled(flags.voice_fingerprinting_enabled === true);
      })
      .catch(() => {
        setVoiceFingerprintingEnabled(false);
      });
  }, []);

  const handleSaveProfile = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      // This would call an API endpoint to update the profile
      // For now, just show a success message
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update profile',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout title="Settings">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Account</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Contact support to change email
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role
              </label>
              <input
                type="text"
                value={user?.role || ''}
                disabled
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 capitalize"
              />
            </div>

            {message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              onClick={handleSaveProfile}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>

        <ChangePasswordCard />

        {/* Voice Fingerprinting */}
        {voiceFingerprintingEnabled && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Fingerprint className="w-5 h-5" />
              Voice Fingerprinting
            </h2>
            <VoiceProfileManager />
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">About</h2>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">OpenHiNotes</p>
              <p>Version 2.0.0</p>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-white mb-2">Features</p>
              <ul className="space-y-1 text-xs">
                <li>Audio transcription with AI</li>
                <li>Multi-speaker detection</li>
                <li>Automatic summarization</li>
                <li>HiDock device support</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
