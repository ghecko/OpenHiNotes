import { useMemo, useRef } from 'react';
import { TranscriptionSegment } from '@/types';

interface SpeakerTimelineProps {
  segments: TranscriptionSegment[];
  speakers: Record<string, string>;
  /** Total audio duration in seconds (falls back to the last segment end) */
  duration?: number | null;
  /** Current playback position, draws the playhead */
  currentTime?: number;
  /** Seek to a time (click / drag on the strip) */
  onSeek?: (time: number) => void;
  /** Colors keyed by speaker id (same palette as the transcript) */
  colorFor: (speaker: string | undefined) => { border: string };
  /** Highlight one speaker's turns (hover on the legend) */
  highlightSpeaker?: string | null;
  onHoverSpeaker?: (speaker: string | null) => void;
}

/**
 * A compact "who spoke when" strip: one colored bar per segment, laid out
 * over the recording duration. Diarization mistakes (a speaker split in
 * two, a stray label) are visible at a glance, and clicking anywhere seeks
 * the player, so it doubles as a navigation bar for long meetings.
 */
export function SpeakerTimeline({
  segments,
  speakers,
  duration,
  currentTime,
  onSeek,
  colorFor,
  highlightSpeaker,
  onHoverSpeaker,
}: SpeakerTimelineProps) {
  const ref = useRef<HTMLDivElement>(null);

  const total = useMemo(() => {
    const lastEnd = segments.reduce((m, s) => Math.max(m, s.end || 0), 0);
    return Math.max(duration || 0, lastEnd, 1);
  }, [segments, duration]);

  const speakerIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of segments) if (s.speaker) set.add(s.speaker);
    return Array.from(set).sort();
  }, [segments]);

  // Speaking time per speaker, for the legend.
  const talkTime = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of segments) {
      if (!s.speaker) continue;
      m.set(s.speaker, (m.get(s.speaker) || 0) + Math.max(0, s.end - s.start));
    }
    return m;
  }, [segments]);

  if (segments.length === 0 || speakerIds.length === 0) return null;

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(frac * total);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mt-3">
      <div
        ref={ref}
        className={`relative h-6 w-full rounded bg-gray-100 dark:bg-gray-700/60 overflow-hidden ${
          onSeek ? 'cursor-pointer' : ''
        }`}
        onClick={seekFromEvent}
        title={onSeek ? 'Click to jump' : undefined}
      >
        {segments.map((seg, i) => {
          if (!seg.speaker) return null;
          const left = (seg.start / total) * 100;
          const width = Math.max(((seg.end - seg.start) / total) * 100, 0.15);
          const dim = highlightSpeaker && highlightSpeaker !== seg.speaker;
          return (
            <div
              key={i}
              className="absolute top-0 h-full transition-opacity"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: colorFor(seg.speaker).border,
                opacity: dim ? 0.2 : 0.9,
              }}
              title={`${speakers[seg.speaker] || seg.speaker} · ${fmt(seg.start)} - ${fmt(seg.end)}`}
            />
          );
        })}
        {currentTime !== undefined && currentTime >= 0 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-900 dark:bg-white pointer-events-none"
            style={{ left: `${Math.min(100, (currentTime / total) * 100)}%` }}
          />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {speakerIds.map((id) => {
          const secs = talkTime.get(id) || 0;
          const pct = Math.round((secs / total) * 100);
          return (
            <button
              key={id}
              type="button"
              className={`inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 rounded px-1 transition-opacity ${
                highlightSpeaker && highlightSpeaker !== id ? 'opacity-40' : ''
              }`}
              onMouseEnter={() => onHoverSpeaker?.(id)}
              onMouseLeave={() => onHoverSpeaker?.(null)}
              title={`${fmt(secs)} of speech (${pct}%)`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: colorFor(id).border }}
              />
              {speakers[id] || id}
              <span className="text-gray-400 dark:text-gray-500">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
