import { useState, useRef, useEffect, useMemo } from 'react';
import { Copy, Check, Pencil, ArrowRightLeft, X } from 'lucide-react';
import { Transcription } from '@/types';

interface TranscriptionViewerProps {
  transcription: Transcription;
  onSpeakerUpdate?: (speakerId: string, newName: string) => void;
  onSegmentReassign?: (segmentIndex: number, newSpeaker: string) => void;
  /** Current audio playback time in seconds — used for highlight sync */
  currentTime?: number;
  /** Called when user clicks a segment timestamp to seek */
  onSeek?: (time: number) => void;
}

/**
 * A palette of 12 distinct speaker colors.
 * Each entry provides:
 *   - badge: classes for the speaker badge (bg + text)
 *   - border: inline border-left color
 *   - bg: inline subtle background tint
 */
const SPEAKER_PALETTE = [
  { badge: 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200', border: '#3b82f6', bgLight: 'rgba(59,130,246,0.06)', bgDark: 'rgba(59,130,246,0.10)' },
  { badge: 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200', border: '#8b5cf6', bgLight: 'rgba(139,92,246,0.06)', bgDark: 'rgba(139,92,246,0.10)' },
  { badge: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200', border: '#22c55e', bgLight: 'rgba(34,197,94,0.06)', bgDark: 'rgba(34,197,94,0.10)' },
  { badge: 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200', border: '#f59e0b', bgLight: 'rgba(245,158,11,0.06)', bgDark: 'rgba(245,158,11,0.10)' },
  { badge: 'bg-pink-100 dark:bg-pink-900/60 text-pink-800 dark:text-pink-200', border: '#ec4899', bgLight: 'rgba(236,72,153,0.06)', bgDark: 'rgba(236,72,153,0.10)' },
  { badge: 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200', border: '#14b8a6', bgLight: 'rgba(20,184,166,0.06)', bgDark: 'rgba(20,184,166,0.10)' },
  { badge: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200', border: '#ef4444', bgLight: 'rgba(239,68,68,0.06)', bgDark: 'rgba(239,68,68,0.10)' },
  { badge: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200', border: '#6366f1', bgLight: 'rgba(99,102,241,0.06)', bgDark: 'rgba(99,102,241,0.10)' },
  { badge: 'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-200', border: '#06b6d4', bgLight: 'rgba(6,182,212,0.06)', bgDark: 'rgba(6,182,212,0.10)' },
  { badge: 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200', border: '#f97316', bgLight: 'rgba(249,115,22,0.06)', bgDark: 'rgba(249,115,22,0.10)' },
  { badge: 'bg-lime-100 dark:bg-lime-900/60 text-lime-800 dark:text-lime-200', border: '#84cc16', bgLight: 'rgba(132,204,22,0.06)', bgDark: 'rgba(132,204,22,0.10)' },
  { badge: 'bg-fuchsia-100 dark:bg-fuchsia-900/60 text-fuchsia-800 dark:text-fuchsia-200', border: '#d946ef', bgLight: 'rgba(217,70,239,0.06)', bgDark: 'rgba(217,70,239,0.10)' },
];

const FALLBACK_COLOR = {
  badge: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  border: '#6b7280',
  bgLight: 'rgba(107,114,128,0.06)',
  bgDark: 'rgba(107,114,128,0.10)',
};

/**
 * Returns a deterministic color for a speaker based on its sorted position
 * among all speakers in the transcription.
 */
function getSpeakerColorByIndex(index: number) {
  return SPEAKER_PALETTE[index % SPEAKER_PALETTE.length];
}

export function TranscriptionViewer({ transcription, onSpeakerUpdate, onSegmentReassign, currentTime, onSeek }: TranscriptionViewerProps) {
  const [copied, setCopied] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [reassigningIndex, setReassigningIndex] = useState<number | null>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const lastActiveIndexRef = useRef<number>(-1);

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

  const isDarkMode = () => {
    return document.documentElement.classList.contains('dark');
  };

  // --- Inline editing handlers ---
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Transcript</h3>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy All
            </>
          )}
        </button>
      </div>

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
                    </select>
                    <button
                      onClick={() => setReassigningIndex(null)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
                    {onSegmentReassign && sortedSpeakers.length > 1 && (
                      <button
                        onClick={() => setReassigningIndex(idx)}
                        className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Reassign to different speaker"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">{segment.text}</p>
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
