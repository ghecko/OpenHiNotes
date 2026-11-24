import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { deviceService } from '@/services/deviceService';

/** Poll interval while idle, and while a recording runs (its elapsed time is shown). */
const IDLE_POLL_MS = 4000;
const RECORDING_POLL_MS = 2000;
const FIRST_POLL_MS = 1500;
/** Unanswered polls in a row after which the firmware is taken not to report its state. */
const MAX_MISSES = 2;
/** After a recording ends: when to re-read the file list, and when to try once
 *  more if the new file is not in it yet (the device needs a moment to close it). */
const LIST_AFTER_STOP_MS = 1000;
const LIST_RETRY_MS = 2500;

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
  const recordingFile = useAppStore((s) => s.recording?.fileName ?? null);
  const lastRecordingFile = useRef<string | null>(null);

  // A recording just ended (Stop in the app or the button on the device):
  // re-read the file list so the new recording shows up without a reload.
  useEffect(() => {
    const ended = lastRecordingFile.current;
    lastRecordingFile.current = recordingFile;
    if (!ended || recordingFile || !connected) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = (retry: boolean) => {
      if (cancelled || !deviceService.isConnected()) return;
      deviceService.getFileList()
        .then((recs) => {
          if (cancelled || !deviceService.isConnected()) return;
          useAppStore.getState().setRecordings(recs);
          if (retry && !recs.some((r) => r.fileName === ended)) {
            timer = setTimeout(() => refresh(false), LIST_RETRY_MS);
          }
        })
        .catch((err) => console.warn('[OpenHiNotes] Could not refresh recordings after stop:', err));
    };
    timer = setTimeout(() => refresh(true), LIST_AFTER_STOP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recordingFile, connected]);

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
