import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { deviceService } from '@/services/deviceService';

/** Poll interval while idle, and while a recording runs (its elapsed time is shown). */
const IDLE_POLL_MS = 4000;
const RECORDING_POLL_MS = 2000;
const FIRST_POLL_MS = 1500;
/** Unanswered polls in a row after which the firmware is taken not to report its state. */
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
  const setRecordingState = useAppStore((s) => s.setRecordingState);

  useEffect(() => {
    setRecordingState(null);
    if (!connected) return;

    let stopped = false;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible' && deviceService.isConnected() && !deviceService.isBusy()) {
        try {
          const state = await deviceService.getRecordingState();
          if (stopped) return;
          if (state === undefined) {
            misses += 1;
            if (misses >= MAX_MISSES) {
              console.info('[OpenHiNotes] Recording status not available on this firmware');
              setRecordingState(null);
              return;
            }
          } else {
            misses = 0;
            setRecordingState(state);
          }
        } catch {
          // device unplugged mid-poll: the hot-plug handler takes over
        }
      }
      timer = setTimeout(tick, useAppStore.getState().recording ? RECORDING_POLL_MS : IDLE_POLL_MS);
    };

    timer = setTimeout(tick, FIRST_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected, deviceId, setRecordingState]);
}
