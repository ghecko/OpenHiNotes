import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { devicesApi } from '@/api/devices';
import { deviceService } from '@/services/deviceService';
import {
  AudioLocation, AudioLocationContext, deviceKey, heldByOtherDevice, locateAudio,
} from '@/utils/audioLocation';

/**
 * Keep the server's device registry in step with what the connected HiDock
 * holds: load the known devices once signed in, and report every file list
 * read from a device (which also lets the server match older transcriptions
 * to it). Mount a single time, in App.
 */
export function useDeviceFileSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const recordings = useAppStore((s) => s.recordings);
  const listSerial = useAppStore((s) => s.recordingsDeviceSerial);
  const setKnownDevices = useAppStore((s) => s.setKnownDevices);
  const connected = useAppStore((s) => s.device?.connected ?? false);
  const connectedKey = useAppStore((s) => (s.device ? deviceKey(s.device) : null));

  // Read the file list once per connection, on whatever page the user is, so
  // device badges and the registry do not depend on a visit to Recordings.
  // That page lists the device itself on mount: wait, and step aside if a
  // listing is running or done.
  useEffect(() => {
    if (!isAuthenticated || !connected || !connectedKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = (retriesLeft: number) => {
      if (cancelled || !deviceService.isConnected()) return;
      const state = useAppStore.getState();
      if (state.recordingsDeviceSerial === connectedKey) return;
      if (deviceService.isBusy()) {
        if (retriesLeft > 0) timer = setTimeout(() => attempt(retriesLeft - 1), 4000);
        return;
      }
      deviceService.getFileList()
        .then((recs) => {
          const now = useAppStore.getState();
          if (!cancelled && now.device && deviceKey(now.device) === connectedKey) now.setRecordings(recs);
        })
        .catch((err) => console.warn('[OpenHiNotes] Could not list device files:', err));
    };
    timer = setTimeout(() => attempt(3), 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, connected, connectedKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    devicesApi.list().then(setKnownDevices).catch((err) => {
      console.warn('[OpenHiNotes] Could not load known devices:', err);
    });
  }, [isAuthenticated, setKnownDevices]);

  useEffect(() => {
    if (!isAuthenticated || !listSerial) return;
    const device = useAppStore.getState().device;
    // The list must belong to the device that is connected right now
    if (!device || deviceKey(device) !== listSerial) return;
    const names = recordings.map((r) => r.fileName);
    let cancelled = false;
    const timer = setTimeout(() => {
      devicesApi.reportFiles(listSerial, device.deviceModel, names)
        .then((res) => { if (!cancelled) setKnownDevices(res.devices); })
        .catch((err) => console.warn('[OpenHiNotes] Could not report device files:', err));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, recordings, listSerial, setKnownDevices]);
}

/** Locate the source recording of a transcription among the user's HiDocks. */
export function useAudioLocator() {
  const recordings = useAppStore((s) => s.recordings);
  const listSerial = useAppStore((s) => s.recordingsDeviceSerial);
  const known = useAppStore((s) => s.knownDevices);

  const ctx = useMemo<AudioLocationContext>(() => ({
    listSerial,
    fileNames: new Set(recordings.map((r) => r.fileName)),
    known,
    knownFiles: new Map(known.map((d) => [d.serial, new Set(d.file_names)])),
  }), [recordings, listSerial, known]);

  const locate = useCallback(
    (t: Parameters<typeof locateAudio>[0]): AudioLocation => locateAudio(t, ctx),
    [ctx],
  );
  const heldElsewhere = useCallback((fileName: string) => heldByOtherDevice(fileName, ctx), [ctx]);

  return { locate, heldElsewhere, listLoaded: listSerial !== null };
}
