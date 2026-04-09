import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Upload,
  Trash2,
  Loader,
  CheckCircle,
  AlertCircle,
  Square,
  Fingerprint,
  Info,
} from 'lucide-react';
import { voiceProfilesApi, VoiceProfile } from '@/api/voiceProfiles';

/**
 * VoiceProfileManager — lets users record or upload a voice sample,
 * extract a speaker embedding (via VoxHub), and manage their profiles.
 *
 * Shown in Settings page. Handles:
 * - Browser mic recording (MediaRecorder API)
 * - File upload (WAV/MP3/etc.)
 * - Profile listing and deletion
 * - GDPR consent and "delete all" flow
 */

type RecordingState = 'idle' | 'recording' | 'processing';

interface Message {
  type: 'success' | 'error' | 'info';
  text: string;
}

export function VoiceProfileManager() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [label, setLabel] = useState('My voice');
  const [message, setMessage] = useState<Message | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [profilesWereDeleted, setProfilesWereDeleted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profiles on mount
  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await voiceProfilesApi.listProfiles();
      setProfiles(response.profiles);

      const hadConsentBefore = localStorage.getItem('voice_fingerprint_consent') === 'true';

      if (response.profiles.length > 0) {
        // User has profiles → consent was given
        setConsentGiven(true);
        localStorage.setItem('voice_fingerprint_consent', 'true');
      } else if (hadConsentBefore) {
        // User previously consented and had profiles, but now has 0.
        // This means an admin deleted them or a key rotation happened.
        setConsentGiven(true);
        setProfilesWereDeleted(true);
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load voice profiles',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ---- Recording ----

  const startRecording = async () => {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) {
          setMessage({ type: 'error', text: 'Recording too short. Please record at least 5 seconds.' });
          setRecordingState('idle');
          return;
        }
        await uploadVoiceSample(blob);
      };

      mediaRecorder.start(250); // collect data every 250ms
      setRecordingState('recording');
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Could not access microphone. Please check browser permissions.',
      });
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // ---- File Upload ----

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    await uploadVoiceSample(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---- Upload to backend ----

  const uploadVoiceSample = async (fileOrBlob: File | Blob) => {
    setRecordingState('processing');
    setMessage(null);
    try {
      const profile = await voiceProfilesApi.createProfile(fileOrBlob, label);
      setProfiles((prev) => [profile, ...prev]);
      setProfilesWereDeleted(false);
      localStorage.setItem('voice_fingerprint_consent', 'true');
      setMessage({ type: 'success', text: 'Voice profile created successfully!' });
      setLabel('My voice');
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create voice profile',
      });
    } finally {
      setRecordingState('idle');
      setRecordingDuration(0);
    }
  };

  // ---- Delete ----

  const handleDelete = async (profileId: string) => {
    if (!confirm('Delete this voice profile? This action cannot be undone.')) return;
    setDeletingId(profileId);
    try {
      await voiceProfilesApi.deleteProfile(profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      setMessage({ type: 'success', text: 'Voice profile deleted.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete profile',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (
      !confirm(
        'Delete ALL your voice profiles? This permanently removes your voice data and cannot be undone.'
      )
    )
      return;
    try {
      await voiceProfilesApi.deleteAllProfiles();
      setProfiles([]);
      setConsentGiven(false);
      setProfilesWereDeleted(false);
      localStorage.removeItem('voice_fingerprint_consent');
      setMessage({ type: 'success', text: 'All voice profiles deleted.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete profiles',
      });
    }
  };

  // ---- Format helpers ----

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ---- Consent gate ----

  if (!consentGiven && !isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <p className="font-medium">Voice Fingerprinting — GDPR Notice</p>
            <p>
              This feature lets you record your voice so the app can automatically identify you
              in transcriptions. Your voice embedding (a mathematical representation) will be
              encrypted and stored in the database.
            </p>
            <p>
              You can delete your voice data at any time. Your embedding is only used to match
              speakers during transcription and is never shared with third parties.
            </p>
            <p>
              If your account is deactivated, all voice data is automatically deleted.
            </p>
          </div>
        </div>
        <button
          onClick={() => setConsentGiven(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Fingerprint className="w-4 h-4" />
          I understand, enable voice fingerprinting
        </button>
      </div>
    );
  }

  // ---- Main UI ----

  return (
    <div className="space-y-5">
      {/* Notice: embeddings were deleted externally */}
      {profilesWereDeleted && profiles.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Your voice profiles were removed</p>
            <p className="mt-1">
              An administrator has deleted your voice embeddings, or they were cleared during
              a system maintenance operation. Your account is not affected. You can re-record
              your voice below to re-enable automatic speaker identification.
            </p>
          </div>
        </div>
      )}

      {/* Recording / Upload Controls */}
      <div className="space-y-3">
        {/* Label input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Profile Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. My voice, Office mic"
            disabled={recordingState !== 'idle'}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {recordingState === 'idle' && (
            <>
              <button
                onClick={startRecording}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Mic className="w-4 h-4" />
                Record Voice
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Upload className="w-4 h-4" />
                Upload Audio
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </>
          )}

          {recordingState === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm animate-pulse"
            >
              <Square className="w-4 h-4" />
              Stop Recording — {formatDuration(recordingDuration)}
            </button>
          )}

          {recordingState === 'processing' && (
            <div className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 text-sm">
              <Loader className="w-4 h-4 animate-spin" />
              Extracting voice profile...
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Record 10-30 seconds of clear speech, or upload a WAV/MP3 file. Only your voice should
          be in the sample.
        </p>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : message.type === 'error'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Profile list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : profiles.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Your Voice Profiles ({profiles.length})
          </p>
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-center gap-3">
                <Fingerprint className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {profile.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {profile.embedding_dim}d embedding — Created {formatDate(profile.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(profile.id)}
                disabled={deletingId === profile.id}
                className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                title="Delete this voice profile"
              >
                {deletingId === profile.id ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}

          {/* Delete all */}
          <button
            onClick={handleDeleteAll}
            className="mt-2 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors underline"
          >
            Delete all my voice data
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
          No voice profiles yet. Record or upload a voice sample to get started.
        </p>
      )}
    </div>
  );
}
