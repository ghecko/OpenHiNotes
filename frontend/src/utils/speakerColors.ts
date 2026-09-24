/**
 * A palette of 12 distinct speaker colors.
 * Each entry provides:
 *   - badge: classes for the speaker badge (bg + text)
 *   - border: inline border-left color
 *   - bg: inline subtle background tint
 */
export const SPEAKER_PALETTE = [
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

export const FALLBACK_COLOR = {
  badge: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  border: '#6b7280',
  bgLight: 'rgba(107,114,128,0.06)',
  bgDark: 'rgba(107,114,128,0.10)',
};

/**
 * Returns a deterministic color for a speaker based on its sorted position
 * among all speakers in the transcription.
 */
export function getSpeakerColorByIndex(index: number) {
  return SPEAKER_PALETTE[index % SPEAKER_PALETTE.length];
}


export type SpeakerColor = (typeof SPEAKER_PALETTE)[number];

/**
 * Deterministic speaker → color mapping shared by the transcript, the
 * timeline and the speaker editor: speakers are sorted and colored by index.
 */
export function buildSpeakerColorMap(segments: Array<{ speaker?: string }>): Map<string, SpeakerColor> {
  const unique = new Set<string>();
  for (const seg of segments) if (seg.speaker) unique.add(seg.speaker);
  const map = new Map<string, SpeakerColor>();
  Array.from(unique).sort().forEach((spk, i) => map.set(spk, getSpeakerColorByIndex(i)));
  return map;
}
