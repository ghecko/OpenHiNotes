import { useEffect, useState } from 'react';
import { Circle, Loader, Square } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { deviceService } from '@/services/deviceService';

/** "00:09", "12:34", "1:02:03": two-digit minutes so the width does not change at 10 minutes. */
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
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

  // Count on this computer's clock from the recording's start, re-rendering
  // right after each whole second: a plain 1 s interval drifts against the
  // second boundaries and makes the display skip or stall.
  const startedAt = recording?.startedAt ?? null;
  useEffect(() => {
    if (startedAt === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const intoSecond = (Date.now() - startedAt) % 1000;
      timer = setTimeout(() => {
        setTick((n) => n + 1);
        schedule();
      }, 1000 - intoSecond + 20);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [startedAt]);

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

  const elapsed = startedAt !== null ? formatElapsed((Date.now() - startedAt) / 1000) : null;

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
        <span className="hidden sm:inline tabular-nums">
          {recording ? (elapsed ? `Stop ${elapsed}` : 'Stop') : 'Record'}
        </span>
      </button>
    </div>
  );
}
