import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { settingsApi, AppSetting } from '@/api/settings';
import { Save, RotateCcw, Loader, CheckCircle, AlertCircle } from 'lucide-react';

const VAD_MODE_OPTIONS = [
  { value: 'silero', label: 'Silero — Fast, lightweight VAD' },
  { value: 'pyannote', label: 'Pyannote — High-accuracy segmentation + diarization' },
  { value: 'hybrid', label: 'Hybrid — Silero gate + Pyannote refiner (best recall + precision)' },
  { value: 'none', label: 'None — No segmentation (pre-segmented audio)' },
];

const SETTING_LABELS: Record<string, { label: string; placeholder: string; type: string; options?: { value: string; label: string }[] }> = {
  voxhub_api_url: {
    label: 'VoxHub API URL',
    placeholder: 'http://voxhub:8000',
    type: 'url',
  },
  voxhub_api_key: {
    label: 'VoxHub API Key',
    placeholder: 'Leave empty if VoxHub has no API key configured',
    type: 'password',
  },
  voxhub_model: {
    label: 'Transcription Model',
    placeholder: 'whisper:turbo, voxtral:mini-4b, large-v3',
    type: 'text',
  },
  voxhub_job_mode: {
    label: 'VoxHub Job Mode (async)',
    placeholder: 'false',
    type: 'toggle',
  },
  voxhub_vad_mode: {
    label: 'VAD Mode',
    placeholder: 'silero',
    type: 'select',
    options: VAD_MODE_OPTIONS,
  },
  llm_api_url: {
    label: 'LLM API URL',
    placeholder: 'http://localhost:11434/v1',
    type: 'url',
  },
  llm_api_key: {
    label: 'LLM API Key',
    placeholder: 'Leave empty for local models (Ollama)',
    type: 'password',
  },
  llm_model: {
    label: 'LLM Model',
    placeholder: 'gpt-3.5-turbo',
    type: 'text',
  },
  llm_system_prompt: {
    label: 'LLM System Prompt',
    placeholder: 'You are a professional meeting assistant...',
    type: 'textarea',
  },
};

export function ApiSettings({ embedded }: { embedded?: boolean }) {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await settingsApi.getSettings();
      setSettings(data);
      // Initialize edit values - use empty string for sensitive masked fields
      const values: Record<string, string> = {};
      data.forEach((s) => {
        const isSensitive = SETTING_LABELS[s.key]?.type === 'password';
        values[s.key] = isSensitive ? '' : s.value;
      });
      setEditValues(values);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    setMessage(null);
    try {
      await settingsApi.updateSetting(key, editValues[key]);
      setMessage({ type: 'success', text: `${SETTING_LABELS[key]?.label || key} updated` });
      await loadSettings();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to update ${key}` });
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (key: string) => {
    if (!window.confirm(`Reset "${SETTING_LABELS[key]?.label || key}" to its environment default?`)) {
      return;
    }
    setSaving(key);
    setMessage(null);
    try {
      await settingsApi.resetSetting(key);
      setMessage({ type: 'success', text: `${SETTING_LABELS[key]?.label || key} reset to default` });
      await loadSettings();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to reset ${key}` });
    } finally {
      setSaving(null);
    }
  };

  const renderSettingGroup = (title: string, keys: string[]) => {
    const groupSettings = settings.filter((s) => keys.includes(s.key));
    if (groupSettings.length === 0) return null;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
        <div className="space-y-4">
          {groupSettings.map((setting) => {
            const meta = SETTING_LABELS[setting.key];
            const isSensitive = meta?.type === 'password';
            // For sensitive fields: modified if user typed something OR
            // if they explicitly want to clear it (empty value when DB has one)
            const isModified = isSensitive
              ? editValues[setting.key] !== ''
              : editValues[setting.key] !== setting.value;
            const isSaving = saving === setting.key;

            return (
              <div key={setting.key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {meta?.label || setting.key}
                  </label>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      setting.source === 'database'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {setting.source === 'database' ? 'Custom' : 'Default'}
                  </span>
                </div>
                {setting.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {setting.description}
                  </p>
                )}
                <div className="flex gap-2">
                  {meta?.type === 'toggle' ? (
                    <button
                      onClick={() => {
                        const current = (editValues[setting.key] || 'false').toLowerCase() === 'true';
                        setEditValues((prev) => ({ ...prev, [setting.key]: current ? 'false' : 'true' }));
                      }}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                        (editValues[setting.key] || 'false').toLowerCase() === 'true'
                          ? 'bg-blue-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                          (editValues[setting.key] || 'false').toLowerCase() === 'true'
                            ? 'translate-x-7'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  ) : meta?.type === 'textarea' ? (
                    <textarea
                      value={editValues[setting.key] || ''}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      placeholder={meta?.placeholder}
                      rows={4}
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono resize-y"
                    />
                  ) : meta?.type === 'select' && meta.options ? (
                    <select
                      value={editValues[setting.key] || ''}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {meta.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={meta?.type === 'password' ? 'password' : 'text'}
                      value={editValues[setting.key] || ''}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      placeholder={
                        isSensitive && setting.source === 'database'
                          ? 'Enter new value to update (current value is set)'
                          : meta?.placeholder
                      }
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  )}
                  <button
                    onClick={() => handleSave(setting.key)}
                    disabled={isSaving || !isModified}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 text-sm"
                    title="Save"
                  >
                    {isSaving ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                  </button>
                  {setting.source === 'database' && (
                    <button
                      onClick={() => handleReset(setting.key)}
                      disabled={isSaving}
                      className="px-3 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 text-sm"
                      title="Reset to default"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {isSensitive && setting.source === 'database' && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Clear "${meta?.label || setting.key}"? This will set it to empty.`)) return;
                        setSaving(setting.key);
                        try {
                          await settingsApi.updateSetting(setting.key, '');
                          setMessage({ type: 'success', text: `${meta?.label || setting.key} cleared` });
                          await loadSettings();
                        } catch {
                          setMessage({ type: 'error', text: `Failed to clear ${setting.key}` });
                        } finally {
                          setSaving(null);
                        }
                      }}
                      disabled={isSaving}
                      className="px-3 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg transition-colors disabled:opacity-50 text-sm"
                      title="Clear this key (set to empty)"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const content = (
    <>
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {renderSettingGroup('Transcription (VoxHub)', [
            'voxhub_api_url',
            'voxhub_api_key',
            'voxhub_model',
            'voxhub_job_mode',
            'voxhub_vad_mode',
          ])}
          {renderSettingGroup('LLM / Chat', [
            'llm_api_url',
            'llm_api_key',
            'llm_model',
            'llm_system_prompt',
          ])}

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Settings marked <span className="font-medium">Default</span> come from environment
              variables. Once you save a custom value, it overrides the environment default. Use
              the reset button to revert to the environment value.
            </p>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;
  return <Layout title="API Settings">{content}</Layout>;
}
