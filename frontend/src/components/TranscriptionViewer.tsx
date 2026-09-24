import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Check, Pencil, ArrowRightLeft, X, Search, Replace, GitMerge, Scissors, UserCheck, AlertTriangle } from 'lucide-react';
import { Transcription, TranscriptionSegment } from '@/types';
import { FALLBACK_COLOR, getSpeakerColorByIndex } from '@/utils/speakerColors';

interface TranscriptionViewerProps {
  transcription: Transcription;
  onSpeakerUpdate?: (speakerId: string, newName: string) => void;
  /** Reassign a segment; `newSpeakerName` is set when `newSpeaker` is a label created on the fly */
  onSegmentReassign?: (segmentIndex: number, newSpeaker: string, newSpeakerName?: string) => void;
  /** Merge every segment of `source` into speaker `target` */
  onSpeakerMerge?: (source: string, target: string) => void;
  /**
   * Split a segment before whitespace token `wordIndex`. Exact with word
   * timestamps, interpolated otherwise. The second half goes to `newSpeaker`
   * when given (`newSpeakerName` when that label is created on the fly).
   */
  onSegmentSplit?: (segmentIndex: number, wordIndex: number, newSpeaker?: string, newSpeakerName?: string) => void;
  /** Confirm / reject an automatic voice-fingerprint identification */
  onMatchDecision?: (speakerLabel: string, action: 'confirm' | 'reject', enroll: boolean) => void;
  /** Whether "confirm + enrol voice" is possible (audio still available) */
  canEnroll?: boolean;
  /** Called when user edits a segment's text to fix a mis-transcription */
  onSegmentTextUpdate?: (segmentIndex: number, newText: string) => void;
  /** Called when user performs find-and-replace across all segments */
  onFindReplace?: (find: string, replace: string, caseSensitive: boolean) => void;
  /** Current audio playback time in seconds — used for highlight sync */
  currentTime?: number;
  /** Called when user clicks a segment timestamp to seek */
  onSeek?: (time: number) => void;
}

/** Below this alignment confidence a segment is flagged for review. */
const LOW_CONFIDENCE = 0.5;

/** Sentinel value of the "+ New speaker…" option in speaker dropdowns. */
const NEW_SPEAKER = '__new__';

/** Whitespace tokens of a segment, matching the backend's `text.split()`. */
const segmentTokens = (segment: TranscriptionSegment): string[] =>
  segment.words && segment.words.length > 0
    ? segment.words.map((w) => w.word)
    : (segment.text || '').trim().split(/\s+/).filter(Boolean);

export function TranscriptionViewer({ transcription, onSpeakerUpdate, onSegmentReassign, onSpeakerMerge, onSegmentSplit, onMatchDecision, canEnroll, onSegmentTextUpdate, onFindReplace, currentTime, onSeek }: TranscriptionViewerProps) {
  const [copied, setCopied] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [reassigningIndex, setReassigningIndex] = useState<number | null>(null);
  const [mergingIndex, setMergingIndex] = useState<number | null>(null);
  const [splittingIndex, setSplittingIndex] = useState<number | null>(null);
  /** Speaker for the second half of a split: '' keeps the current one, or a label, or NEW_SPEAKER */
  const [splitTarget, setSplitTarget] = useState<string>('');
  const [splitNewName, setSplitNewName] = useState('');
  /** Segment whose speaker is being reassigned to a speaker created on the fly */
  const [newSpeakerIndex, setNewSpeakerIndex] = useState<number | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [editingTextIndex, setEditingTextIndex] = useState<number | null>(null);
  const [editTextValue, setEditTextValue] = useState('');
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const lastActiveIndexRef = useRef<number>(-1);

  // Find & Replace state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findReplaceStatus, setFindReplaceStatus] = useState<string | null>(null);

  // Build a deterministic sorted speaker list → index map
  const speakerIndexMap = useMemo(() => {
    const uniqueSpeakers = new Set<string>();
    for (const seg of transcription.segments) {
      if (seg.speaker) uniqueSpeakers.add(seg.speaker);
    }
    const sorted = Array.from(uniqueSpeakers).sort();
    const map = new Map<string, number>();
    sorted.forEach((spk, i) => map.set(spk, i));
    return map;
  }, [transcription.segments]);

  // Sorted list of unique speaker IDs for the reassign dropdown
  const sortedSpeakers = useMemo(() => {
    return Array.from(speakerIndexMap.keys()).sort();
  }, [speakerIndexMap]);

  // First segment index for each speaker: identification badges are shown
  // there only, so a 40-turn speaker doesn't get 40 confirm buttons.
  const firstIndexBySpeaker = useMemo(() => {
    const map = new Map<string, number>();
    transcription.segments.forEach((seg, i) => {
      if (seg.speaker && !map.has(seg.speaker)) map.set(seg.speaker, i);
    });
    return map;
  }, [transcription.segments]);

  // Compute the active segment based on playback time
  const activeSegmentIndex = useMemo(() => {
    if (currentTime === undefined || currentTime < 0) return -1;
    for (let i = transcription.segments.length - 1; i >= 0; i--) {
      if (currentTime >= transcription.segments[i].start) return i;
    }
    return -1;
  }, [currentTime, transcription.segments]);

  // Auto-scroll to active segment when it changes (unless user scrolled manually)
  useEffect(() => {
    if (activeSegmentIndex < 0 || activeSegmentIndex === lastActiveIndexRef.current) return;
    lastActiveIndexRef.current = activeSegmentIndex;
    if (!userScrolledRef.current && activeSegmentRef.current && scrollContainerRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSegmentIndex]);

  // Detect user scroll to pause auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || currentTime === undefined) return;
    let timeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      userScrolledRef.current = true;
      clearTimeout(timeout);
      // Resume auto-scroll after 4s of no user scrolling
      timeout = setTimeout(() => { userScrolledRef.current = false; }, 4000);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timeout);
    };
  }, [currentTime !== undefined]);

  // Focus the input when entering edit mode, without scrolling
  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus({ preventScroll: true });
      editInputRef.current.select();
    }
  }, [editingIndex]);

  // Auto-focus and auto-resize the text editing textarea
  useEffect(() => {
    if (editingTextIndex !== null && editTextRef.current) {
      editTextRef.current.focus({ preventScroll: true });
      editTextRef.current.select();
      editTextRef.current.style.height = 'auto';
      editTextRef.current.style.height = editTextRef.current.scrollHeight + 'px';
    }
  }, [editingTextIndex]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcription.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSpeakerColor = (speaker: string | undefined) => {
    if (!speaker) return FALLBACK_COLOR;
    const idx = speakerIndexMap.get(speaker);
    if (idx === undefined) return FALLBACK_COLOR;
    return getSpeakerColorByIndex(idx);
  };

  const getSpeakerName = (speaker: string | undefined) => {
    if (!speaker) return 'Unknown';
    return transcription.speakers[speaker] || speaker;
  };

  /** First SPEAKER_NN label not used by the transcript (segments or names map). */
  const nextSpeakerLabel = () => {
    const taken = new Set<string>([...Object.keys(transcription.speakers || {}), ...sortedSpeakers]);
    for (let i = 0; ; i++) {
      const label = `SPEAKER_${String(i).padStart(2, '0')}`;
      if (!taken.has(label)) return label;
    }
  };

  const startNewSpeaker = (idx: number) => {
    setReassigningIndex(null);
    setNewSpeakerIndex(idx);
    setNewSpeakerName('');
  };

  const cancelNewSpeaker = () => {
    setNewSpeakerIndex(null);
    setNewSpeakerName('');
  };

  const commitNewSpeaker = (idx: number) => {
    if (onSegmentReassign) {
      onSegmentReassign(idx, nextSpeakerLabel(), newSpeakerName.trim() || undefined);
    }
    cancelNewSpeaker();
  };

  const startSplit = (idx: number) => {
    setSplittingIndex(idx);
    setSplitTarget('');
    setSplitNewName('');
  };

  const cancelSplit = () => {
    setSplittingIndex(null);
    setSplitTarget('');
    setSplitNewName('');
  };

  const commitSplit = (idx: number, wordIndex: number) => {
    if (onSegmentSplit) {
      if (splitTarget === NEW_SPEAKER) {
        onSegmentSplit(idx, wordIndex, nextSpeakerLabel(), splitNewName.trim() || undefined);
      } else if (splitTarget) {
        onSegmentSplit(idx, wordIndex, splitTarget);
      } else {
        onSegmentSplit(idx, wordIndex);
      }
    }
    cancelSplit();
  };

  const isDarkMode = () => {
    return document.documentElement.classList.contains('dark');
  };

  /**
   * Render segment text word by word (karaoke highlight, split targets).
   * Segments without word timestamps are rendered from their whitespace
   * tokens so they can still be split (boundary interpolated server-side).
   */
  const renderWords = (segment: TranscriptionSegment, idx: number) => {
    const words = segment.words && segment.words.length > 0 ? segment.words : null;
    const tokens = words ? words.map((w) => w.word) : segmentTokens(segment);
    const isActive = idx === activeSegmentIndex;
    const splitting = splittingIndex === idx;
    return (
      <>
        {tokens.map((tok, wi) => {
          const w = words ? words[wi] : null;
          const current =
            !!w && isActive && currentTime !== undefined && currentTime >= w.start && currentTime < w.end;
          const lowScore = !!w && w.score !== undefined && w.score !== null && w.score < 0.3;
          return (
            <span key={wi}>
              {wi > 0 && ' '}
              <span
                className={`rounded transition-colors ${
                  current ? 'bg-primary-200 dark:bg-primary-700/70 text-gray-900 dark:text-white' : ''
                } ${splitting && wi > 0 ? 'cursor-col-resize hover:bg-amber-200 dark:hover:bg-amber-700/60' : ''} ${
                  lowScore ? 'underline decoration-dotted decoration-amber-500/70' : ''
                }`}
                title={
                  splitting && wi > 0
                    ? `Split the segment before this word${w ? '' : ' (time estimated: no word timestamps)'}`
                    : w
                      ? `${formatTimestamp(w.start)}${lowScore ? ' · not aligned' : ''}`
                      : undefined
                }
                onClick={(e) => {
                  if (splitting && wi > 0 && onSegmentSplit) {
                    e.stopPropagation();
                    commitSplit(idx, wi);
                  }
                }}
              >
                {tok}
              </span>
            </span>
          );
        })}
      </>
    );
  };

  // --- Inline speaker editing handlers ---
  const startEditing = (speakerId: string, segmentIndex: number) => {
    if (!onSpeakerUpdate) return;
    setEditingSpeaker(speakerId);
    setEditingIndex(segmentIndex);
    setEditValue(getSpeakerName(speakerId));
  };

  const saveEdit = () => {
    if (editingSpeaker && onSpeakerUpdate && editValue.trim()) {
      onSpeakerUpdate(editingSpeaker, editValue.trim());
    }
    setEditingSpeaker(null);
    setEditingIndex(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingSpeaker(null);
    setEditingIndex(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // --- Inline segment text editing handlers ---
  const startTextEditing = (segmentIndex: number) => {
    if (!onSegmentTextUpdate) return;
    setEditingTextIndex(segmentIndex);
    setEditTextValue(transcription.segments[segmentIndex].text);
  };

  const saveTextEdit = () => {
    if (editingTextIndex !== null && onSegmentTextUpdate && editTextValue.trim()) {
      const originalText = transcription.segments[editingTextIndex].text;
      if (editTextValue.trim() !== originalText.trim()) {
        onSegmentTextUpdate(editingTextIndex, editTextValue.trim());
      }
    }
    setEditingTextIndex(null);
    setEditTextValue('');
  };

  const cancelTextEdit = () => {
    setEditingTextIndex(null);
    setEditTextValue('');
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveTextEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTextEdit();
    }
  };

  // --- Find & Replace handlers ---
  const handleFindReplace = async () => {
    if (!onFindReplace || !findText.trim()) return;
    setFindReplaceStatus(null);
    try {
      await onFindReplace(findText, replaceText, caseSensitive);
      setFindReplaceStatus('Replacements applied successfully');
      setTimeout(() => setFindReplaceStatus(null), 3000);
    } catch (err: any) {
      setFindReplaceStatus(err?.message || 'No matches found');
      setTimeout(() => setFindReplaceStatus(null), 3000);
    }
  };

  // Count occurrences for preview
  const matchCount = useMemo(() => {
    if (!findText.trim()) return 0;
    let count = 0;
    for (const seg of transcription.segments) {
      if (caseSensitive) {
        let idx = 0;
        while ((idx = seg.text.indexOf(findText, idx)) !== -1) {
          count++;
          idx += findText.length;
        }
      } else {
        const re = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = seg.text.match(re);
        if (matches) count += matches.length;
      }
    }
    return count;
  }, [findText, caseSensitive, transcription.segments]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Transcript</h3>
        <div className="flex items-center gap-2">
          {onFindReplace && (
            <button
              onClick={() => setShowFindReplace(!showFindReplace)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                showFindReplace
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title="Find & Replace"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Find &amp; Replace</span>
            </button>
          )}
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title={copied ? 'Copied!' : 'Copy all'}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">Copy All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Find & Replace bar */}
      {showFindReplace && onFindReplace && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Find..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleFindReplace()}
              />
            </div>
            <div className="flex-1 relative">
              <Replace className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace with..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleFindReplace()}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none" title="When checked, matching is case-sensitive (e.g. 'Hello' won't match 'hello')">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Match case
              </label>
              <button
                onClick={handleFindReplace}
                disabled={!findText.trim()}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded font-medium transition-colors whitespace-nowrap"
              >
                Replace All
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {findText.trim() && (
              <span className={`${matchCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                {matchCount} match{matchCount !== 1 ? 'es' : ''} found
              </span>
            )}
            {findReplaceStatus && (
              <span className={`${findReplaceStatus.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {findReplaceStatus}
              </span>
            )}
          </div>
        </div>
      )}

      <div ref={scrollContainerRef} className="space-y-3 max-h-96 overflow-y-auto scroll-smooth">
        {transcription.segments.map((segment, idx) => {
          const color = getSpeakerColor(segment.speaker);
          const isEditing = editingIndex === idx;
          const isActive = idx === activeSegmentIndex;

          return (
            <div
              key={idx}
              ref={isActive ? activeSegmentRef : undefined}
              className={`group flex gap-3 rounded-md px-3 py-2 transition-all duration-300 ${
                isActive ? 'ring-2 ring-primary-400 dark:ring-primary-500 ring-offset-1 dark:ring-offset-gray-800 shadow-sm' : ''
              }`}
              style={{
                borderLeft: `4px solid ${color.border}`,
                backgroundColor: isActive
                  ? (isDarkMode() ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.10)')
                  : (isDarkMode() ? color.bgDark : color.bgLight),
              }}
            >
              <div
                className={`text-xs flex-shrink-0 w-12 pt-1 ${
                  onSeek ? 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400' : ''
                } ${isActive ? 'text-primary-600 dark:text-primary-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}
                onClick={() => onSeek?.(segment.start)}
                title={onSeek ? 'Click to jump here' : undefined}
              >
                {formatTimestamp(segment.start)}
              </div>
              <div className="flex-1">
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={handleKeyDown}
                    className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-1 border-2 border-blue-500 outline-none ${color.badge}`}
                    style={{ minWidth: '80px', maxWidth: '200px' }}
                  />
                ) : reassigningIndex === idx ? (
                  <div className="inline-flex items-center gap-1 mb-1">
                    <select
                      autoFocus
                      className="px-2 py-1 rounded text-xs font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      defaultValue={segment.speaker || ''}
                      onChange={(e) => {
                        const newSpeaker = e.target.value;
                        if (newSpeaker === NEW_SPEAKER) {
                          startNewSpeaker(idx);
                          return;
                        }
                        if (newSpeaker && newSpeaker !== segment.speaker && onSegmentReassign) {
                          onSegmentReassign(idx, newSpeaker);
                        }
                        setReassigningIndex(null);
                      }}
                      onBlur={() => setReassigningIndex(null)}
                    >
                      {sortedSpeakers.map((spk) => (
                        <option key={spk} value={spk}>
                          {getSpeakerName(spk)}
                        </option>
                      ))}
                      <option value={NEW_SPEAKER}>+ New speaker…</option>
                    </select>
                    <button
                      onClick={() => setReassigningIndex(null)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : newSpeakerIndex === idx ? (
                  <div className="inline-flex items-center gap-1 mb-1">
                    <input
                      autoFocus
                      type="text"
                      value={newSpeakerName}
                      placeholder="New speaker name"
                      onChange={(e) => setNewSpeakerName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitNewSpeaker(idx); }
                        if (e.key === 'Escape') cancelNewSpeaker();
                      }}
                      className="px-2 py-1 rounded text-xs font-semibold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-2 border-blue-500 outline-none"
                      style={{ minWidth: '120px', maxWidth: '200px' }}
                    />
                    <button
                      onClick={() => commitNewSpeaker(idx)}
                      className="p-0.5 text-green-600 hover:text-green-700 dark:text-green-400"
                      title="Create this speaker and assign the segment to them"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={cancelNewSpeaker}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 mb-1">
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${color.badge} ${
                        onSpeakerUpdate ? 'cursor-pointer group/badge hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 dark:hover:ring-offset-gray-800' : ''
                      }`}
                      onClick={() => segment.speaker && startEditing(segment.speaker, idx)}
                      title={onSpeakerUpdate ? 'Click to rename speaker' : undefined}
                    >
                      {getSpeakerName(segment.speaker)}
                      {onSpeakerUpdate && (
                        <Pencil className="w-3 h-3 opacity-0 group-hover/badge:opacity-60 transition-opacity" />
                      )}
                    </div>
                    {onSegmentReassign && (
                      <button
                        onClick={() => setReassigningIndex(idx)}
                        className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Reassign this segment to another speaker"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                      </button>
                    )}
                    {onSpeakerMerge && sortedSpeakers.length > 1 && segment.speaker && (
                      mergingIndex === idx ? (
                        <select
                          autoFocus
                          className="px-2 py-1 rounded text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-amber-400 focus:outline-none"
                          defaultValue=""
                          onChange={(e) => {
                            const target = e.target.value;
                            if (target && segment.speaker && target !== segment.speaker) {
                              onSpeakerMerge(segment.speaker, target);
                            }
                            setMergingIndex(null);
                          }}
                          onBlur={() => setMergingIndex(null)}
                        >
                          <option value="" disabled>
                            Merge {getSpeakerName(segment.speaker)} into…
                          </option>
                          {sortedSpeakers.filter((spk) => spk !== segment.speaker).map((spk) => (
                            <option key={spk} value={spk}>
                              {getSpeakerName(spk)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setMergingIndex(idx)}
                          className="p-1 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="This speaker is the same person as… (merge all their segments)"
                        >
                          <GitMerge className="w-3 h-3" />
                        </button>
                      )
                    )}
                    {onSegmentSplit && segmentTokens(segment).length > 1 && (
                      <button
                        onClick={() => (splittingIndex === idx ? cancelSplit() : startSplit(idx))}
                        className={`p-1 transition-all rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          splittingIndex === idx
                            ? 'text-amber-600 dark:text-amber-400 opacity-100'
                            : 'text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100'
                        }`}
                        title={
                          splittingIndex === idx
                            ? 'Cancel split'
                            : segment.words && segment.words.length > 1
                              ? 'Split this segment at a word'
                              : 'Split this segment at a word (no word timestamps: boundary time is estimated)'
                        }
                      >
                        <Scissors className="w-3 h-3" />
                      </button>
                    )}
                    {onSegmentSplit && splittingIndex === idx && (
                      <span className="inline-flex items-center gap-1 ml-1 text-[11px] text-gray-500 dark:text-gray-400">
                        <span>2nd part →</span>
                        <select
                          value={splitTarget}
                          onChange={(e) => setSplitTarget(e.target.value)}
                          className="px-1 py-0.5 rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-amber-400 focus:outline-none"
                          title="Speaker of the part after the cut"
                        >
                          <option value="">{getSpeakerName(segment.speaker)} (keep)</option>
                          {sortedSpeakers.filter((spk) => spk !== segment.speaker).map((spk) => (
                            <option key={spk} value={spk}>
                              {getSpeakerName(spk)}
                            </option>
                          ))}
                          <option value={NEW_SPEAKER}>+ New speaker…</option>
                        </select>
                        {splitTarget === NEW_SPEAKER && (
                          <input
                            autoFocus
                            type="text"
                            value={splitNewName}
                            placeholder="New speaker name"
                            onChange={(e) => setSplitNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') cancelSplit(); }}
                            className="px-1 py-0.5 rounded text-[11px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-amber-400 focus:outline-none"
                            style={{ width: '120px' }}
                          />
                        )}
                      </span>
                    )}
                    {segment.speaker && firstIndexBySpeaker.get(segment.speaker) === idx && (() => {
                      const match = transcription.speaker_matches?.[segment.speaker];
                      if (!match || !match.user_id) return null;
                      const pct = match.confidence != null ? Math.round(match.confidence * 100) : null;
                      if (match.status === 'auto') {
                        return (
                          <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200" title={`Voice matched to ${match.display_name}${pct != null ? ` (${pct}% similarity)` : ''}. Confirm or reject.`}>
                            <UserCheck className="w-3 h-3" />
                            auto{pct != null ? ` · ${pct}%` : ''}
                            {onMatchDecision && (
                              <>
                                <button
                                  className="ml-1 px-1 rounded bg-white/70 dark:bg-gray-900/40 hover:bg-green-200 dark:hover:bg-green-800/60"
                                  title={canEnroll ? 'Confirm and enrol this voice for future recordings' : 'Confirm'}
                                  onClick={(e) => { e.stopPropagation(); onMatchDecision(segment.speaker!, 'confirm', !!canEnroll); }}
                                >
                                  ✓
                                </button>
                                <button
                                  className="px-1 rounded bg-white/70 dark:bg-gray-900/40 hover:bg-red-200 dark:hover:bg-red-800/60"
                                  title="Reject: this is not that person"
                                  onClick={(e) => { e.stopPropagation(); onMatchDecision(segment.speaker!, 'reject', false); }}
                                >
                                  ✗
                                </button>
                              </>
                            )}
                          </span>
                        );
                      }
                      if (match.status === 'confirmed') {
                        return (
                          <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-green-700 dark:text-green-300" title={`Identity confirmed${match.enrolled_as ? ' and voice enrolled' : ''}`}>
                            <UserCheck className="w-3 h-3" />
                          </span>
                        );
                      }
                      return null;
                    })()}
                    {segment.confidence != null && segment.confidence < LOW_CONFIDENCE && (
                      <span
                        className="inline-flex items-center ml-1 text-amber-500"
                        title={`Low alignment confidence (${Math.round(segment.confidence * 100)}%): timestamps and speaker for this segment may be off`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                )}
                {editingTextIndex === idx ? (
                  <textarea
                    ref={editTextRef}
                    value={editTextValue}
                    onChange={(e) => {
                      setEditTextValue(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onBlur={saveTextEdit}
                    onKeyDown={handleTextKeyDown}
                    className="w-full text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border-2 border-blue-500 rounded px-2 py-1 outline-none resize-none"
                    rows={1}
                  />
                ) : (
                  <p
                    className={`text-sm text-gray-700 dark:text-gray-300 ${
                      onSegmentTextUpdate ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 rounded px-1 -mx-1 transition-colors' : ''
                    }`}
                    onClick={() => { if (splittingIndex !== idx) startTextEditing(idx); }}
                    title={splittingIndex === idx ? 'Click a word to split before it' : onSegmentTextUpdate ? 'Click to edit text' : undefined}
                  >
                    {splittingIndex === idx || (segment.words && segment.words.length > 0 && currentTime !== undefined)
                      ? renderWords(segment, idx)
                      : segment.text}
                    {onSegmentTextUpdate && (
                      <Pencil className="w-3 h-3 inline-block ml-1 opacity-0 group-hover:opacity-40 transition-opacity" />
                    )}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Full Text</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-6 whitespace-pre-wrap">
          {transcription.text}
        </p>
      </div>
    </div>
  );
}
