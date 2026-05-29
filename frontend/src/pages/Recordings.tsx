import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { useDeviceConnection } from '@/hooks/useDeviceConnection';
import { useAppStore } from '@/store/useAppStore';
import { TranscribeModal } from '@/components/TranscribeModal';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Collection, Transcription } from '@/types';
import { deviceService } from '@/services/deviceService';
import { transcriptionsApi } from '@/api/transcriptions';
import { collectionsApi } from '@/api/collections';
import { recordingAliasesApi } from '@/api/recordingAliases';
import { Play, Download, Trash2, Zap, FileText, AlertCircle, Pencil, X, CheckCircle, FolderOpen, TriangleAlert, Server, ServerOff, Mic, MessageSquare, Loader } from 'lucide-react';
import type { RecordingType } from '@/types';

/** Detect recording type from HiDock filename convention.
 *  Filenames like "2026Apr12-122705-Wip08.hda" contain the type marker after the timestamp. */
function detectRecordingType(fileName: string): RecordingType {
  return /wip/i.test(fileName) ? 'whisper' : 'record';
}
import { format } from 'date-fns';
import { settingsApi } from '@/api/settings';

/* ── Delete confirmation modal ────────────────────────────────────── */
interface DeleteModalProps {
  /** Label shown as the recording name */
  recordingName: string;
  /** Whether a linked transcript exists */
  hasTranscript: boolean;
  /** Whether audio is kept server-side */
  hasServerAudio: boolean;
  onConfirm: (deleteTranscript: boolean, deleteServerAudio: boolean) => void;
  onCancel: () => void;
}

function DeleteRecordingModal({ recordingName, hasTranscript, hasServerAudio, onConfirm, onCancel }: DeleteModalProps) {
  const [alsoDeleteTranscript, setAlsoDeleteTranscript] = useState(false);
  const [alsoDeleteServerAudio, setAlsoDeleteServerAudio] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Recording</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">"{recordingName}"</span>{' '}
              from the device? This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {hasServerAudio && (
            <label className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-lg cursor-pointer hover:bg-blue-100/60 dark:hover:bg-blue-900/25 transition-colors">
              <input
                type="checkbox"
                checked={alsoDeleteServerAudio}
                onChange={(e) => setAlsoDeleteServerAudio(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500"
              />
              <div>
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Also delete audio from server
                </span>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  Audio is saved on your server. Uncheck to keep it accessible from the transcript.
                </p>
              </div>
            </label>
          )}

          {hasTranscript && (
            <label className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/25 transition-colors">
              <input
                type="checkbox"
                checked={alsoDeleteTranscript}
                onChange={(e) => setAlsoDeleteTranscript(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500"
              />
              <div>
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Also delete associated transcription
                </span>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  This recording has a linked transcription. Check this box to delete it as well.
                </p>
              </div>
            </label>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(alsoDeleteTranscript, alsoDeleteServerAudio)}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Batch delete confirmation modal ──────────────────────────────── */
interface BatchDeleteModalProps {
  count: number;
  withTranscriptsCount: number;
  onConfirm: (deleteTranscripts: boolean) => void;
  onCancel: () => void;
}

function BatchDeleteModal({ count, withTranscriptsCount, onConfirm, onCancel }: BatchDeleteModalProps) {
  const [alsoDeleteTranscripts, setAlsoDeleteTranscripts] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete {count} Recording{count !== 1 ? 's' : ''}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Are you sure you want to delete {count} recording{count !== 1 ? 's' : ''}? This action cannot be undone.
            </p>
          </div>
        </div>

        {withTranscriptsCount > 0 && (
          <label className="flex items-start gap-3 p-3 mb-4 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/25 transition-colors">
            <input
              type="checkbox"
              checked={alsoDeleteTranscripts}
              onChange={(e) => setAlsoDeleteTranscripts(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-red-600 focus:ring-2 focus:ring-red-500"
            />
            <div>
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Also delete associated transcriptions ({withTranscriptsCount})
              </span>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {withTranscriptsCount} of {count} recording{count !== 1 ? 's have' : ' has'} linked transcriptions.
              </p>
            </div>
          </label>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(alsoDeleteTranscripts)}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete {count}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Recordings() {
  const device = useAppStore((s) => s.device);
  const recordings = useAppStore((s) => s.recordings);
  const selectedRecordings = useAppStore((s) => s.selectedRecordings);
  const recordingAliases = useAppStore((s) => s.recordingAliases);
  const recordingCollections = useAppStore((s) => s.recordingCollections);
  const { toggleRecordingSelection, clearSelectedRecordings, setRecordingAliases, setRecordingAlias, removeRecordingAlias, cleanOrphanAliases } = useAppStore();

  const {
    connectDevice,
    refreshRecordings,
    downloadRecording,
    deleteRecording,
    formatDevice,
    isLoading,
    error,
  } = useDeviceConnection();

  const [transcribeModal, setTranscribeModal] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<Blob | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [playingFile, setPlayingFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const [transcriptMap, setTranscriptMap] = useState<Record<string, { id: string; status: string; title: string | null; keep_audio: boolean; audio_available: boolean }>>({});
  const [keepAudioEnabled, setKeepAudioEnabled] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | RecordingType>('all');

  // Collections for batch assign
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);

  // Server-only recordings (audio available but not on device)
  const [serverOnlyRecordings, setServerOnlyRecordings] = useState<Transcription[]>([]);

  // Phase 6 follow-up — multi-select combine state. ``combineOrder``
  // is an ORDERED list of recording IDs; index 0 plays first.
  const [combineMode, setCombineMode] = useState(false);
  const [combineOrder, setCombineOrder] = useState<string[]>([]);
  const [isCombining, setIsCombining] = useState(false);
  const [combineError, setCombineError] = useState<string | null>(null);

  // Delete modals
  const [deleteModalFile, setDeleteModalFile] = useState<string | null>(null);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);

  // Orphan alias detection
  const currentFileNames = recordings.map((r) => r.fileName);
  const orphanAliasKeys = Object.keys(recordingAliases).filter(
    (key) => !currentFileNames.includes(key)
  );
  const orphanCount = orphanAliasKeys.length;

  const startEditingAlias = useCallback((fileName: string) => {
    setEditingAlias(fileName);
    setAliasInput(recordingAliases[fileName] || '');
    setTimeout(() => aliasInputRef.current?.focus(), 0);
  }, [recordingAliases]);

  const saveAlias = useCallback(() => {
    if (editingAlias === null) return;
    const trimmed = aliasInput.trim();
    // Optimistic update in store
    if (trimmed) {
      setRecordingAlias(editingAlias, trimmed);
    } else {
      removeRecordingAlias(editingAlias);
    }
    setEditingAlias(null);
    setAliasInput('');
    // Persist to server (fire-and-forget; store is source of truth for UI)
    const nextAliases = trimmed
      ? { ...recordingAliases, [editingAlias]: trimmed }
      : (() => { const { [editingAlias]: _, ...rest } = recordingAliases; return rest; })();
    recordingAliasesApi.saveAll(nextAliases).catch(console.error);
  }, [editingAlias, aliasInput, setRecordingAlias, removeRecordingAlias, recordingAliases]);

  const cancelEditingAlias = useCallback(() => {
    setEditingAlias(null);
    setAliasInput('');
  }, []);

  const handleAliasKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveAlias();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditingAlias();
    }
  }, [saveAlias, cancelEditingAlias]);

  const handleCleanOrphanAliases = useCallback(() => {
    const count = orphanCount;
    cleanOrphanAliases(currentFileNames);
    alert(`Cleaned ${count} orphan alias${count !== 1 ? 'es' : ''}.`);
  }, [cleanOrphanAliases, currentFileNames, orphanCount]);

  useEffect(() => {
    if (device?.connected) {
      refreshRecordings();
    }
  }, [device?.connected, refreshRecordings]);

  // Check which recordings have transcriptions
  useEffect(() => {
    if (recordings.length === 0) return;
    const filenames = recordings.map((r) => r.fileName);
    transcriptionsApi.checkByFilenames(filenames).then(setTranscriptMap).catch(console.error);
  }, [recordings]);

  // Load collections for batch assign
  useEffect(() => {
    collectionsApi.list().then(setCollections).catch(console.error);
  }, []);

  // Load recording aliases from server on mount
  useEffect(() => {
    recordingAliasesApi.getAll().then(setRecordingAliases).catch(console.error);
  }, []);

  // Load keep_audio admin setting
  useEffect(() => {
    settingsApi.getAudioSettings()
      .then((s) => setKeepAudioEnabled(s.keep_audio_enabled))
      .catch(console.error);
  }, []);

  // Load server-only recordings (audio on server but not on device)
  useEffect(() => {
    transcriptionsApi.getTranscriptions(0, 100, 'newest', 'mine')
      .then((res) => {
        const deviceFileNames = new Set(recordings.map((r) => r.fileName));
        const serverOnly = res.items.filter(
          (t) => t.audio_available && !deviceFileNames.has(t.original_filename)
        );
        setServerOnlyRecordings(serverOnly);
      })
      .catch(console.error);
  }, [recordings]);

  const getOrDownloadBlob = async (
    recordingId: string, fileName: string, fileSize: number, fileVersion?: number
  ): Promise<Blob | null> => {
    const cached = deviceService.getCachedBlob(fileName);
    if (cached) {
      setDownloadProgress((prev) => ({ ...prev, [recordingId]: 100 }));
      return cached;
    }
    const blob = await downloadRecording(fileName, fileSize, (percent) => {
      setDownloadProgress((prev) => ({ ...prev, [recordingId]: percent }));
    }, fileVersion);
    if (blob) {
      deviceService.setCachedBlob(fileName, blob);
    }
    return blob;
  };

  const handlePlayRecording = async (recordingId: string, fileName: string, fileSize: number, fileVersion?: number) => {
    const blob = await getOrDownloadBlob(recordingId, fileName, fileSize, fileVersion);
    if (blob) {
      setPlayingFile({ blob, name: fileName });
    }
  };

  const handleTranscribeRecording = async (recordingId: string, fileName: string, fileSize: number, summarize = false, fileVersion?: number) => {
    setAutoSummarize(summarize);
    const blob = await getOrDownloadBlob(recordingId, fileName, fileSize, fileVersion);
    if (blob) {
      setSelectedAudio(blob);
      setSelectedFileName(fileName);
      setTranscribeModal(true);
    }
  };

  // Phase 6 follow-up — pull the recording from the device and hand
  // it to the user's browser as a Save dialog. Re-uses the same
  // download path so the blob is cached for any later Play/Transcribe.
  const handleSaveRecordingToDisk = async (
    recordingId: string, fileName: string, fileSize: number, fileVersion?: number,
  ) => {
    try {
      const blob = await getOrDownloadBlob(recordingId, fileName, fileSize, fileVersion);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      alert(`Could not save recording: ${err instanceof Error ? err.message : err}`);
    }
  };

  // Phase 6 follow-up — combine multi-select helpers.
  const toggleCombineSelect = (recordingId: string) => {
    setCombineOrder((prev) =>
      prev.includes(recordingId) ? prev.filter((x) => x !== recordingId) : [...prev, recordingId],
    );
  };

  const exitCombineMode = () => {
    setCombineMode(false);
    setCombineOrder([]);
    setCombineError(null);
  };

  const moveCombineItem = (recordingId: string, direction: -1 | 1) => {
    setCombineOrder((prev) => {
      const i = prev.indexOf(recordingId);
      if (i < 0) return prev;
      const j = i + direction;
      if (j < 0 || j >= prev.length) return prev;
      const copy = prev.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const handleCombineTranscribe = async () => {
    if (combineOrder.length < 2) return;
    setCombineError(null);
    setIsCombining(true);
    try {
      // 1. Resolve the recordings in the chosen order to download them.
      const ordered = combineOrder
        .map((id) => recordings.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      if (ordered.length !== combineOrder.length) {
        throw new Error('One of the selected recordings is no longer on the device.');
      }

      // 2. Pull each blob from the device (re-uses cache if already downloaded).
      const parts: Array<{ blob: Blob; fileName: string }> = [];
      for (const rec of ordered) {
        const blob = await getOrDownloadBlob(rec.id, rec.fileName, rec.size, rec.fileVersion);
        if (!blob) throw new Error(`Failed to download "${rec.fileName}" from device.`);
        parts.push({ blob, fileName: rec.fileName });
      }

      // 3. Send to backend. Title built from the first file + count of the rest.
      const title = `Combined: ${ordered[0].fileName} + ${ordered.length - 1} more`;
      const recordingType: RecordingType = detectRecordingType(ordered[0].fileName);
      await transcriptionsApi.queueCombined(parts, {
        title,
        language: 'auto',
        keepAudio: false,
        recordingType,
      });
      exitCombineMode();
    } catch (err) {
      setCombineError(err instanceof Error ? err.message : 'Combine failed');
    } finally {
      setIsCombining(false);
    }
  };

  const handleDeleteRecording = (fileName: string) => {
    setDeleteModalFile(fileName);
  };

  const confirmDeleteRecording = async (fileName: string, deleteTranscript: boolean, deleteServerAudio: boolean) => {
    setDeleteModalFile(null);
    await deleteRecording(fileName);

    const transcript = transcriptMap[fileName];
    if (transcript) {
      // Turn off keep_audio (deletes server file) if requested
      if (deleteServerAudio && transcript.keep_audio && transcript.audio_available) {
        try {
          await transcriptionsApi.toggleKeepAudio(transcript.id, false);
          setTranscriptMap((prev) => ({
            ...prev,
            [fileName]: { ...prev[fileName], keep_audio: false, audio_available: false },
          }));
        } catch (err) {
          console.error('Failed to delete server audio:', err);
        }
      }

      if (deleteTranscript) {
        try {
          await transcriptionsApi.deleteTranscription(transcript.id);
          setTranscriptMap((prev) => {
            const next = { ...prev };
            delete next[fileName];
            return next;
          });
        } catch (err) {
          console.error('Failed to delete transcript:', err);
        }
      }
    }
  };

  const handleBatchDelete = () => {
    setShowBatchDeleteModal(true);
  };

  const confirmBatchDelete = async (deleteTranscripts: boolean) => {
    setShowBatchDeleteModal(false);
    const selected = recordings.filter((r) => selectedRecordings.includes(r.id));

    for (const rec of selected) {
      try {
        await deleteRecording(rec.fileName);
        if (deleteTranscripts && transcriptMap[rec.fileName]) {
          await transcriptionsApi.deleteTranscription(transcriptMap[rec.fileName].id);
        }
      } catch (err) {
        console.error(`Failed to delete ${rec.fileName}:`, err);
      }
    }

    clearSelectedRecordings();
    await refreshRecordings();
  };

  const handleToggleKeepAudio = async (fileName: string, keepAudio: boolean) => {
    const transcript = transcriptMap[fileName];
    if (!transcript) return;
    try {
      await transcriptionsApi.toggleKeepAudio(transcript.id, keepAudio);
      setTranscriptMap((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          keep_audio: keepAudio,
          audio_available: keepAudio ? prev[fileName].audio_available : false,
        },
      }));
    } catch (err) {
      console.error('Failed to toggle keep audio:', err);
    }
  };

  const handleBatchAddToCollection = async (collectionId: string) => {
    const selected = recordings.filter((r) => selectedRecordings.includes(r.id));
    let assignedCount = 0;

    for (const rec of selected) {
      const transcript = transcriptMap[rec.fileName];
      if (transcript) {
        try {
          await collectionsApi.assignTranscription(collectionId, transcript.id);
          assignedCount++;
        } catch (err) {
          console.error(`Failed to assign ${rec.fileName}:`, err);
        }
      }
    }

    setShowCollectionPicker(false);
    // Reload collections for updated count
    collectionsApi.list().then(setCollections).catch(console.error);
    alert(`Added ${assignedCount} transcription${assignedCount !== 1 ? 's' : ''} to collection.${selected.length - assignedCount > 0 ? ` ${selected.length - assignedCount} recording(s) had no transcription and were skipped.` : ''}`);
  };

  const handleSelectAll = () => {
    if (selectedRecordings.length === recordings.length) {
      clearSelectedRecordings();
    } else {
      recordings.forEach((r) => {
        if (!selectedRecordings.includes(r.id)) {
          toggleRecordingSelection(r.id);
        }
      });
    }
  };

  if (!device?.connected) {
    return (
      <Layout title="Recordings">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No Device Connected
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please connect your HiDock device to access recordings
          </p>
          <button
            onClick={connectDevice}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Connecting...' : 'Connect Device'}
          </button>
        </div>
      </Layout>
    );
  }

  const storagePercent = device.storageInfo
    ? (device.storageInfo.usedSpace / device.storageInfo.totalSpace) * 100
    : 0;

  const hasSelection = selectedRecordings.length > 0;
  const filteredRecordings = typeFilter === 'all'
    ? recordings
    : recordings.filter((r) => detectRecordingType(r.fileName) === typeFilter);
  const filteredServerOnly = typeFilter === 'all'
    ? serverOnlyRecordings
    : serverOnlyRecordings.filter((t) => (t.recording_type || detectRecordingType(t.original_filename)) === typeFilter);

  return (
    <Layout title="Recordings">
      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Total Recordings
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {recordings.length}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Device Storage
          </h3>
          <p className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            {device.storageInfo
              ? `${(device.storageInfo.usedSpace / 1024 / 1024 / 1024).toFixed(1)}/${(device.storageInfo.totalSpace / 1024 / 1024 / 1024).toFixed(1)} GB`
              : 'N/A'}
          </p>
          <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${storagePercent}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">
            Actions
          </h3>
          <button
            onClick={() => refreshRecordings()}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 mb-2"
          >
            Refresh
          </button>
          <button
            onClick={() => {
              if (window.confirm('This will erase all files. Continue?')) {
                formatDevice();
              }
            }}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 mb-2"
          >
            Format Device
          </button>
          {orphanCount > 0 && (
            <button
              onClick={handleCleanOrphanAliases}
              className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Clean {orphanCount} orphan alias{orphanCount !== 1 ? 'es' : ''}
            </button>
          )}
        </div>
      </div>

      {playingFile && (
        <div className="mb-6">
          <AudioPlayer src={playingFile.blob} fileName={playingFile.name} />
        </div>
      )}

      {/* Recording type filter tabs */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
          {([['all', 'All'], ['record', 'Records'], ['whisper', 'Whispers']] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                typeFilter === value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {value === 'record' && <Mic className="w-3.5 h-3.5" />}
              {value === 'whisper' && <MessageSquare className="w-3.5 h-3.5" />}
              {label}
            </button>
          ))}
        </div>

        {/* Phase 6 follow-up — combine multi-select toggle */}
        <button
          onClick={() => (combineMode ? exitCombineMode() : setCombineMode(true))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
            combineMode
              ? 'bg-primary-500 text-white border-primary-500'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          title="Pick multiple recordings to transcribe as one"
        >
          <Zap className="w-3.5 h-3.5" />
          {combineMode ? 'Cancel combine' : 'Combine...'}
        </button>
      </div>

      {/* Phase 6 follow-up — combine order panel */}
      {combineMode && (
        <div className="mb-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                Combine {combineOrder.length} recording{combineOrder.length === 1 ? '' : 's'} into one transcription
              </p>
              <p className="text-xs text-primary-600/80 dark:text-primary-300/70 mt-0.5">
                Click rows below to add. Reorder with the arrows — playback order is top to bottom.
              </p>
              {combineError && (
                <div className="mt-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {combineError}
                </div>
              )}
              {combineOrder.length > 0 && (
                <ol className="mt-3 space-y-1">
                  {combineOrder.map((id, idx) => {
                    const rec = recordings.find((r) => r.id === id);
                    if (!rec) return null;
                    return (
                      <li key={id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 rounded px-2 py-1">
                        <span className="text-xs text-gray-400 font-mono w-5 text-right">{idx + 1}.</span>
                        <span className="flex-1 truncate">{rec.fileName}</span>
                        <button
                          onClick={() => moveCombineItem(id, -1)}
                          disabled={idx === 0 || isCombining}
                          className="px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveCombineItem(id, 1)}
                          disabled={idx === combineOrder.length - 1 || isCombining}
                          className="px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => toggleCombineSelect(id)}
                          disabled={isCombining}
                          className="px-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCombineTranscribe}
                disabled={combineOrder.length < 2 || isCombining}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-md font-medium disabled:opacity-50 transition-colors"
              >
                {isCombining ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isCombining ? 'Working...' : 'Transcribe as one'}
              </button>
              <button
                onClick={exitCombineMode}
                disabled={isCombining}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch action bar */}
      {hasSelection && (
        <div className="mb-4 flex items-center flex-wrap gap-x-3 gap-y-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedRecordings.length} selected
          </span>
          <div className="flex items-center flex-wrap gap-2 ml-auto">
            <div className="relative">
              <button
                onClick={() => setShowCollectionPicker(!showCollectionPicker)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Add to Collection
              </button>
              {showCollectionPicker && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                  {collections.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-500">No collections yet</p>
                  ) : (
                    collections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleBatchAddToCollection(c.id)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: c.color || '#3b82f6' }}
                        />
                        <span className="truncate">{c.name}</span>
                        <span className="text-xs text-gray-400 ml-auto">{c.transcription_count}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
            <button
              onClick={clearSelectedRecordings}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Device Recordings</h2>
          {filteredRecordings.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRecordings.length === filteredRecordings.length && filteredRecordings.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Select All</span>
            </label>
          )}
        </div>

        {filteredRecordings.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            {typeFilter === 'all' ? 'No recordings found on device' : `No ${typeFilter === 'whisper' ? 'whisper' : 'record'} recordings found`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selectedRecordings.length === filteredRecordings.length && filteredRecordings.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRecordings.map((recording) => {
                  const progress = downloadProgress[recording.id] || 0;
                  const isDownloading = progress > 0 && progress < 100;
                  const recType = detectRecordingType(recording.fileName);

                  return (
                    <tr
                      key={recording.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        combineMode && combineOrder.includes(recording.id)
                          ? 'bg-primary-50/50 dark:bg-primary-900/10'
                          : selectedRecordings.includes(recording.id)
                            ? 'bg-blue-50/50 dark:bg-blue-900/10'
                            : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        {combineMode ? (
                          // Phase 6 follow-up — combine selection checkbox
                          <input
                            type="checkbox"
                            checked={combineOrder.includes(recording.id)}
                            onChange={() => toggleCombineSelect(recording.id)}
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedRecordings.includes(recording.id)}
                            onChange={() => toggleRecordingSelection(recording.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {editingAlias === recording.fileName ? (
                          <input
                            ref={aliasInputRef}
                            type="text"
                            value={aliasInput}
                            onChange={(e) => setAliasInput(e.target.value)}
                            onKeyDown={handleAliasKeyDown}
                            onBlur={saveAlias}
                            placeholder="Enter alias..."
                            className="w-full px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-blue-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        ) : (
                          <div
                            className="group cursor-pointer flex items-center gap-1.5"
                            onClick={() => startEditingAlias(recording.fileName)}
                            title="Click to edit alias"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-gray-900 dark:text-white block truncate">
                                {recordingAliases[recording.fileName] || recording.fileName}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                  recType === 'whisper'
                                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                                    : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                                }`}>
                                  {recType === 'whisper' ? <MessageSquare className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                                  {recType}
                                </span>
                                {recordingAliases[recording.fileName] && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                    {recording.fileName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {(recording.size / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {recording.duration >= 60
                          ? `${Math.floor(recording.duration / 60)}m ${Math.round(recording.duration % 60)}s`
                          : `${Math.round(recording.duration)}s`}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {format(recording.dateCreated, 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {transcriptMap[recording.fileName] ? (
                            <>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                  transcriptMap[recording.fileName].status === 'completed'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                    : transcriptMap[recording.fileName].status === 'processing'
                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                    : transcriptMap[recording.fileName].status === 'failed'
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}
                                title={transcriptMap[recording.fileName].title || transcriptMap[recording.fileName].status}
                              >
                                <CheckCircle className="w-3 h-3" />
                                {transcriptMap[recording.fileName].status === 'completed' ? 'Transcribed' : transcriptMap[recording.fileName].status}
                              </span>
                              {transcriptMap[recording.fileName].status === 'completed' && keepAudioEnabled && (
                                <button
                                  onClick={() => handleToggleKeepAudio(
                                    recording.fileName,
                                    !transcriptMap[recording.fileName].keep_audio
                                  )}
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                                    transcriptMap[recording.fileName].keep_audio
                                      ? transcriptMap[recording.fileName].audio_available
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                                  title={
                                    transcriptMap[recording.fileName].keep_audio
                                      ? transcriptMap[recording.fileName].audio_available
                                        ? 'Audio saved on server — click to remove'
                                        : 'Audio saving enabled (not yet available)'
                                      : 'Click to save audio on server'
                                  }
                                >
                                  {transcriptMap[recording.fileName].keep_audio && transcriptMap[recording.fileName].audio_available ? (
                                    <><Server className="w-3 h-3" /> On server</>
                                  ) : transcriptMap[recording.fileName].keep_audio ? (
                                    <><Server className="w-3 h-3" /> Saving...</>
                                  ) : (
                                    <><ServerOff className="w-3 h-3" /> Not saved</>
                                  )}
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isDownloading && (
                            <span className="text-xs text-gray-500">{progress}%</span>
                          )}
                          <button
                            onClick={() => handlePlayRecording(recording.id, recording.fileName, recording.size, recording.fileVersion)}
                            disabled={isLoading || isDownloading}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400 disabled:opacity-50"
                            title="Play"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleTranscribeRecording(recording.id, recording.fileName, recording.size, false, recording.fileVersion)}
                            disabled={isLoading || isDownloading}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400 disabled:opacity-50"
                            title="Transcribe"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleTranscribeRecording(recording.id, recording.fileName, recording.size, true, recording.fileVersion)}
                            disabled={isLoading || isDownloading}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400 disabled:opacity-50"
                            title="Transcribe & Summarize"
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSaveRecordingToDisk(recording.id, recording.fileName, recording.size, recording.fileVersion)}
                            disabled={isLoading || isDownloading}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400 disabled:opacity-50"
                            title="Save to disk"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecording(recording.fileName)}
                            disabled={isLoading || isDownloading}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600 dark:text-red-400 disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Server-only recordings (not on device but audio available) */}
      {filteredServerOnly.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mt-6">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Server-Only Audio</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({filteredServerOnly.length} recording{filteredServerOnly.length !== 1 ? 's' : ''} not on device)
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Audio
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredServerOnly.map((t) => {
                  const serverRecType = t.recording_type || detectRecordingType(t.original_filename);
                  return (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 dark:text-white block truncate">
                          {t.title || t.original_filename}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            serverRecType === 'whisper'
                              ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                              : 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                          }`}>
                            {serverRecType === 'whisper' ? <MessageSquare className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                            {serverRecType}
                          </span>
                          {t.title && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                              {t.original_filename}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {t.audio_duration
                        ? t.audio_duration >= 60
                          ? `${Math.floor(t.audio_duration / 60)}m ${Math.round(t.audio_duration % 60)}s`
                          : `${Math.round(t.audio_duration)}s`
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(t.created_at), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        <Server className="w-3 h-3" />
                        On server only
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const blobUrl = await transcriptionsApi.getAudioBlobUrl(t.id);
                              const blob = await fetch(blobUrl).then((r) => r.blob());
                              setPlayingFile({ blob, name: t.original_filename });
                            } catch (err) {
                              console.error('Failed to load audio:', err);
                            }
                          }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400"
                          title="Play from server"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(`/transcriptions/${t.id}`, '_self')}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-400"
                          title="View transcript"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm('Remove server audio? The transcription will be kept.')) {
                              try {
                                await transcriptionsApi.toggleKeepAudio(t.id, false);
                                setServerOnlyRecordings((prev) => prev.filter((r) => r.id !== t.id));
                              } catch (err) {
                                console.error('Failed to remove audio:', err);
                              }
                            }
                          }}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600 dark:text-red-400"
                          title="Remove server audio"
                        >
                          <ServerOff className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TranscribeModal
        isOpen={transcribeModal}
        onClose={() => {
          setTranscribeModal(false);
          setSelectedAudio(null);
          setAutoSummarize(false);
        }}
        audioFile={selectedAudio}
        fileName={selectedFileName}
        initialTitle={recordingAliases[selectedFileName] || undefined}
        initialCollectionId={recordingCollections[selectedFileName] || undefined}
        onComplete={() => {
          refreshRecordings();
        }}
      />

      {/* Single delete modal */}
      {deleteModalFile && (
        <DeleteRecordingModal
          recordingName={recordingAliases[deleteModalFile] || deleteModalFile}
          hasTranscript={!!transcriptMap[deleteModalFile]}
          hasServerAudio={!!(transcriptMap[deleteModalFile]?.keep_audio && transcriptMap[deleteModalFile]?.audio_available)}
          onConfirm={(deleteTranscript, deleteServerAudio) => confirmDeleteRecording(deleteModalFile, deleteTranscript, deleteServerAudio)}
          onCancel={() => setDeleteModalFile(null)}
        />
      )}

      {/* Batch delete modal */}
      {showBatchDeleteModal && (
        <BatchDeleteModal
          count={selectedRecordings.length}
          withTranscriptsCount={
            recordings
              .filter((r) => selectedRecordings.includes(r.id))
              .filter((r) => transcriptMap[r.fileName]).length
          }
          onConfirm={confirmBatchDelete}
          onCancel={() => setShowBatchDeleteModal(false)}
        />
      )}
    </Layout>
  );
}
