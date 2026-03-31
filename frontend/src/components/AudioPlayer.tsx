import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  src: string | Blob;
  fileName: string;
}

export function AudioPlayer({ src, fileName }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

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
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setVolume(newVolume);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Create and revoke object URL properly to avoid memory leaks
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

      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
        {fileName}
      </div>

      {audioError && (
        <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded">
          {audioError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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

        <span className="text-xs text-gray-600 dark:text-gray-400 w-12 text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
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
