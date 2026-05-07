import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader, CheckCircle, ExternalLink, Server, Users, FolderOpen } from 'lucide-react';
import { Transcription, SummaryTemplate, RecordingType, Collection, UserGroup } from '@/types';
import { transcriptionsApi } from '@/api/transcriptions';
import { collectionsApi } from '@/api/collections';
import { templatesApi } from '@/api/templates';
import { settingsApi } from '@/api/settings';
import { groupsApi } from '@/api/groups';
import { sharesApi } from '@/api/shares';
import { useQueueStore } from '@/store/useQueueStore';
import { TemplateSelector } from '@/components/TemplateSelector';

interface TranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioFile: Blob | null;
  fileName: string;
  /** If set, automatically applied as the transcription title after successful transcribe */
  initialTitle?: string;
  /** If set, automatically assigns the transcription to this collection after transcribe */
  initialCollectionId?: string;
  onComplete: (transcription: Transcription) => void;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

export function TranscribeModal({
  isOpen,
  onClose,
  audioFile,
  fileName,
  initialTitle,
  initialCollectionId,
  onComplete,
}: TranscribeModalProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [language, setLanguage] = useState('auto');
  const [keepAudio, setKeepAudio] = useState(false);
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submittedTranscription, setSubmittedTranscription] = useState<Transcription | null>(null);
  const [keepAudioAllowed, setKeepAudioAllowed] = useState(true);

  // ── New: editable title, collection, and group share ──
  const [title, setTitle] = useState<string>('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupSharePermission, setGroupSharePermission] = useState<'read' | 'write'>('read');
  const [showGroupShare, setShowGroupShare] = useState(false);

  useEffect(() => {
    settingsApi.getAudioSettings()
      .then((s) => {
        setKeepAudioAllowed(s.keep_audio_enabled);
        if (!s.keep_audio_enabled) setKeepAudio(false);
      })
      .catch(() => {});
  }, []);

  // Reset / pre-fill editable fields when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle || '');
    setCollectionId(initialCollectionId || '');
    setSelectedGroupIds([]);
    setGroupSharePermission('read');
    setShowGroupShare(false);
    // Load collections and groups for pickers
    collectionsApi.list().then(setCollections).catch(() => {});
    groupsApi.list().then(setGroups).catch(() => {});
  }, [isOpen, initialTitle, initialCollectionId]);

  const detectedType: RecordingType = useMemo(
    () => (/wip/i.test(fileName) ? 'whisper' : 'record'),
    [fileName],
  );
  const [recordingType, setRecordingType] = useState<RecordingType>(detectedType);

  // Sync when fileName changes (e.g. modal reopened with different file)
  useEffect(() => {
    setRecordingType(detectedType);
  }, [detectedType]);

  useEffect(() => {
    if (autoSummarize) {
      loadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSummarize, recordingType]);

  const loadTemplates = async () => {
    try {
      const t = await templatesApi.getTemplates(false, recordingType);
      setTemplates(t);
      if (t.length > 0) {
        setSelectedTemplate(t[0].id);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const handleSubmit = async () => {
    if (!audioFile) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const file = new File([audioFile], fileName, { type: 'audio/wav' });

      // Always use queue — returns immediately
      const transcription = await transcriptionsApi.queueTranscription(
        file,
        language,
        keepAudio,
        autoSummarize,
        autoSummarize ? selectedTemplate : undefined,
        recordingType,
      );

      // Apply user-chosen title (falls back to initialTitle prop if untouched)
      const trimmedTitle = title.trim();
      if (trimmedTitle && transcription.id) {
        try {
          await transcriptionsApi.updateTitle(transcription.id, trimmedTitle);
          transcription.title = trimmedTitle;
        } catch {
          console.warn('Could not set transcription title');
        }
      }

      // Assign to collection if user picked one
      if (collectionId && transcription.id) {
        try {
          await collectionsApi.assignTranscription(collectionId, transcription.id);
          transcription.collection_id = collectionId;
        } catch {
          console.warn('Could not assign to collection');
        }
      }

      // Share with selected groups
      if (selectedGroupIds.length > 0 && transcription.id) {
        await Promise.all(
          selectedGroupIds.map((gid) =>
            sharesApi
              .create({
                resource_type: 'transcription',
                resource_id: transcription.id,
                grantee_type: 'group',
                grantee_id: gid,
                permission: groupSharePermission,
              })
              .catch((err) => {
                console.warn('Could not share with group', gid, err);
              }),
          ),
        );
      }

      // Add to queue store (starts SSE streaming automatically for real-time progress)
      useQueueStore.getState().addQueueItem(transcription);

      setIsSubmitting(false);
      setSubmittedTranscription(transcription);
      onComplete(transcription);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to queue transcription';
      setError(message);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const fileSize = audioFile ? (audioFile.size / 1024 / 1024).toFixed(2) : '0';

  const toggleGroupSelected = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Transcribe Audio</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">File</p>
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {fileName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{fileSize} MB</p>
            </div>
          </div>

          {/* Editable transcription title */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Title <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              placeholder="Give this transcription a name…"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Collection picker */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-gray-400" />
              Collection <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">— No collection —</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Recording Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRecordingType('record')}
                disabled={isSubmitting}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                  recordingType === 'record'
                    ? 'bg-sky-100 dark:bg-sky-900/40 border-sky-400 dark:border-sky-600 text-sky-700 dark:text-sky-300'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                }`}
              >
                Record
                <span className="block text-xs font-normal mt-0.5 opacity-70">Multi-speaker, diarization</span>
              </button>
              <button
                type="button"
                onClick={() => setRecordingType('whisper')}
                disabled={isSubmitting}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                  recordingType === 'whisper'
                    ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                }`}
              >
                Whisper
                <span className="block text-xs font-normal mt-0.5 opacity-70">Voice memo, single speaker</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {keepAudioAllowed && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepAudio}
                    onChange={(e) => setKeepAudio(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <Server className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Save audio on server
                  </span>
                </label>
                {keepAudio && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-6 pl-4">
                    Audio will be saved on the server and playable from the transcription. Anyone with access to the transcript can listen.
                  </p>
                )}
              </>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSummarize}
                onChange={(e) => setAutoSummarize(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-summarize after transcription
              </span>
            </label>
          </div>

          {autoSummarize && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                Summary Template
              </label>
              <TemplateSelector
                templates={templates}
                value={selectedTemplate}
                onChange={setSelectedTemplate}
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Share with groups (collapsible) */}
          {groups.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <button
                type="button"
                onClick={() => setShowGroupShare((v) => !v)}
                disabled={isSubmitting}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-gray-400" />
                  Share with groups
                  {selectedGroupIds.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-blue-600 dark:text-blue-400">
                      ({selectedGroupIds.length} selected)
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">{showGroupShare ? 'Hide' : 'Show'}</span>
              </button>

              {showGroupShare && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Permission</span>
                    <select
                      value={groupSharePermission}
                      onChange={(e) =>
                        setGroupSharePermission(e.target.value as 'read' | 'write')
                      }
                      disabled={isSubmitting}
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    >
                      <option value="read">Can view</option>
                      <option value="write">Can edit</option>
                    </select>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {groups.map((g) => {
                      const checked = selectedGroupIds.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGroupSelected(g.id)}
                            disabled={isSubmitting}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          />
                          <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {g.name}
                          </span>
                          <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                            {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {submittedTranscription ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Sent to queue!
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  {submittedTranscription.queue_position
                    ? `Position ${submittedTranscription.queue_position} — track progress from the queue icon in the header`
                    : 'Track progress from the queue icon in the header'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSubmittedTranscription(null);
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const id = submittedTranscription.id;
                  setSubmittedTranscription(null);
                  onClose();
                  navigate(`/transcriptions/${id}`);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View Status
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !audioFile}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Sending...' : autoSummarize ? 'Transcribe & Summarize' : 'Transcribe'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
