import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Keyboard } from 'lucide-react';

interface AudioPlayerProps {
  src: string | Blob;
  fileName: string;
}

// Phase 6.4 — playback speeds cycled by the "S" shortcut.
const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function AudioPlayer({ src, fileName }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setAudioError(null);
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      const err = audio.error;
      const msg = err ? `Audio error (code ${err.code}): ${err.message}` : 'Unknown audio error';
      console.error('[OpenHiNotes] AudioPlayer:', msg);
      setAudioError(msg);
      setIsPlaying(false);
    };
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const seekBy = (deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + deltaSeconds));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = PLAYBACK_SPEEDS.indexOf(playbackRate as typeof PLAYBACK_SPEEDS[number]);
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    audio.playbackRate = next;
    setPlaybackRate(next);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 's':
        case 'S':
          e.preventDefault();
          cycleSpeed();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playbackRate]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.volume = newVolume;
    setVolume(newVolume);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const [audioSrc, setAudioSrc] = useState<string>('');
  useEffect(() => {
    if (typeof src === 'string') {
      setAudioSrc(src);
      return;
    }
    const url = URL.createObjectURL(src);
    setAudioSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [src]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <audio ref={audioRef} src={audioSrc} />

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {fileName}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={cycleSpeed}
            title="Playback speed (S)"
            className="text-xs font-mono px-2 py-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {playbackRate.toFixed(2).replace(/0$/, '')}×
          </button>
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            title="Keyboard shortcuts"
            className="p-1.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 transition-colors"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className="text-xs text-gray-600 dark:text-gray-400 grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 bg-white/60 dark:bg-gray-900/40 rounded border border-gray-200 dark:border-gray-700">
          <div><kbd className="font-mono">Space</kbd> Play / pause</div>
          <div><kbd className="font-mono">←</kbd> Back 5 s</div>
          <div><kbd className="font-mono">→</kbd> Forward 5 s</div>
          <div><kbd className="font-mono">S</kbd> Cycle speed</div>
        </div>
      )}

      {audioError && (
        <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded">
          {audioError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          title="Play / pause (Space)"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>

        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
        />

        <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
          className="flex-1 h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
}
