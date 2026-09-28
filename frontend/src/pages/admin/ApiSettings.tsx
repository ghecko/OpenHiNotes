import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import {
  settingsApi,
  AppSetting,
  ConnectionService,
  ConnectionTestResult,
  ReasoningControl,
} from '@/api/settings';
import { Save, RotateCcw, Loader, CheckCircle, AlertCircle, Plug, XCircle } from 'lucide-react';

const VAD_MODE_OPTIONS = [
  { value: '', label: 'Server default (recommended)' },
  { value: 'pyannote', label: 'Pyannote — High-accuracy segmentation + diarization' },
  { value: 'hybrid', label: 'Hybrid — Silero gate + Pyannote refiner (best recall + precision)' },
  { value: 'silero', label: 'Silero — Fast VAD, NO speaker labels (breaks diarization)' },
  { value: 'none', label: 'None — No segmentation (pre-segmented audio)' },
];

const PIPELINE_OPTIONS = [
  { value: '', label: 'Server default' },
  { value: 'wordalign', label: 'Word-align — chunked transcription + CTC word timestamps + per-word speakers' },
  { value: 'legacy', label: 'Legacy — diarize first, transcribe each speaker turn' },
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
  voxhub_pipeline: {
    label: 'Pipeline',
    placeholder: '',
    type: 'select',
    options: PIPELINE_OPTIONS,
  },
  voxhub_vad_mode: {
    label: 'VAD Mode (legacy pipeline only)',
    placeholder: '',
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
  llm_reasoning_control: {
    label: 'Thinking control',
    placeholder: '',
    type: 'select', // options from GET /settings/llm-reasoning-controls
  },
  llm_reasoning_default: {
    label: 'Default thinking level',
    placeholder: '',
    type: 'select', // options = levels of the selected control
  },
  llm_extra_body: {
    label: 'Extra request body (JSON)',
    placeholder: '{"top_p": 0.9}',
    type: 'textarea',
  },
  llm_idle_timeout: {
    label: 'LLM idle timeout (seconds)',
    placeholder: '300',
    type: 'text',
  },
  llm_max_duration: {
    label: 'LLM max duration (seconds)',
    placeholder: '1800',
    type: 'text',
  },
  llm_summary_concurrency: {
    label: 'Summaries in parallel',
    placeholder: '1',
    type: 'text',
  },
};

export function ApiSettings({ embedded }: { embedded?: boolean }) {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState<ConnectionService | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<ConnectionService, ConnectionTestResult>>>({});
  const [reasoningControls, setReasoningControls] = useState<ReasoningControl[]>([]);

  useEffect(() => {
    settingsApi.getReasoningControls().then(setReasoningControls).catch(() => setReasoningControls([]));
  }, []);

  /** Select options: static for most keys, dynamic for the thinking settings. */
  const getOptions = (key: string): { value: string; label: string }[] | undefined => {
    if (key === 'llm_reasoning_control') {
      return reasoningControls.map((c) => ({ value: c.value, label: c.label }));
    }
    if (key === 'llm_reasoning_default') {
      const control = reasoningControls.find((c) => c.value === (editValues.llm_reasoning_control || ''));
      const levels = control?.levels ?? [];
      const current = editValues.llm_reasoning_default || '';
      const opts = [
        { value: '', label: 'Model default (send nothing)' },
        ...levels.map((l) => ({ value: l, label: l.charAt(0).toUpperCase() + l.slice(1) })),
      ];
      // Keep an out-of-range saved value visible so it can be fixed.
      if (current && !levels.includes(current)) opts.push({ value: current, label: `${current} (not supported by this control)` });
      return opts;
    }
    return SETTING_LABELS[key]?.options;
  };

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
      const detail = error instanceof Error ? error.message : '';
      setMessage({ type: 'error', text: `Failed to update ${key}${detail ? `: ${detail}` : ''}` });
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

  const handleTest = async (service: ConnectionService) => {
    setTesting(service);
    try {
      // Test what is in the form, saved or not. The key field is empty unless
      // the admin typed a new one; the backend then uses the stored key.
      const result = await settingsApi.testConnection(service, {
        api_url: editValues[`${service}_api_url`] || undefined,
        api_key: editValues[`${service}_api_key`] || undefined,
        model: editValues[`${service}_model`] || undefined,
      });
      setTestResults((prev) => ({ ...prev, [service]: result }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [service]: {
          service,
          ok: false,
          url: editValues[`${service}_api_url`] || '',
          latency_ms: null,
          model: '',
          models: [],
          model_found: null,
          error: error instanceof Error ? error.message : 'Test request failed',
          hint: null,
          details: {},
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const renderTestResult = (service: ConnectionService) => {
    const r = testResults[service];
    if (!r) return null;
    const modelKey = `${service}_model`;
    const currentModel = editValues[modelKey] || '';
    const loaded = new Set(r.details?.loaded || []);
    return (
      <div
        className={`mb-4 p-3 rounded-lg border text-sm ${
          r.ok
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}
      >
        <div className="flex items-start gap-2">
          {r.ok ? (
            <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className={r.ok ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}>
              {r.ok
                ? `Connected to ${r.url}${r.latency_ms != null ? ` (${r.latency_ms} ms)` : ''}`
                : r.error}
            </p>
            {r.hint && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{r.hint}</p>
            )}
            {r.details?.models_error && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Model list unavailable: {r.details.models_error}
              </p>
            )}
            {r.ok && r.models.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {r.models.length} model{r.models.length > 1 ? 's' : ''} available, click to select
                  {loaded.size > 0 && ' (● = loaded in memory)'}:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {r.models.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditValues((prev) => ({ ...prev, [modelKey]: m }))}
                      className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                        m === currentModel
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500'
                      }`}
                      title={m === currentModel ? 'Current value' : 'Use this model (then save)'}
                    >
                      {loaded.has(m) && '● '}
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {r.ok && r.models.length === 0 && !r.details?.models_error && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                The server answered but returned no model.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettingGroup = (title: string, keys: string[], service?: ConnectionService) => {
    const groupSettings = settings.filter((s) => keys.includes(s.key));
    if (groupSettings.length === 0) return null;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {service && (
            <button
              type="button"
              onClick={() => handleTest(service)}
              disabled={testing !== null}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm"
              title="Check that the backend can reach this service and list its models (uses the values in the form, saved or not)"
            >
              {testing === service ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              Test connection
            </button>
          )}
        </div>
        {service && renderTestResult(service)}
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
                  ) : meta?.type === 'select' && getOptions(setting.key) ? (
                    <select
                      value={editValues[setting.key] || ''}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {getOptions(setting.key)!.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={meta?.type === 'password' ? 'password' : 'text'}
                      list={
                        service && setting.key === `${service}_model` && testResults[service]?.models.length
                          ? `${setting.key}-options`
                          : undefined
                      }
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
                  {service && setting.key === `${service}_model` && testResults[service]?.models.length ? (
                    <datalist id={`${setting.key}-options`}>
                      {testResults[service]!.models.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  ) : null}
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
            'voxhub_pipeline',
            'voxhub_vad_mode',
          ], 'voxhub')}
          {renderSettingGroup('LLM / Chat', [
            'llm_api_url',
            'llm_api_key',
            'llm_model',
            'llm_system_prompt',
          ], 'llm')}
          {renderSettingGroup('LLM generation (thinking, timeouts, queue)', [
            'llm_reasoning_control',
            'llm_reasoning_default',
            'llm_extra_body',
            'llm_idle_timeout',
            'llm_max_duration',
            'llm_summary_concurrency',
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
