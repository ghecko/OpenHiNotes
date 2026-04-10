import { useState, useEffect } from 'react';
import { oidcAdminApi, OIDCProviderCreatePayload } from '@/api/oidcAdmin';
import { OIDCProviderDetail, OIDCDiscoveryTestResult } from '@/types';
import {
  Plus,
  Trash2,
  Pencil,
  CheckCircle,
  AlertCircle,
  Loader,
  Shield,
  Search,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface ProviderFormData {
  display_name: string;
  discovery_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  auto_provision: boolean;
  default_role: string;
  allowed_domains: string;
  require_approval: boolean;
  email_claim: string;
  name_claim: string;
  is_enabled: boolean;
}

const DEFAULT_FORM: ProviderFormData = {
  display_name: '',
  discovery_url: '',
  client_id: '',
  client_secret: '',
  scopes: 'openid email profile',
  auto_provision: true,
  default_role: 'user',
  allowed_domains: '',
  require_approval: false,
  email_claim: 'email',
  name_claim: 'name',
  is_enabled: true,
};

export function OIDCSettings({ embedded }: { embedded?: boolean }) {
  const [providers, setProviders] = useState<OIDCProviderDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<OIDCDiscoveryTestResult | null>(null);
  const [testingDiscovery, setTestingDiscovery] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setIsLoading(true);
    try {
      const data = await oidcAdminApi.listProviders();
      setProviders(data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load OIDC providers' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestDiscovery = async () => {
    if (!form.discovery_url) return;
    setTestingDiscovery(true);
    setDiscoveryResult(null);
    try {
      const result = await oidcAdminApi.testDiscovery(form.discovery_url);
      setDiscoveryResult(result);
    } catch (err) {
      setDiscoveryResult({ success: false, error: 'Request failed', issuer: null, authorization_endpoint: null, token_endpoint: null, userinfo_endpoint: null, jwks_uri: null, scopes_supported: null });
    } finally {
      setTestingDiscovery(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (editingId) {
        // Update — only send changed fields
        const payload: Record<string, unknown> = {};
        Object.entries(form).forEach(([key, value]) => {
          // Always send all fields on update for simplicity
          payload[key] = value;
        });
        // Don't send empty client_secret on update (means "keep existing")
        if (!form.client_secret) {
          delete payload.client_secret;
        }
        await oidcAdminApi.updateProvider(editingId, payload);
        setMessage({ type: 'success', text: 'Provider updated successfully' });
      } else {
        if (!form.client_secret) {
          setMessage({ type: 'error', text: 'Client secret is required for new providers' });
          setSaving(false);
          return;
        }
        await oidcAdminApi.createProvider(form as OIDCProviderCreatePayload);
        setMessage({ type: 'success', text: 'Provider created successfully' });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      setDiscoveryResult(null);
      await loadProviders();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save provider' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (provider: OIDCProviderDetail) => {
    setEditingId(provider.id);
    setForm({
      display_name: provider.display_name,
      discovery_url: provider.discovery_url,
      client_id: provider.client_id,
      client_secret: '', // Don't pre-fill — leave empty to keep existing
      scopes: provider.scopes,
      auto_provision: provider.auto_provision,
      default_role: provider.default_role,
      allowed_domains: provider.allowed_domains || '',
      require_approval: provider.require_approval,
      email_claim: provider.email_claim,
      name_claim: provider.name_claim,
      is_enabled: provider.is_enabled,
    });
    setShowForm(true);
    setDiscoveryResult(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this OIDC provider? All linked user identities will be removed.')) return;
    setDeletingId(id);
    try {
      await oidcAdminApi.deleteProvider(id);
      setMessage({ type: 'success', text: 'Provider deleted' });
      await loadProviders();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete provider' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleEnabled = async (provider: OIDCProviderDetail) => {
    try {
      await oidcAdminApi.updateProvider(provider.id, { is_enabled: !provider.is_enabled });
      await loadProviders();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to toggle provider' });
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setDiscoveryResult(null);
  };

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SSO / OIDC Providers</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure OpenID Connect identity providers for single sign-on.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(DEFAULT_FORM);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Provider
          </button>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div className={`p-4 rounded-lg flex items-start gap-3 text-sm ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200/60 dark:border-green-800/40'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-800/40'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Provider Form */}
      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Edit Provider' : 'Add New Provider'}
            </h3>
            <button onClick={cancelForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder="e.g. Google, Microsoft, Company SSO"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scopes</label>
                <input
                  type="text"
                  value={form.scopes}
                  onChange={(e) => setForm({ ...form, scopes: e.target.value })}
                  placeholder="openid email profile"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            </div>

            {/* Discovery URL + Test */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discovery URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.discovery_url}
                  onChange={(e) => setForm({ ...form, discovery_url: e.target.value })}
                  placeholder="https://accounts.google.com/.well-known/openid-configuration"
                  required
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
                <button
                  type="button"
                  onClick={handleTestDiscovery}
                  disabled={testingDiscovery || !form.discovery_url}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {testingDiscovery ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Test
                </button>
              </div>
              {discoveryResult && (
                <div className={`mt-2 p-3 rounded-lg text-xs ${
                  discoveryResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                }`}>
                  {discoveryResult.success ? (
                    <div className="space-y-1">
                      <p className="font-medium">Discovery successful</p>
                      <p>Issuer: {discoveryResult.issuer}</p>
                      <p>Scopes: {discoveryResult.scopes_supported?.join(', ')}</p>
                    </div>
                  ) : (
                    <p>Discovery failed: {discoveryResult.error}</p>
                  )}
                </div>
              )}
            </div>

            {/* Client Credentials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client ID</label>
                <input
                  type="text"
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  placeholder="From your OIDC provider"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Client Secret {editingId && <span className="text-gray-400 font-normal">(leave empty to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={form.client_secret}
                  onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                  placeholder={editingId ? '••••••••' : 'From your OIDC provider'}
                  required={!editingId}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            </div>

            {/* Behavior */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Role</label>
                <select
                  value={form.default_role}
                  onChange={(e) => setForm({ ...form, default_role: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allowed Domains</label>
                <input
                  type="text"
                  value={form.allowed_domains}
                  onChange={(e) => setForm({ ...form, allowed_domains: e.target.value })}
                  placeholder="company.com, partner.com (empty = all)"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_provision}
                  onChange={(e) => setForm({ ...form, auto_provision: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500/50"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Auto-provision users</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.require_approval}
                  onChange={(e) => setForm({ ...form, require_approval: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500/50"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Require admin approval</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500/50"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
              </label>
            </div>

            {/* Claim Mapping (collapsible) */}
            <details className="group">
              <summary className="text-sm font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white">
                Advanced: Claim Mapping
              </summary>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email Claim</label>
                  <input
                    type="text"
                    value={form.email_claim}
                    onChange={(e) => setForm({ ...form, email_claim: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name Claim</label>
                  <input
                    type="text"
                    value={form.name_claim}
                    onChange={(e) => setForm({ ...form, name_claim: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                </div>
              </div>
            </details>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cancelForm}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {editingId ? 'Update Provider' : 'Create Provider'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Provider List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : providers.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No OIDC providers configured yet.</p>
          <p className="text-xs mt-1">Add a provider to enable single sign-on on the login page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                provider.is_enabled
                  ? 'bg-white dark:bg-gray-800/50 border-gray-200/60 dark:border-gray-700/40'
                  : 'bg-gray-50 dark:bg-gray-800/30 border-gray-200/40 dark:border-gray-700/20 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm flex-shrink-0">
                  {provider.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {provider.display_name}
                    <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                      ({provider.slug})
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {provider.discovery_url}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {/* Enable/disable toggle */}
                <button
                  onClick={() => handleToggleEnabled(provider)}
                  title={provider.is_enabled ? 'Disable' : 'Enable'}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {provider.is_enabled ? (
                    <ToggleRight className="w-5 h-5 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                </button>
                {/* Edit */}
                <button
                  onClick={() => handleEdit(provider)}
                  className="p-1.5 text-gray-400 hover:text-primary-500 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDelete(provider.id)}
                  disabled={deletingId === provider.id}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  {deletingId === provider.id ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">{content}</div>
  );
}
