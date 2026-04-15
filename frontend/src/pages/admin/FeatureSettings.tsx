import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { settingsApi } from '@/api/settings';
import { Server, Fingerprint, Users, CheckCircle, AlertCircle } from 'lucide-react';

export function FeatureSettings({ embedded }: { embedded?: boolean }) {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Audio
  const [keepAudioEnabled, setKeepAudioEnabled] = useState(true);
  const [savingAudio, setSavingAudio] = useState(false);

  // Voice fingerprinting
  const [voiceFingerprintingEnabled, setVoiceFingerprintingEnabled] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  // Groups
  const [allowUserGroupCreation, setAllowUserGroupCreation] = useState(false);
  const [savingGroups, setSavingGroups] = useState(false);

  useEffect(() => {
    loadAudio();
    loadVoiceFingerprinting();
    loadGroups();
  }, []);

  const loadAudio = async () => {
    try {
      const data = await settingsApi.getAudioSettings();
      setKeepAudioEnabled(data.keep_audio_enabled);
    } catch {
      // ignore
    }
  };

  const loadVoiceFingerprinting = async () => {
    try {
      const data = await settingsApi.getSettings();
      const setting = data.find((s) => s.key === 'voice_fingerprinting_enabled');
      setVoiceFingerprintingEnabled(setting?.value?.toLowerCase() === 'true');
    } catch {
      // ignore
    }
  };

  const loadGroups = async () => {
    try {
      const data = await settingsApi.getGroupsSettings();
      setAllowUserGroupCreation(data.allow_user_group_creation);
    } catch {
      // ignore
    }
  };

  const handleToggleKeepAudio = async () => {
    setSavingAudio(true);
    try {
      const newValue = !keepAudioEnabled;
      await settingsApi.updateAudioSettings(newValue);
      setKeepAudioEnabled(newValue);
      setMessage({ type: 'success', text: `Keep audio ${newValue ? 'enabled' : 'disabled'}` });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update audio setting' });
    } finally {
      setSavingAudio(false);
    }
  };

  const handleToggleVoiceFingerprinting = async () => {
    setSavingVoice(true);
    try {
      const newValue = !voiceFingerprintingEnabled;
      await settingsApi.updateSetting('voice_fingerprinting_enabled', newValue ? 'true' : 'false');
      setVoiceFingerprintingEnabled(newValue);
      setMessage({
        type: 'success',
        text: `Voice fingerprinting ${newValue ? 'enabled' : 'disabled'}`,
      });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update voice fingerprinting setting' });
    } finally {
      setSavingVoice(false);
    }
  };

  const handleToggleUserGroupCreation = async () => {
    setSavingGroups(true);
    try {
      const newValue = !allowUserGroupCreation;
      await settingsApi.updateGroupsSettings(newValue);
      setAllowUserGroupCreation(newValue);
      setMessage({
        type: 'success',
        text: `User group creation ${newValue ? 'enabled' : 'disabled'}`,
      });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update group creation setting' });
    } finally {
      setSavingGroups(false);
    }
  };

  const Toggle = ({
    enabled,
    onClick,
    disabled,
  }: {
    enabled: boolean;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
        enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );

  const content = (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Message banner */}
      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Audio Storage */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Audio Storage</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Allow users to keep audio
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              When enabled, users can choose to save audio files on the server alongside their
              transcriptions. When disabled, audio is always deleted after transcription completes.
            </p>
          </div>
          <Toggle enabled={keepAudioEnabled} onClick={handleToggleKeepAudio} disabled={savingAudio} />
        </div>
      </div>

      {/* Voice Fingerprinting */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Fingerprint className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Voice Fingerprinting</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable voice fingerprinting
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              When enabled, users can record their voice to create a speaker profile. During
              transcription, speakers are automatically identified by matching against known
              profiles. Voice embeddings are encrypted at rest. Disabling this hides the feature
              from all users but does not delete existing profiles.
            </p>
          </div>
          <Toggle
            enabled={voiceFingerprintingEnabled}
            onClick={handleToggleVoiceFingerprinting}
            disabled={savingVoice}
          />
        </div>
      </div>

      {/* Groups */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Groups</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Allow users to create groups
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              When enabled, regular users can create their own groups and invite members. Admins
              can always create groups regardless of this setting.
            </p>
          </div>
          <Toggle
            enabled={allowUserGroupCreation}
            onClick={handleToggleUserGroupCreation}
            disabled={savingGroups}
          />
        </div>
      </div>
    </div>
  );

  if (embedded) return content;
  return <Layout title="Feature Settings">{content}</Layout>;
}
