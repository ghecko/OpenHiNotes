import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { useDeviceConnection } from '@/hooks/useDeviceConnection';
import { useAppStore } from '@/store/useAppStore';
import { TranscribeModal } from '@/components/TranscribeModal';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Collection } from '@/types';
import { deviceService } from '@/services/deviceService';
import { transcriptionsApi } from '@/api/transcriptions';
import { collectionsApi } from '@/api/collections';
import { Play, Download, Trash2, Zap, FileText, AlertCircle, Pencil, X, CheckCircle, FolderOpen, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';

/* ── Delete confirmation modal ────────────────────────────────────── */
interface DeleteModalProps {
  /** Label shown as the recording name */
  recordingName: string;
  /** Whether a linked transcript exists */
  hasTranscript: boolean;
  onConfirm: (deleteTranscript: boolean) => void;
  onCancel: () => void;
}

function DeleteRecordingModal({ recordingName, hasTranscript, onConfirm, onCancel }: DeleteModalProps) {
  const [alsoDeleteTranscript, setAlsoDeleteTranscript] = useState(false);

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
              <span className="font-medium text-gray-700 dark:text-gray-300">"{recordingName}"</span>?
              This action cannot be undone.
            </p>
          </div>
        </div>

        {hasTranscript && (
          <label className="flex items-start gap-3 p-3 mb-4 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/25 transition-colors">
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

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(alsoDeleteTranscript)}
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
  const { toggleRecordingSelection, clearSelectedRecordings, setRecordingAlias, removeRecordingAlias, cleanOrphanAliases } = useAppStore();

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
  const [transcriptMap, setTranscriptMap] = useState<Record<string, { id: string; status: string; title: string | null }>>({});

  // Collections for batch assign
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);

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
    if (trimmed) {
      setRecordingAlias(editingAlias, trimmed);
    } else {
      removeRecordingAlias(editingAlias);
    }
    setEditingAlias(null);
    setAliasInput('');
  }, [editingAlias, aliasInput, setRecordingAlias, removeRecordingAlias]);

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

  const handleDeleteRecording = (fileName: string) => {
    setDeleteModalFile(fileName);
  };

  const confirmDeleteRecording = async (fileName: string, deleteTranscript: boolean) => {
    setDeleteModalFile(null);
    await deleteRecording(fileName);

    if (deleteTranscript && transcriptMap[fileName]) {
      try {
        await transcriptionsApi.deleteTranscription(transcriptMap[fileName].id);
        setTranscriptMap((prev) => {
          const next = { ...prev };
          delete next[fileName];
          return next;
        });
      } catch (err) {
        console.error('Failed to delete transcript:', err);
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

  return (
    <Layout title="Recordings" deviceConnected={device?.connected}>
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

      {/* Batch action bar */}
      {hasSelection && (
        <div className="mb-4 flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedRecordings.length} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
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
          {recordings.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRecordings.length === recordings.length && recordings.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Select All</span>
            </label>
          )}
        </div>

        {recordings.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            No recordings found on device
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selectedRecordings.length === recordings.length && recordings.length > 0}
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
                    Transcript
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {recordings.map((recording) => {
                  const progress = downloadProgress[recording.id] || 0;
                  const isDownloading = progress > 0 && progress < 100;

                  return (
                    <tr
                      key={recording.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedRecordings.includes(recording.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedRecordings.includes(recording.id)}
                          onChange={() => toggleRecordingSelection(recording.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
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
                              {recordingAliases[recording.fileName] && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 block truncate">
                                  {recording.fileName}
                                </span>
                              )}
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
                        {transcriptMap[recording.fileName] ? (
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
                            {transcriptMap[recording.fileName].status === 'completed' ? 'Yes' : transcriptMap[recording.fileName].status}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                        )}
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
          onConfirm={(deleteTranscript) => confirmDeleteRecording(deleteModalFile, deleteTranscript)}
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
