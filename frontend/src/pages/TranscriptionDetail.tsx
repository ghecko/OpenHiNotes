import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { TranscriptionViewer } from '@/components/TranscriptionViewer';
import { SpeakerEditor } from '@/components/SpeakerEditor';
import { ChatPanel } from '@/components/ChatPanel';
import { transcriptionsApi } from '@/api/transcriptions';
import { summariesApi } from '@/api/summaries';
import { templatesApi } from '@/api/templates';
import { collectionsApi } from '@/api/collections';
import { useAppStore } from '@/store/useAppStore';
import { useDeviceConnection } from '@/hooks/useDeviceConnection';
import { deviceService } from '@/services/deviceService';
import { Transcription, Summary, SummaryTemplate, Collection } from '@/types';
import { format } from 'date-fns';
import { Save, Loader, Plus, Pencil, Trash2, X, FileText, Maximize2, Download, Play, Pause, Volume2, Disc3, Share2, Lock, Eye, ChevronDown } from 'lucide-react';
import { ShareModal } from '@/components/ShareModal';
import { InteractiveMarkdown } from '@/components/InteractiveMarkdown';
import { TemplateSelector } from '@/components/TemplateSelector';

function SummaryModal({
  summary,
  onClose,
  onDelete,
  onContentChange,
}: {
  summary: Summary;
  onClose: () => void;
  onDelete: (id: string) => void;
  onContentChange?: (newContent: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Summary</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {format(new Date(summary.created_at), 'MMM d, yyyy HH:mm')} &bull; {summary.model_used}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(summary.id)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete summary"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <InteractiveMarkdown
            content={summary.content}
            onContentChange={onContentChange}
            className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed markdown-content"
          />
        </div>
      </div>
    </div>
  );
}

export function TranscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [showSpeakerEditor, setShowSpeakerEditor] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [openSummaryId, setOpenSummaryId] = useState<string | null>(null);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // Collection assignment
  const [collections, setCollections] = useState<Collection[]>([]);

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false);

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Derived permission
  const permissionLevel = transcription?.permission_level || 'owner';
  const canEdit = permissionLevel === 'owner' || permissionLevel === 'write';
  const isWhisper = transcription?.recording_type === 'whisper';
  const isOwner = permissionLevel === 'owner';

  // Audio playback
  const recordings = useAppStore((s) => s.recordings);
  const { downloadRecording, device } = useDeviceConnection();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioSrc, setAudioSrc] = useState<string>('');
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [loadAudioProgress, setLoadAudioProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Subscribe to real-time updates when transcription is queued/processing
  useEffect(() => {
    if (!transcription) return;
    if (transcription.status !== 'queued' && transcription.status !== 'processing') return;

    const abort = transcriptionsApi.streamQueueStatus(
      transcription.id,
      (event) => {
        setTranscription((prev) => {
          if (!prev) return prev;
          const updates: Partial<Transcription> = {};
          if (event.progress != null) updates.progress = event.progress;
          if (event.stage !== undefined) updates.progress_stage = event.stage ?? null;
          if (event.queue_position != null) updates.queue_position = event.queue_position;
          if (event.status) updates.status = event.status as Transcription['status'];
          if (event.event === 'completed' || event.event === 'failed' || event.event === 'cancelled') {
            // Reload full data when done
            setTimeout(() => loadData(), 500);
          }
          return { ...prev, ...updates };
        });
      },
      (err) => console.error('Queue stream error:', err),
    );

    return () => abort();
  }, [transcription?.id, transcription?.status]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const t = await transcriptionsApi.getTranscription(id);
      setTranscription(t);
      setNotes(t.notes || '');

      const s = await summariesApi.getSummaries(id);
      setSummaries(s);

      const recType = t.recording_type === 'whisper' ? 'whisper' : 'record';
      const temps = await templatesApi.getTemplates(false, showAllTemplates ? undefined : recType);
      setTemplates(temps);

      const colls = await collectionsApi.list();
      setCollections(colls);
      if (temps.length > 0) {
        setSelectedTemplate(temps[0].id);
      }
    } catch (error) {
      console.error('Failed to load transcription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reload templates when showAllTemplates toggle changes
  useEffect(() => {
    if (!transcription) return;
    const recType = transcription.recording_type === 'whisper' ? 'whisper' : 'record';
    templatesApi.getTemplates(false, showAllTemplates ? undefined : recType).then((temps) => {
      setTemplates(temps);
      if (temps.length > 0 && !temps.find((t) => t.id === selectedTemplate)) {
        setSelectedTemplate(temps[0].id);
      }
    });
  }, [showAllTemplates]);

  const handleCollectionChange = async (collectionId: string) => {
    if (!transcription) return;
    try {
      if (collectionId) {
        await collectionsApi.assignTranscription(collectionId, transcription.id);
      } else if (transcription.collection_id) {
        await collectionsApi.removeTranscription(transcription.collection_id, transcription.id);
      }
      setTranscription({ ...transcription, collection_id: collectionId || null });
    } catch (err) {
      console.error('Failed to update collection:', err);
    }
  };

  const handleStartEditTitle = () => {
    if (!transcription) return;
    setEditTitle(transcription.title || transcription.original_filename);
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleSaveTitle = async () => {
    if (!transcription) return;
    const trimmed = editTitle.trim();
    const newTitle = !trimmed || trimmed === transcription.original_filename ? null : trimmed;
    setIsEditingTitle(false);
    if (newTitle !== transcription.title) {
      try {
        const updated = await transcriptionsApi.updateTitle(transcription.id, newTitle);
        setTranscription(updated);
      } catch (error) {
        console.error('Failed to update title:', error);
      }
    }
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditTitle();
    }
  };

  const handleSaveNotes = async () => {
    if (!transcription) return;

    setIsSavingNotes(true);
    try {
      const updated = await transcriptionsApi.updateNotes(transcription.id, notes);
      setTranscription(updated);
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveSpeakers = async (speakers: Record<string, string>) => {
    if (!transcription) return;

    try {
      const updated = await transcriptionsApi.updateSpeakers(transcription.id, speakers);
      setTranscription(updated);
      setShowSpeakerEditor(false);
    } catch (error) {
      console.error('Failed to save speakers:', error);
    }
  };

  const handleGenerateSummary = async () => {
    if (!transcription) return;

    setIsGeneratingSummary(true);
    try {
      const summary = await summariesApi.createSummary({
        transcription_id: transcription.id,
        template_id: !showCustomPrompt ? selectedTemplate : undefined,
        custom_prompt: showCustomPrompt ? customPrompt : undefined,
      });

      setSummaries((prev) => [...prev, summary]);
      setShowCustomPrompt(false);
      setCustomPrompt('');
    } catch (error) {
      console.error('Failed to generate summary:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // --- Audio playback ---
  // Find the matching device recording for this transcription
  const sourceRecording = transcription
    ? recordings.find((r) => r.fileName === transcription.original_filename)
    : undefined;

  // Check blob cache on mount / when recording is found
  useEffect(() => {
    if (!transcription) return;
    const cached = deviceService.getCachedBlob(transcription.original_filename);
    if (cached) setAudioBlob(cached);
  }, [transcription?.original_filename]);

  // Create / revoke object URL from blob
  useEffect(() => {
    if (!audioBlob) { setAudioSrc(''); return; }
    const url = URL.createObjectURL(audioBlob);
    setAudioSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [audioBlob]);

  // Wire up audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPlaybackTime(audio.currentTime);
    const onMeta = () => setAudioDuration(audio.duration);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);

    // loadedmetadata may have already fired before this effect ran (e.g. for blob
    // URLs the browser parses metadata synchronously). Sync the duration now if so.
    if (audio.readyState >= 1 && audio.duration && isFinite(audio.duration)) {
      setAudioDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, [audioSrc]);

  const handleLoadAudioFromServer = useCallback(async () => {
    if (!transcription || !transcription.audio_available) return;
    setIsLoadingAudio(true);
    setLoadAudioProgress(0);
    try {
      const blobUrl = await transcriptionsApi.getAudioBlobUrl(transcription.id);
      // Fetch as blob for the audio element
      const resp = await fetch(blobUrl);
      const blob = await resp.blob();
      setAudioBlob(blob);
      setLoadAudioProgress(100);
    } catch (err) {
      console.error('Failed to load audio from server:', err);
    } finally {
      setIsLoadingAudio(false);
    }
  }, [transcription]);

  const handleLoadAudio = useCallback(async () => {
    if (!transcription) return;
    setIsLoadingAudio(true);
    setLoadAudioProgress(0);
    try {
      const cached = deviceService.getCachedBlob(transcription.original_filename);
      if (cached) {
        setAudioBlob(cached);
        return;
      }

      // Use the already-known sourceRecording, or re-fetch the list from the
      // device if recordings haven't been loaded yet (e.g. after a page refresh).
      let rec = sourceRecording;
      if (!rec && deviceService.isConnected()) {
        try {
          const freshRecs = await deviceService.getFileList();
          rec = freshRecs.find((r) => r.fileName === transcription.original_filename);
        } catch (e) {
          console.warn('[OpenHiNotes] Could not refresh recording list:', e);
        }
      }

      if (!rec) {
        console.error('[OpenHiNotes] Recording not found on device:', transcription.original_filename);
        return;
      }

      const blob = await downloadRecording(
        rec.fileName,
        rec.size,
        (pct) => setLoadAudioProgress(Math.round(pct)),
        rec.fileVersion,
      );
      if (blob) {
        deviceService.setCachedBlob(rec.fileName, blob);
        setAudioBlob(blob);
      }
    } catch (err) {
      console.error('Failed to download audio:', err);
    } finally {
      setIsLoadingAudio(false);
    }
  }, [sourceRecording, transcription, downloadRecording]);

  // Auto-load audio from server if it's available and kept
  useEffect(() => {
    if (transcription?.audio_available && transcription?.keep_audio && !audioBlob && !isLoadingAudio) {
      handleLoadAudioFromServer();
    }
  }, [transcription?.id, transcription?.audio_available, transcription?.keep_audio]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeekAudio = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setPlaybackTime(time);
    if (!isPlaying) { audio.play(); setIsPlaying(true); }
  }, [isPlaying]);

  const handleSeekSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) { audioRef.current.currentTime = t; setPlaybackTime(t); }
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.volume = v;
    setVolume(v);
  }, []);

  const fmtTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const handleDeleteSummary = async (summaryId: string) => {
    if (!window.confirm('Delete this summary?')) return;
    try {
      await summariesApi.deleteSummary(summaryId);
      setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      if (openSummaryId === summaryId) setOpenSummaryId(null);
    } catch (error) {
      console.error('Failed to delete summary:', error);
    }
  };

  /** Persist checkbox toggle in summary markdown. */
  const handleSummaryContentChange = useCallback(async (summaryId: string, newContent: string) => {
    // Optimistic update
    setSummaries((prev) => prev.map((s) => s.id === summaryId ? { ...s, content: newContent } : s));
    try {
      await summariesApi.updateContent(summaryId, newContent);
    } catch (err) {
      console.error('Failed to update summary content:', err);
    }
  }, []);

  if (isLoading) {
    return (
      <Layout title="Transcription">
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!transcription) {
    return (
      <Layout title="Transcription">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Transcription not found</p>
          <button
            onClick={() => navigate('/transcriptions')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Back to Transcriptions
          </button>
        </div>
      </Layout>
    );
  }

  const displayTitle = transcription.title || transcription.original_filename;
  const openSummary = summaries.find((s) => s.id === openSummaryId) || null;
  const baseName = (transcription.title || transcription.original_filename).replace(/\.[^/.]+$/, '');

  const formatTs = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
      : `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    const data = {
      title: transcription.title,
      original_filename: transcription.original_filename,
      language: transcription.language,
      audio_duration: transcription.audio_duration,
      speakers: transcription.speakers,
      segments: transcription.segments.map((seg) => ({
        start: seg.start,
        end: seg.end,
        speaker: seg.speaker ? (transcription.speakers[seg.speaker] || seg.speaker) : null,
        speaker_id: seg.speaker || null,
        text: seg.text,
      })),
      text: transcription.text,
    };
    downloadFile(JSON.stringify(data, null, 2), `${baseName}.json`, 'application/json');
  };

  const handleDownloadTXT = () => {
    const lines = transcription.segments.map((seg) => {
      const speaker = seg.speaker ? (transcription.speakers[seg.speaker] || seg.speaker) : 'Unknown';
      return `[${formatTs(seg.start)} - ${formatTs(seg.end)}] ${speaker}: ${seg.text}`;
    });
    downloadFile(lines.join('\n'), `${baseName}.txt`, 'text/plain');
  };

  const handleExport = (fmt: string) => {
    setShowExportMenu(false);
    const token = localStorage.getItem('auth_token');
    const url = `/api/transcriptions/${transcription.id}/export?format=${fmt}`;
    // Use anchor click so the browser triggers a download with the correct filename
    const a = document.createElement('a');
    a.href = token ? `${url}&token=${token}` : url;
    // Let the server provide the filename via Content-Disposition
    a.setAttribute('download', '');
    // Use fetch + blob for authenticated requests
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        a.href = objectUrl;
        a.click();
        URL.revokeObjectURL(objectUrl);
      });
  };

  return (
    <Layout title={displayTitle}>
      <div className="space-y-6">
        {/* Editable Title */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleSaveTitle}
              className="flex-1 text-2xl font-bold bg-transparent text-gray-900 dark:text-white border-b-2 border-primary-500 focus:outline-none focus:border-primary-600 py-1 min-w-0"
              maxLength={255}
            />
          ) : (
            <button
              onClick={handleStartEditTitle}
              className="group flex items-center gap-2 text-left min-w-0"
              title="Click to rename"
            >
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                {displayTitle}
              </h1>
              <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          )}
          {transcription.title && (
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate hidden sm:inline" title={transcription.original_filename}>
              ({transcription.original_filename})
            </span>
          )}
          </div>

          {/* Permission badge + action buttons */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0 flex-wrap justify-end">
            {/* Permission indicator for non-owners */}
            {permissionLevel && permissionLevel !== 'owner' && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                  permissionLevel === 'write'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {permissionLevel === 'read' ? (
                  <><Eye className="w-3 h-3" /> Read only</>
                ) : (
                  <><Pencil className="w-3 h-3" /> Can edit</>
                )}
              </span>
            )}

            {/* Share button (owner only) */}
            {isOwner && (
              <button
                onClick={() => setShowShareModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                title="Share this transcription"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            )}

            {/* Export dropdown */}
            {transcription.status === 'completed' && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
                    {(isWhisper
                      ? [
                          { fmt: 'txt', label: 'Plain Text (.txt)' },
                          { fmt: 'md',  label: 'Markdown (.md)' },
                          { fmt: 'docx', label: 'Word (.docx)' },
                        ]
                      : [
                          { fmt: 'txt',  label: 'Plain Text (.txt)' },
                          { fmt: 'srt',  label: 'Subtitles (.srt)' },
                          { fmt: 'vtt',  label: 'WebVTT (.vtt)' },
                          { fmt: 'md',   label: 'Markdown (.md)' },
                          { fmt: 'docx', label: 'Word (.docx)' },
                        ]
                    ).map(({ fmt, label }) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    <button
                      onClick={() => { setShowExportMenu(false); handleDownloadJSON(); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Raw JSON (.json)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Language</p>
            <p className="font-semibold text-gray-900 dark:text-white uppercase">
              {transcription.language}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Duration</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {transcription.audio_duration
                ? `${Math.ceil(transcription.audio_duration / 60)} min`
                : '-'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
            <p className="font-semibold text-gray-900 dark:text-white capitalize">
              {transcription.status === 'queued'
                ? `Queued (#${transcription.queue_position || '?'})`
                : transcription.status === 'processing'
                  ? `Processing${transcription.progress ? ` ${Math.round(transcription.progress)}%` : ''}`
                  : transcription.status}
            </p>
            {transcription.status === 'processing' && transcription.progress != null && (
              <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, transcription.progress)}%` }}
                />
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Date</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {format(new Date(transcription.created_at), 'MMM d, yyyy')}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Collection</p>
            <select
              value={transcription.collection_id || ''}
              onChange={(e) => handleCollectionChange(e.target.value)}
              className="w-full text-sm font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer appearance-auto"
            >
              <option value="">— None —</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Audio player */}
        {audioSrc && <audio ref={audioRef} src={audioSrc} />}
        {transcription.status === 'completed' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {audioBlob ? (
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlayback}
                    className="flex-shrink-0 p-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full transition-colors shadow-sm"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max={audioDuration || 0}
                    step="0.1"
                    value={playbackTime}
                    onChange={handleSeekSlider}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right tabular-nums flex-shrink-0">
                    {fmtTime(playbackTime)} / {fmtTime(audioDuration)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-24 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  {isPlaying && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-primary-600 dark:text-primary-400">
                      <Disc3 className="w-3 h-3 animate-spin" />
                      Playing
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Play className={`w-4 h-4 flex-shrink-0 ${
                    transcription.audio_available || sourceRecording || device?.connected
                      ? 'text-gray-400' : 'text-gray-300 dark:text-gray-600'
                  }`} />
                  <span className={`text-sm flex-1 ${
                    transcription.audio_available || sourceRecording || device?.connected
                      ? 'text-gray-600 dark:text-gray-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {transcription.audio_available
                      ? 'Audio stored on server'
                      : sourceRecording
                        ? 'Source recording available on device'
                        : device?.connected
                          ? 'Device connected — click to load audio'
                          : 'Audio not available — connect device to reload'}
                  </span>
                  {transcription.audio_available ? (
                    <button
                      onClick={handleLoadAudioFromServer}
                      disabled={isLoadingAudio}
                      className="px-4 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoadingAudio ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {isLoadingAudio ? `Loading… ${loadAudioProgress}%` : 'Load Audio'}
                    </button>
                  ) : (
                    <button
                      onClick={handleLoadAudio}
                      disabled={isLoadingAudio || !device?.connected || !sourceRecording}
                      title={
                        !device?.connected
                          ? 'Connect your device to load audio'
                          : !sourceRecording
                            ? 'Recording not found on device'
                            : undefined
                      }
                      className="px-4 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoadingAudio ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {isLoadingAudio ? `Loading… ${loadAudioProgress}%` : 'Load from Device'}
                    </button>
                  )}
                </div>
                {isLoadingAudio && (
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary-600 h-1.5 rounded-full transition-all duration-200"
                      style={{ width: `${loadAudioProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isWhisper ? (
          /* ── Whisper: clean note-style view (no speakers, no timeline) ── */
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            {transcription.text ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {transcription.text}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">No text yet — transcription may still be in progress.</p>
            )}
          </div>
        ) : (
          /* ── Record: full speaker-aware transcript viewer ── */
          <TranscriptionViewer
            transcription={transcription}
            currentTime={audioBlob ? playbackTime : undefined}
            onSeek={audioBlob ? handleSeekAudio : undefined}
            onSpeakerUpdate={canEdit ? async (speakerId, newName) => {
              if (!transcription) return;
              const updatedSpeakers = { ...transcription.speakers, [speakerId]: newName };
              try {
                const updated = await transcriptionsApi.updateSpeakers(transcription.id, updatedSpeakers);
                setTranscription(updated);
              } catch (error) {
                console.error('Failed to update speaker:', error);
              }
            } : undefined}
            onSegmentReassign={canEdit ? async (segmentIndex, newSpeaker) => {
              if (!transcription) return;
              try {
                const updated = await transcriptionsApi.reassignSegmentSpeaker(
                  transcription.id,
                  [segmentIndex],
                  newSpeaker,
                );
                setTranscription(updated);
              } catch (error) {
                console.error('Failed to reassign segment speaker:', error);
              }
            } : undefined}
            onSegmentTextUpdate={canEdit ? async (segmentIndex, newText) => {
              if (!transcription) return;
              try {
                const updated = await transcriptionsApi.updateSegmentText(
                  transcription.id,
                  segmentIndex,
                  newText,
                );
                setTranscription(updated);
              } catch (error) {
                console.error('Failed to update segment text:', error);
              }
            } : undefined}
            onFindReplace={canEdit ? async (find, replace, caseSensitive) => {
              if (!transcription) return;
              const updated = await transcriptionsApi.findAndReplace(
                transcription.id,
                find,
                replace,
                caseSensitive,
              );
              setTranscription(updated);
            } : undefined}
          />
        )}

        {transcription.status === 'completed' && (
          <>
            {!isWhisper && (showSpeakerEditor ? (
              <SpeakerEditor
                speakers={transcription.speakers}
                segments={transcription.segments}
                onSave={handleSaveSpeakers}
              />
            ) : (
              <button
                onClick={() => setShowSpeakerEditor(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Edit Speaker Names
              </button>
            ))}

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                rows={4}
                placeholder="Add notes about this transcription..."
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {isSavingNotes && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Saving...</p>
              )}
            </div>

            {/* Summaries Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Summaries {summaries.length > 0 && <span className="text-sm font-normal text-gray-500">({summaries.length})</span>}
              </h3>

              {summaries.length === 1 ? (
                /* Single summary: show inline with delete button */
                <div className="mb-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(summaries[0].created_at), 'MMM d, yyyy HH:mm')} &bull;{' '}
                        {summaries[0].model_used}
                      </p>
                      <button
                        onClick={() => handleDeleteSummary(summaries[0].id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Delete summary"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <InteractiveMarkdown
                      content={summaries[0].content}
                      onContentChange={(c) => handleSummaryContentChange(summaries[0].id, c)}
                      className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                    />
                  </div>
                </div>
              ) : summaries.length > 1 ? (
                /* Multiple summaries: show as tiles, click to open modal */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {summaries.map((summary) => (
                    <div
                      key={summary.id}
                      onClick={() => setOpenSummaryId(summary.id)}
                      className="group relative p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-all hover:shadow-md"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(summary.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSummary(summary.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete summary"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <Maximize2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{summary.model_used}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4">
                        {summary.content.slice(0, 200)}{summary.content.length > 200 ? '...' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Summary modal */}
              {openSummary && (
                <SummaryModal
                  summary={openSummary}
                  onClose={() => setOpenSummaryId(null)}
                  onDelete={handleDeleteSummary}
                  onContentChange={(c) => handleSummaryContentChange(openSummary.id, c)}
                />
              )}

              {/* Generate summary controls */}
              <div className="space-y-4">
                {showCustomPrompt ? (
                  <>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={4}
                      placeholder="Enter custom prompt for summarization..."
                      className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary || !customPrompt.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGeneratingSummary && <Loader className="w-4 h-4 animate-spin" />}
                        Generate
                      </button>
                      <button
                        onClick={() => setShowCustomPrompt(false)}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <TemplateSelector
                      templates={templates}
                      value={selectedTemplate}
                      onChange={setSelectedTemplate}
                    />
                    {isWhisper && (
                      <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showAllTemplates}
                          onChange={(e) => setShowAllTemplates(e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-600"
                        />
                        Show all templates
                      </label>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary || !selectedTemplate}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGeneratingSummary && <Loader className="w-4 h-4 animate-spin" />}
                        <Plus className="w-4 h-4" />
                        Generate Summary
                      </button>
                      <button
                        onClick={() => setShowCustomPrompt(true)}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                      >
                        Custom Prompt
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Chat</h3>
              <ChatPanel
                transcriptionId={transcription.id}
                transcriptionNames={{ [transcription.id]: transcription.title || transcription.original_filename }}
              />
            </div>
          </>
        )}
      </div>

      {/* Share modal */}
      {transcription && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          resourceType="transcription"
          resourceId={transcription.id}
          resourceName={transcription.title || transcription.original_filename}
        />
      )}
    </Layout>
  );
}
