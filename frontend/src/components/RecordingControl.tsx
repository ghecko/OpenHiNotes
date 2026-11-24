import { useEffect, useState } from 'react';
import { Circle, Loader, Square } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { deviceService } from '@/services/deviceService';

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Start / stop a recording on the connected HiDock, from any page. Hidden on
 * devices where the record key over USB has not been seen working.
 */
export function RecordingControl() {
  const device = useAppStore((s) => s.device);
  const recording = useAppStore((s) => s.recording);
  const setRecordingState = useAppStore((s) => s.setRecordingState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Let the elapsed time run between two polls
  const recordingFile = recording?.fileName ?? null;
  useEffect(() => {
    if (!recordingFile) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [recordingFile]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

  if (!device?.connected || !deviceService.getCapabilities().recordingControl) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setRecordingState(await deviceService.setRecording(!recording));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording control failed');
    } finally {
      setBusy(false);
    }
  };

  const elapsed = recording && recording.seconds !== null
    ? formatElapsed(recording.seconds + (Date.now() - recording.readAt) / 1000)
    : null;

  return (
    <div className="flex items-center gap-2">
      {error && <span className="hidden md:inline text-xs text-red-600 dark:text-red-400 max-w-[16rem] truncate" title={error}>{error}</span>}
      <button
        onClick={toggle}
        disabled={busy}
        title={error ?? (recording ? `Stop recording ${recording.fileName}` : 'Start a recording on the device')}
        className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-full text-xs font-medium transition-colors disabled:opacity-60 ${recording
          ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white'
          : 'bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}
      >
        {busy
          ? <Loader className="w-3.5 h-3.5 animate-spin" />
          : recording
            ? <Square className="w-3 h-3 fill-current" />
            : <Circle className="w-3 h-3 fill-red-500 text-red-500" />}
        <span className="hidden sm:inline">
          {recording ? (elapsed ? `Stop ${elapsed}` : 'Stop') : 'Record'}
        </span>
      </button>
    </div>
  );
}
