import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  Palette,
  Download,
  Bell,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { transcriptionService } from '@/services/transcriptionService';
import type { ProviderType } from '@/services/providers/types';
import { PROVIDER_PRESETS } from '@/services/providers';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [connectionTest, setConnectionTest] = useState<{
    testing: boolean;
    result?: { ok: boolean; message: string };
  }>({ testing: false });

  const handleSave = () => {
    updateSettings(tempSettings);

    // Re-initialize transcription service with new settings
    try {
      const { providerType, providerBaseUrl, providerApiKey, providerModel } = tempSettings;
      const canInit =
        (providerType === 'whisperx' && providerBaseUrl) ||
        (providerType === 'openai' && providerApiKey) ||
        (providerType === 'gemini' && providerApiKey);

      if (canInit) {
        transcriptionService.initialize({
          type: providerType,
          name: providerType,
          baseUrl: providerBaseUrl || undefined,
          apiKey: providerApiKey || undefined,
          model: providerModel || undefined,
        });
      }
    } catch (error) {
      console.error('Failed to initialize transcription service:', error);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTempSettings(settings);
    setConnectionTest({ testing: false });
  };

  const handleProviderChange = (type: ProviderType) => {
    const preset = PROVIDER_PRESETS[type];
    setTempSettings({
      ...tempSettings,
      providerType: type,
      providerBaseUrl: preset.baseUrl || '',
      providerModel: preset.model || '',
      // Keep API key if changing between providers that use it
      providerApiKey: type === 'whisperx' ? '' : tempSettings.providerApiKey,
    });
    setConnectionTest({ testing: false });
  };

  const handleTestConnection = async () => {
    setConnectionTest({ testing: true });
    try {
      const { providerType, providerBaseUrl, providerApiKey, providerModel } = tempSettings;

      // Create a temporary provider to test
      const { createProvider } = await import('@/services/providers');
      const provider = createProvider({
        type: providerType,
        name: providerType,
        baseUrl: providerBaseUrl || undefined,
        apiKey: providerApiKey || undefined,
        model: providerModel || undefined,
      });

      const result = await provider.testConnection();
      setConnectionTest({ testing: false, result });
    } catch (error) {
      setConnectionTest({
        testing: false,
        result: {
          ok: false,
          message: error instanceof Error ? error.message : 'Connection test failed',
        },
      });
    }
  };

  const needsApiKey = tempSettings.providerType === 'openai' || tempSettings.providerType === 'gemini';
  const needsBaseUrl = tempSettings.providerType === 'whisperx' || tempSettings.providerType === 'openai';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400">
          Configure your OpenHiNotes preferences and transcription provider
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transcription Provider */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center mb-4">
            <Server className="w-5 h-5 text-primary-500 mr-3" />
            <h2 className="text-lg font-semibold text-slate-100">Transcription Provider</h2>
          </div>

          <div className="space-y-4">
            {/* Provider Type */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Provider
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  { type: 'whisperx' as const, label: 'Local WhisperX', desc: 'Self-hosted, OpenAI-compatible' },
                  { type: 'openai' as const, label: 'OpenAI Cloud', desc: 'OpenAI Whisper API' },
                  { type: 'gemini' as const, label: 'Google Gemini', desc: 'Transcription + AI Insights' },
                ]).map(({ type, label, desc }) => (
                  <button
                    key={type}
                    onClick={() => handleProviderChange(type)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      tempSettings.providerType === type
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-slate-600 hover:border-slate-500 bg-slate-700/30'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-100">{label}</p>
                    <p className="text-xs text-slate-400 mt-1">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Server URL (whisperx, openai) */}
            {needsBaseUrl && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Server URL
                </label>
                <input
                  type="text"
                  value={tempSettings.providerBaseUrl}
                  onChange={(e) => setTempSettings({ ...tempSettings, providerBaseUrl: e.target.value })}
                  placeholder={tempSettings.providerType === 'whisperx' ? 'http://localhost:8000' : 'https://api.openai.com'}
                  className="input-field w-full"
                />
                {tempSettings.providerType === 'whisperx' && (
                  <p className="text-xs text-slate-500 mt-1">
                    Any OpenAI-compatible transcription server. See{' '}
                    <a
                      href="https://github.com/Nyralei/whisperx-api-server"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-400 hover:text-primary-300"
                    >
                      whisperx-api-server
                    </a>{' '}
                    for a local setup.
                  </p>
                )}
              </div>
            )}

            {/* API Key (openai, gemini) */}
            {needsApiKey && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={tempSettings.providerApiKey}
                    onChange={(e) => setTempSettings({ ...tempSettings, providerApiKey: e.target.value })}
                    placeholder={`Enter your ${tempSettings.providerType === 'gemini' ? 'Gemini' : 'OpenAI'} API key`}
                    className="input-field w-full pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {tempSettings.providerType === 'gemini'
                    ? <>Get your key from{' '}
                      <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">
                        Google AI Studio
                      </a></>
                    : <>Get your key from{' '}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">
                        OpenAI Dashboard
                      </a></>
                  }
                </p>
              </div>
            )}

            {/* Model Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Model
              </label>
              <input
                type="text"
                value={tempSettings.providerModel}
                onChange={(e) => setTempSettings({ ...tempSettings, providerModel: e.target.value })}
                placeholder="e.g. large-v3, whisper-1, gemini-1.5-flash"
                className="input-field w-full"
              />
              <p className="text-xs text-slate-500 mt-1">
                {tempSettings.providerType === 'whisperx'
                  ? 'Model name as configured on your whisperx server (e.g. large-v3, medium, small)'
                  : tempSettings.providerType === 'openai'
                  ? 'OpenAI model identifier (usually whisper-1)'
                  : 'Gemini model (e.g. gemini-1.5-flash, gemini-2.0-flash)'
                }
              </p>
            </div>

            {/* Transcription Language */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Transcription Language
              </label>
              <select
                value={tempSettings.transcriptionLanguage}
                onChange={(e) => setTempSettings({ ...tempSettings, transcriptionLanguage: e.target.value })}
                className="input-field w-full"
              >
                <option value="auto">Auto-detect</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="nl">Dutch</option>
                <option value="pl">Polish</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
                <option value="ru">Russian</option>
                <option value="ar">Arabic</option>
              </select>
            </div>

            {/* Test Connection */}
            <div className="pt-2">
              <button
                onClick={handleTestConnection}
                disabled={connectionTest.testing}
                className="btn-secondary flex items-center space-x-2"
              >
                {connectionTest.testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <Server className="w-4 h-4" />
                    <span>Test Connection</span>
                  </>
                )}
              </button>

              {connectionTest.result && (
                <div className={`mt-3 p-3 rounded-lg flex items-start space-x-2 ${
                  connectionTest.result.ok
                    ? 'bg-green-600/10 border border-green-600/30'
                    : 'bg-red-600/10 border border-red-600/30'
                }`}>
                  {connectionTest.result.ok ? (
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <p className={`text-sm ${connectionTest.result.ok ? 'text-green-300' : 'text-red-300'}`}>
                    {connectionTest.result.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Palette className="w-5 h-5 text-secondary-500 mr-3" />
            <h2 className="text-lg font-semibold text-slate-100">Appearance</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Theme
              </label>
              <select
                value={tempSettings.theme}
                onChange={(e) => setTempSettings({ ...tempSettings, theme: e.target.value as 'light' | 'dark' | 'system' })}
                className="input-field w-full"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </div>

        {/* Download Settings */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Download className="w-5 h-5 text-accent-500 mr-3" />
            <h2 className="text-lg font-semibold text-slate-100">Download Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Download Directory
              </label>
              <input
                type="text"
                value={tempSettings.downloadDirectory}
                onChange={(e) => setTempSettings({ ...tempSettings, downloadDirectory: e.target.value })}
                placeholder="Downloads/HiDock"
                className="input-field w-full"
              />
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="autoConnect"
                checked={tempSettings.autoConnect}
                onChange={(e) => setTempSettings({ ...tempSettings, autoConnect: e.target.checked })}
                className="rounded border-slate-500 bg-slate-700 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="autoConnect" className="text-sm text-slate-300">
                Auto-connect to device on page load
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="autoDownload"
                checked={tempSettings.autoDownload}
                onChange={(e) => setTempSettings({ ...tempSettings, autoDownload: e.target.checked })}
                className="rounded border-slate-500 bg-slate-700 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="autoDownload" className="text-sm text-slate-300">
                Auto-download new recordings
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Audio Quality
              </label>
              <select
                value={tempSettings.audioQuality}
                onChange={(e) => setTempSettings({ ...tempSettings, audioQuality: e.target.value as 'low' | 'medium' | 'high' })}
                className="input-field w-full"
              >
                <option value="low">Low (Faster)</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="high">High (Best Quality)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Bell className="w-5 h-5 text-primary-500 mr-3" />
            <h2 className="text-lg font-semibold text-slate-100">Notifications</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="notifications"
                checked={tempSettings.notifications}
                onChange={(e) => setTempSettings({ ...tempSettings, notifications: e.target.checked })}
                className="rounded border-slate-500 bg-slate-700 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="notifications" className="text-sm text-slate-300">
                Enable notifications
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Device Information */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <SettingsIcon className="w-5 h-5 text-slate-400 mr-3" />
          <h2 className="text-lg font-semibold text-slate-100">Device Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-400">Browser</p>
            <p className="text-slate-100">{navigator.userAgent.split(' ')[0]}</p>
          </div>
          <div>
            <p className="text-slate-400">WebUSB Support</p>
            <p className="text-slate-100">{navigator.usb ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="text-slate-400">App Version</p>
            <p className="text-slate-100">1.0.0</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleReset}
          className="btn-secondary"
        >
          Reset Changes
        </button>

        <button
          onClick={handleSave}
          className={`btn-primary flex items-center space-x-2 ${
            saved ? 'bg-green-600 hover:bg-green-700' : ''
          }`}
        >
          <Save className="w-4 h-4" />
          <span>{saved ? 'Saved!' : 'Save Settings'}</span>
        </button>
      </div>
    </div>
  );
};
