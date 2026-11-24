import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { deviceService } from '@/services/deviceService';

const POLL_MS = 5000;
const FIRST_POLL_MS = 1500;
/** Unanswered polls in a row after which the firmware is taken not to support the command. */
const MAX_MISSES = 2;

/**
 * Ask the connected HiDock whether it is recording, every few seconds, and
 * keep the answer in the store for the header. A poll is skipped while the
 * tab is hidden or the device is busy (listing, transfer, settings), and
 * polling stops for this connection when the firmware does not answer.
 * Mount a single time, in App.
 */
export function useRecordingStatusPoll() {
  const connected = useAppStore((s) => s.device?.connected ?? false);
  const deviceId = useAppStore((s) => s.device?.id ?? null);
  const setRecordingFile = useAppStore((s) => s.setRecordingFile);

  useEffect(() => {
    setRecordingFile(null);
    if (!connected) return;

    let stopped = false;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible' && deviceService.isConnected() && !deviceService.isBusy()) {
        try {
          const file = await deviceService.getRecordingFile();
          if (stopped) return;
          if (file === undefined) {
            misses += 1;
            if (misses >= MAX_MISSES) {
              console.info('[OpenHiNotes] Recording status not available on this firmware');
              setRecordingFile(null);
              return;
            }
          } else {
            misses = 0;
            setRecordingFile(file);
          }
        } catch {
          // device unplugged mid-poll: the hot-plug handler takes over
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, FIRST_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected, deviceId, setRecordingFile]);
}
