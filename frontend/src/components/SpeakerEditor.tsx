import { useEffect, useState } from 'react';
import { Save, GitMerge, UserCheck, Fingerprint, Loader, X } from 'lucide-react';
import { SpeakerMatch, TranscriptionSegment, User, VoiceSources } from '@/types';
import { apiClient } from '@/api/client';
import { buildSpeakerColorMap, FALLBACK_COLOR } from '@/utils/speakerColors';

interface SpeakerEditorProps {
  speakers: Record<string, string>;
  segments: TranscriptionSegment[];
  onSave: (speakers: Record<string, string>) => void;
  /** Merge every segment of `source` into `target` (same person, two labels) */
  onMerge?: (source: string, target: string) => void;
  /** Automatic identification results, shown next to each speaker */
  speakerMatches?: Record<string, SpeakerMatch> | null;
  /** What each speaker can be enrolled from; undefined hides the enrol UI */
  voiceSources?: VoiceSources | null;
  /** Save a speaker as a voice profile. userId null = current user. */
  onEnroll?: (speakerLabel: string, userId: string | null, profileLabel: string) => Promise<void>;
  /** Admins may enrol a voice for another user */
  canEnrollOthers?: boolean;
  isLoading?: boolean;
}

export function SpeakerEditor({
  speakers, segments, onSave, onMerge, speakerMatches, voiceSources, onEnroll, canEnrollOthers = false, isLoading = false,
}: SpeakerEditorProps) {
  const [editedSpeakers, setEditedSpeakers] = useState<Record<string, string>>(speakers);
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});

  // ── Enrol-as-voice-profile inline form ──
  const [enrolling, setEnrolling] = useState<string | null>(null);      // speaker label with the form open
  const [enrollTarget, setEnrollTarget] = useState<User | null>(null);  // null = me
  const [enrollLabel, setEnrollLabel] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  useEffect(() => {
    if (!canEnrollOthers || !enrolling || userQuery.trim().length < 2) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.get<User[]>(`/users/search?q=${encodeURIComponent(userQuery.trim())}&limit=6`);
        setUserResults(res);
      } catch {
        setUserResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [userQuery, enrolling, canEnrollOthers]);

  const openEnroll = (speaker: string) => {
    setEnrolling(speaker);
    setEnrollTarget(null);
    setUserQuery('');
    setUserResults([]);
    setEnrollError(null);
    const current = editedSpeakers[speaker] || speakers[speaker];
    setEnrollLabel(current && current !== speaker ? `From meeting: ${current}` : 'From meeting');
  };

  const submitEnroll = async () => {
    if (!enrolling || !onEnroll) return;
    setEnrollBusy(true);
    setEnrollError(null);
    try {
      await onEnroll(enrolling, enrollTarget ? enrollTarget.id : null, enrollLabel.trim() || 'From meeting');
      setEnrolling(null);
    } catch (e: any) {
      setEnrollError(e?.message || 'Failed to save the voice profile');
    } finally {
      setEnrollBusy(false);
    }
  };

  const uniqueSpeakers = Array.from(
    new Set(segments.map((s) => s.speaker).filter(Boolean))
  ).sort() as string[];
  const colors = buildSpeakerColorMap(segments);

  const getSampleText = (speaker: string) => {
    const sample = segments.find((s) => s.speaker === speaker);
    return sample ? sample.text.substring(0, 100) : '';
  };

  const segmentCount = (speaker: string) => segments.filter((s) => s.speaker === speaker).length;

  const handleSpeakerNameChange = (speakerId: string, name: string) => {
    setEditedSpeakers((prev) => ({
      ...prev,
      [speakerId]: name,
    }));
  };

  const handleSave = () => {
    onSave(editedSpeakers);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Edit Speakers</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Rename speakers, or merge two labels when the diarizer split one person in two.
      </p>

      <div className="space-y-4">
        {uniqueSpeakers.map((speaker) => {
          const match = speakerMatches?.[speaker];
          const color = colors.get(speaker) || FALLBACK_COLOR;
          return (
            <div key={speaker} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color.border }} />
                {speaker}
                <span className="text-xs text-gray-400">{segmentCount(speaker)} segments</span>
                {match?.user_id && match.status !== 'rejected' && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200"
                    title={`Voice matched to ${match.display_name}${match.confidence != null ? ` (${Math.round(match.confidence * 100)}%)` : ''}`}
                  >
                    <UserCheck className="w-3 h-3" />
                    {match.status === 'confirmed' ? 'confirmed' : 'auto'}
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editedSpeakers[speaker] || ''}
                  onChange={(e) => handleSpeakerNameChange(speaker, e.target.value)}
                  disabled={isLoading}
                  placeholder="Enter custom name..."
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                {onMerge && uniqueSpeakers.length > 1 && (
                  <div className="flex items-center gap-1">
                    <select
                      value={mergeTarget[speaker] || ''}
                      onChange={(e) => setMergeTarget((prev) => ({ ...prev, [speaker]: e.target.value }))}
                      disabled={isLoading}
                      className="px-2 py-2 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                      title="Same person as…"
                    >
                      <option value="">Same person as…</option>
                      {uniqueSpeakers
                        .filter((other) => other !== speaker)
                        .map((other) => (
                          <option key={other} value={other}>
                            {editedSpeakers[other] || speakers[other] || other}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={isLoading || !mergeTarget[speaker]}
                      onClick={() => {
                        const target = mergeTarget[speaker];
                        if (target && window.confirm(`Merge ${speakers[speaker] || speaker} into ${speakers[target] || target}? All its segments will be relabelled.`)) {
                          onMerge(speaker, target);
                          setMergeTarget((prev) => ({ ...prev, [speaker]: '' }));
                        }
                      }}
                      className="p-2 rounded-lg text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-40"
                      title="Merge"
                    >
                      <GitMerge className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {getSampleText(speaker)}
              </p>
              {voiceSources?.fingerprinting_enabled && onEnroll && (() => {
                const source = voiceSources.sources[speaker] ?? null;
                if (enrolling !== speaker) {
                  return (
                    <button
                      type="button"
                      disabled={isLoading || !source}
                      onClick={() => openEnroll(speaker)}
                      className="self-start inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={
                        source === 'stored'
                          ? 'Save this voice as a profile (uses the embedding retained with the transcription)'
                          : source === 'audio'
                            ? 'Save this voice as a profile (cuts this speaker out of the stored audio)'
                            : 'Not possible: no retained embedding and the audio is gone'
                      }
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      Save as voice profile
                      <span className="text-[10px] opacity-70">
                        {source === 'stored' ? '· retained embedding' : source === 'audio' ? '· from audio' : '· unavailable'}
                      </span>
                    </button>
                  );
                }
                return (
                  <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-violet-800 dark:text-violet-200 inline-flex items-center gap-1">
                        <Fingerprint className="w-3.5 h-3.5" /> Save {speakers[speaker] || speaker} as a voice profile
                      </span>
                      <button type="button" onClick={() => setEnrolling(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1">
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Whose voice is this?</label>
                        {canEnrollOthers ? (
                          enrollTarget ? (
                            <div className="flex items-center gap-2 text-sm px-2 py-1.5 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600">
                              <span className="flex-1 truncate text-gray-900 dark:text-white">{enrollTarget.display_name || enrollTarget.email}</span>
                              <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setEnrollTarget(null)}>me instead</button>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="text"
                                value={userQuery}
                                onChange={(e) => setUserQuery(e.target.value)}
                                placeholder="Me (type a name to pick someone else)"
                                className="w-full px-2 py-1.5 text-sm rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              />
                              {userResults.length > 0 && (
                                <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-auto rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow">
                                  {userResults.map((u) => (
                                    <li key={u.id}>
                                      <button
                                        type="button"
                                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/40 text-gray-900 dark:text-white"
                                        onClick={() => { setEnrollTarget(u); setUserQuery(''); setUserResults([]); }}
                                      >
                                        {u.display_name || u.email}
                                        {u.display_name && <span className="ml-1 text-xs text-gray-400">{u.email}</span>}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )
                        ) : (
                          <div className="text-sm px-2 py-1.5 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                            Me
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Profile label</label>
                        <input
                          type="text"
                          value={enrollLabel}
                          onChange={(e) => setEnrollLabel(e.target.value)}
                          className="w-full px-2 py-1.5 text-sm rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {source === 'stored'
                        ? 'Uses the voice embedding retained with this transcription. No audio is read.'
                        : 'This speaker\'s segments are cut out of the stored audio and sent to VoxHub once; nothing else is kept.'}
                      {' '}Only save a voice with that person&apos;s consent.
                    </p>
                    {enrollError && <p className="text-xs text-red-600 dark:text-red-400">{enrollError}</p>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEnrolling(null)} className="text-xs px-3 py-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitEnroll}
                        disabled={enrollBusy}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                      >
                        {enrollBusy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Fingerprint className="w-3.5 h-3.5" />}
                        Save voice
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={isLoading}
        className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
      >
        <Save className="w-4 h-4" />
        Save Speaker Names
      </button>
    </div>
  );
}
