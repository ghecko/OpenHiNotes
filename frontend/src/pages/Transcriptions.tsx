import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { transcriptionsApi } from '@/api/transcriptions';
import { searchApi, SearchHit } from '@/api/search';
import { useAppStore } from '@/store/useAppStore';
import { Transcription, RecordingType } from '@/types';
import { format } from 'date-fns';
import {
  Trash2, CheckCircle, AlertCircle, Loader, Search, RefreshCw, FileText,
  Inbox, Clock, Unplug, ArrowUpDown, Pin, PinOff, X, CheckSquare, Square,
  Mic, MessageSquare, Download,
} from 'lucide-react';

export function Transcriptions() {
  const navigate = useNavigate();
  const recordings = useAppStore((s) => s.recordings);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'shared'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | RecordingType>('all');

  // Phase 6.1 — server-side full-text search.
  const [serverHits, setServerHits] = useState<SearchHit[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Phase 6.3 — multi-select state.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const deviceFileNames = useMemo(
    () => new Set(recordings.map((r) => r.fileName)),
    [recordings],
  );

  useEffect(() => {
    loadTranscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, ownershipFilter, typeFilter]);

  const loadTranscriptions = async () => {
    setIsLoading(true);
    try {
      const response = await transcriptionsApi.getTranscriptions(
        0, 100, sortOrder, ownershipFilter,
        typeFilter === 'all' ? undefined : typeFilter,
      );
      setTranscriptions(response.items);
    } catch (error) {
      console.error('Failed to load transcriptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Phase 6.1 — debounced server search effect.
  const searchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < 2) {
      setServerHits(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const handle = setTimeout(async () => {
      searchAbortRef.current?.abort?.();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const res = await searchApi.searchTranscriptions(q, {
          limit: 50,
          recordingType: typeFilter === 'all' ? undefined : typeFilter,
        });
        if (!controller.signal.aborted) setServerHits(res.items);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Search failed:', err);
          setServerHits([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(handle);
      searchAbortRef.current?.abort?.();
    };
  }, [searchTerm, typeFilter]);

  const visibleTranscriptions: Transcription[] = useMemo(() => {
    let list = transcriptions;
    if (serverHits) {
      const hitIds = new Set(serverHits.map((h) => h.transcription_id));
      list = list.filter((t) => hitIds.has(t.id));
    } else {
      const lowered = searchTerm.toLowerCase();
      list = transcriptions.filter((t) => {
        const target = (t.title || t.original_filename).toLowerCase();
        return target.includes(lowered) || t.original_filename.toLowerCase().includes(lowered);
      });
    }
    if (statusFilter !== 'all') list = list.filter((t) => t.status === statusFilter);
    return list;
  }, [transcriptions, serverHits, searchTerm, statusFilter]);

  const snippetById = useMemo(() => {
    const m = new Map<string, string>();
    serverHits?.forEach((h) => { if (h.snippet) m.set(h.transcription_id, h.snippet); });
    return m;
  }, [serverHits]);

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this transcription?')) {
      try {
        await transcriptionsApi.deleteTranscription(id);
        setTranscriptions((prev) => prev.filter((t) => t.id !== id));
      } catch (error) {
        console.error('Failed to delete transcription:', error);
      }
    }
  };

  // Phase 6 follow-up — let users download the audio of a FAILED
  // transcription within its 1 h retention window.
  const handleDownloadFailedAudio = useCallback(async (t: Transcription) => {
    try {
      const url = await transcriptionsApi.getAudioBlobUrl(t.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = t.original_filename || `audio-${t.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      alert(`Could not download audio: ${err instanceof Error ? err.message : err}`);
    }
  }, []);

  const togglePin = useCallback(async (t: Transcription) => {
    try {
      const updated = await transcriptionsApi.setPinned(t.id, !t.is_pinned);
      setTranscriptions((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (err) {
      console.error('Failed to update pin state:', err);
    }
  }, []);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectAll = () => {
    setSelectedIds(new Set(visibleTranscriptions.map((t) => t.id)));
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} transcription${ids.length > 1 ? 's' : ''}?`)) return;
    try {
      const result = await transcriptionsApi.batchDelete(ids);
      setTranscriptions((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      if (result.skipped > 0) {
        alert(`${result.affected} deleted, ${result.skipped} skipped (no permission).`);
      }
    } catch (err) {
      console.error('Batch delete failed:', err);
    } finally {
      exitSelectionMode();
    }
  };

  const handleBatchPin = async (pinned: boolean) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await transcriptionsApi.batchPin(ids, pinned);
      setTranscriptions((prev) => prev.map((t) => (selectedIds.has(t.id) ? { ...t, is_pinned: pinned } : t)));
    } catch (err) {
      console.error('Batch pin failed:', err);
    } finally {
      exitSelectionMode();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-3.5 h-3.5" />;
      case 'processing': return <Loader className="w-3.5 h-3.5 animate-spin" />;
      case 'failed': return <AlertCircle className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-150';
    switch (status) {
      case 'completed': return `${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`;
      case 'processing': return `${base} bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400`;
      case 'failed': return `${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`;
      default: return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400`;
    }
  };

  return (
    <Layout title="Transcriptions">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search title, filename, or transcript text…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/60 dark:border-gray-700/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200"
            />
            {isSearching && (
              <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/60 dark:border-gray-700/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <div className="inline-flex rounded-xl border border-gray-200/60 dark:border-gray-700/40 overflow-hidden">
            {(['all', 'mine', 'shared'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setOwnershipFilter(f)}
                className={`px-3 py-2.5 text-sm font-medium transition-colors ${
                  ownershipFilter === f
                    ? 'bg-primary-500 text-white'
                    : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'mine' ? 'Mine' : 'Shared'}
              </button>
            ))}
          </div>

          {/* Phase 6 follow-up — record / whisper filter */}
          <div className="inline-flex rounded-xl border border-gray-200/60 dark:border-gray-700/40 overflow-hidden">
            {([
              { key: 'all',     label: 'All',      icon: null },
              { key: 'record',  label: 'Records',  icon: <Mic className="w-3.5 h-3.5" /> },
              { key: 'whisper', label: 'Whispers', icon: <MessageSquare className="w-3.5 h-3.5" /> },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                  typeFilter === f.key
                    ? 'bg-primary-500 text-white'
                    : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={f.key === 'all' ? 'Show both records and whispers' : `Show only ${f.label.toLowerCase()}`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/40 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
          >
            <ArrowUpDown className="w-4 h-4" />
            <span className="text-sm">{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
          </button>

          <button
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            className={`inline-flex items-center gap-2 px-4 py-2.5 backdrop-blur-sm border rounded-xl transition-all duration-200 ${
              selectionMode
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border-gray-200/60 dark:border-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span className="text-sm">{selectionMode ? 'Cancel' : 'Select'}</span>
          </button>

          <button
            onClick={loadTranscriptions}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {selectionMode && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl">
            <span className="text-sm text-primary-700 dark:text-primary-300 font-medium">
              {selectedIds.size} selected
            </span>
            <button onClick={selectAll} className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Select all visible
            </button>
            <span className="flex-1" />
            <button onClick={() => handleBatchPin(true)} disabled={!selectedIds.size} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
              <Pin className="w-3.5 h-3.5" /> Pin
            </button>
            <button onClick={() => handleBatchPin(false)} disabled={!selectedIds.size} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
              <PinOff className="w-3.5 h-3.5" /> Unpin
            </button>
            <button onClick={handleBatchDelete} disabled={!selectedIds.size} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={exitSelectionMode} className="p-1.5 rounded-lg text-gray-500 hover:bg-white dark:hover:bg-gray-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center">
              <Loader className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading transcriptions...</p>
            </div>
          ) : visibleTranscriptions.length === 0 ? (
            <div className="p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700/50 mb-4">
                {transcriptions.length === 0 ? (
                  <Inbox className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                ) : (
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">
                {transcriptions.length === 0 ? 'No transcriptions yet' : 'No matching transcriptions'}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {transcriptions.length === 0
                  ? 'Upload an audio file to create your first transcription.'
                  : 'Try adjusting your search or filter criteria.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80 dark:bg-gray-700/50">
                  <tr>
                    {selectionMode && <th className="px-3 py-3.5 w-10"></th>}
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Language</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {visibleTranscriptions.map((t) => {
                    const isSelected = selectedIds.has(t.id);
                    const snippet = snippetById.get(t.id);
                    return (
                      <tr
                        key={t.id}
                        className={`group transition-all duration-150 cursor-pointer ${
                          isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-primary-50/50 dark:hover:bg-primary-900/10'
                        }`}
                        onClick={() => selectionMode ? toggleSelection(t.id) : navigate(`/transcriptions/${t.id}`)}
                      >
                        {selectionMode && (
                          <td className="px-3 py-4">
                            <button onClick={(e) => { e.stopPropagation(); toggleSelection(t.id); }} className="p-1 text-primary-600 dark:text-primary-400">
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {t.is_pinned && (<Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />)}
                                {t.recording_type === 'whisper' ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 flex-shrink-0"
                                    title="Whisper note"
                                  >
                                    <MessageSquare className="w-3 h-3" /> Whisper
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 flex-shrink-0"
                                    title="Recorded conversation"
                                  >
                                    <Mic className="w-3 h-3" /> Record
                                  </span>
                                )}
                                <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-150 truncate">
                                  {t.title || t.original_filename}
                                </span>
                                {deviceFileNames.size > 0 && !deviceFileNames.has(t.original_filename) && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0" title="Source recording no longer on device">
                                    <Unplug className="w-3 h-3" />
                                    Orphan
                                  </span>
                                )}
                              </div>
                              {t.title && (<span className="text-xs text-gray-500 dark:text-gray-400 block truncate">{t.original_filename}</span>)}
                              {snippet && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1 leading-snug" dangerouslySetInnerHTML={{ __html: snippet }} />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 uppercase">{t.language}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{t.audio_duration ? `${Math.ceil(t.audio_duration / 60)} min` : '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{format(new Date(t.created_at), 'MMM d, yyyy')}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={getStatusBadge(t.status)}>
                            {getStatusIcon(t.status)}
                            <span className="capitalize">{t.status}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            {t.status === 'failed' && t.audio_available && (
                              <button
                                onClick={() => handleDownloadFailedAudio(t)}
                                title="Download audio for debugging (1 h window)"
                                className="p-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 transition-all duration-200"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => togglePin(t)}
                              title={t.is_pinned ? 'Unpin' : 'Pin to top'}
                              className={`p-2 rounded-lg transition-all duration-200 ${
                                t.is_pinned ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-amber-500 opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              <Pin className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(t.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100">
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
      </div>
    </Layout>
  );
}
