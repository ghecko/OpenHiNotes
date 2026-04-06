import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { apiClient } from '@/api/client';
import {
  Globe,
  Clock,
  Mail,
  Save,
  X,
  Plus,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import type { RegistrationSettings } from '@/types';

export function RegistrationSettingsPage({ embedded }: { embedded?: boolean }) {
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<RegistrationSettings>('/settings/registration');
      setSettings(data);
    } catch (err) {
      setError('Failed to load registration settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiClient.put<RegistrationSettings>('/settings/registration', settings);
      setSettings(updated);
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDomain = () => {
    if (!settings || !newDomain.trim()) return;
    const domain = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!domain) return;
    if (settings.allowed_domains.includes(domain)) {
      setNewDomain('');
      return;
    }
    setSettings({ ...settings, allowed_domains: [...settings.allowed_domains, domain] });
    setNewDomain('');
  };

  const handleRemoveDomain = (domain: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      allowed_domains: settings.allowed_domains.filter((d) => d !== domain),
    });
  };

  if (isLoading) {
    const loadingContent = <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading...</div>;
    if (embedded) return loadingContent;
    return <Layout title="Registration Settings">{loadingContent}</Layout>;
  }

  if (!settings) {
    const errorContent = <div className="p-12 text-center text-red-500">Failed to load settings</div>;
    if (embedded) return errorContent;
    return <Layout title="Registration Settings">{errorContent}</Layout>;
  }

  const content = (
      <div className="max-w-2xl space-y-6">
        {/* Status messages */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Public Registration Toggle */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Public Registration
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  When enabled, anyone can create an account through the registration page.
                  When disabled, only administrators can create accounts.
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setSettings({ ...settings, registration_enabled: !settings.registration_enabled })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                settings.registration_enabled
                  ? 'bg-green-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.registration_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Approval Required Toggle */}
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 transition-opacity ${
          !settings.registration_enabled ? 'opacity-50 pointer-events-none' : ''
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Require Admin Approval
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  New registrations are placed in a "Pending" state and require explicit admin
                  approval before the user can log in.
                </p>
                {!settings.registration_enabled && (
                  <p className="text-xs text-amber-500 dark:text-amber-400 mt-1 italic">
                    Enable public registration to configure this setting.
                  </p>
                )}
              </div>
            </div>
            <button
              disabled={!settings.registration_enabled}
              onClick={() =>
                setSettings({ ...settings, approval_required: !settings.approval_required })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                settings.approval_required
                  ? 'bg-amber-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.approval_required ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Domain Whitelist */}
        <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 transition-opacity ${
          !settings.registration_enabled ? 'opacity-50 pointer-events-none' : ''
        }`}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Allowed Email Domains
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Restrict registration to specific email domains. Leave empty to allow all domains.
              </p>
              {!settings.registration_enabled && (
                <p className="text-xs text-amber-500 dark:text-amber-400 mt-1 italic">
                  Enable public registration to configure this setting.
                </p>
              )}
            </div>
          </div>

          {/* Add domain input */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDomain())}
                placeholder="company.com"
                disabled={!settings.registration_enabled}
                className="w-full pl-7 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-40"
              />
            </div>
            <button
              onClick={handleAddDomain}
              disabled={!newDomain.trim() || !settings.registration_enabled}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Domain list */}
          {settings.allowed_domains.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
              No domain restrictions — all email domains are accepted.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {settings.allowed_domains.map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium"
                >
                  @{domain}
                  <button
                    onClick={() => handleRemoveDomain(domain)}
                    disabled={!settings.registration_enabled}
                    className="hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {isSaving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>
  );

  if (embedded) return content;
  return <Layout title="Registration Settings">{content}</Layout>;
}