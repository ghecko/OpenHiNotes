import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  HiDockDevice,
  AudioRecording,
  Transcription,
  SummaryTemplate,
  KnownDevice,
  RecordingState,
} from '@/types';
import { deviceKey } from '@/utils/audioLocation';

interface AppState {
  device: HiDockDevice | null;
  recordings: AudioRecording[];
  /** Key of the device `recordings` was read from; null until a list is loaded. */
  recordingsDeviceSerial: string | null;
  /** The user's HiDocks and the files each held when last connected (server registry). */
  knownDevices: KnownDevice[];
  /** What the connected device is recording right now (null when idle or unknown),
   *  with the time it was read so the elapsed time can tick between polls. */
  recording: (RecordingState & { readAt: number }) | null;
  isDeviceConnected: boolean;
  selectedRecordings: string[];
  theme: 'dark' | 'light';
  transcriptions: Transcription[];
  templates: SummaryTemplate[];
  recordingAliases: Record<string, string>; // fileName → alias
  recordingCollections: Record<string, string>; // fileName → collectionId

  setDevice: (device: HiDockDevice | null) => void;
  setRecordings: (recordings: AudioRecording[]) => void;
  setKnownDevices: (devices: KnownDevice[]) => void;
  setRecordingState: (state: RecordingState | null) => void;
  addRecordings: (recordings: AudioRecording[]) => void;
  toggleRecordingSelection: (id: string) => void;
  clearSelectedRecordings: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setTranscriptions: (transcriptions: Transcription[]) => void;
  setTemplates: (templates: SummaryTemplate[]) => void;
  setRecordingAliases: (aliases: Record<string, string>) => void;
  setRecordingAlias: (fileName: string, alias: string) => void;
  removeRecordingAlias: (fileName: string) => void;
  cleanOrphanAliases: (currentFileNames: string[]) => void;
  setRecordingCollection: (fileName: string, collectionId: string) => void;
  removeRecordingCollection: (fileName: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      device: null,
      recordings: [],
      recordingsDeviceSerial: null,
      knownDevices: [],
      recording: null,
      isDeviceConnected: false,
      selectedRecordings: [],
      theme: 'light',
      transcriptions: [],
      templates: [],
      recordingAliases: {},
      recordingCollections: {},

      setDevice: (device: HiDockDevice | null) => {
        set((state) => {
          // A different HiDock than the one the file list came from: that
          // list says nothing about this device, drop it.
          const otherDevice = !!device && state.recordingsDeviceSerial !== null
            && state.recordingsDeviceSerial !== deviceKey(device);
          return {
            device,
            isDeviceConnected: device?.connected ?? false,
            ...(otherDevice ? { recordings: [], recordingsDeviceSerial: null, selectedRecordings: [] } : {}),
          };
        });
      },

      setRecordings: (recordings: AudioRecording[]) => {
        set((state) => ({
          recordings,
          recordingsDeviceSerial: state.device ? deviceKey(state.device) : state.recordingsDeviceSerial,
        }));
      },

      setKnownDevices: (knownDevices: KnownDevice[]) => {
        set({ knownDevices });
      },

      setRecordingState: (next: RecordingState | null) => {
        set((state) => {
          if (!next) return state.recording ? { recording: null } : state;
          return { recording: { ...next, readAt: Date.now() } };
        });
      },

      addRecordings: (recordings: AudioRecording[]) => {
        set((state) => ({
          recordings: [...state.recordings, ...recordings],
        }));
      },

      toggleRecordingSelection: (id: string) => {
        set((state) => {
          const selected = state.selectedRecordings.includes(id)
            ? state.selectedRecordings.filter((sid) => sid !== id)
            : [...state.selectedRecordings, id];
          return { selectedRecordings: selected };
        });
      },

      clearSelectedRecordings: () => {
        set({ selectedRecordings: [] });
      },

      setTheme: (theme: 'dark' | 'light') => {
        set({ theme });
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },

      setTranscriptions: (transcriptions: Transcription[]) => {
        set({ transcriptions });
      },

      setTemplates: (templates: SummaryTemplate[]) => {
        set({ templates });
      },

      setRecordingAliases: (aliases: Record<string, string>) => {
        set({ recordingAliases: aliases });
      },

      setRecordingAlias: (fileName: string, alias: string) => {
        set((state) => ({
          recordingAliases: { ...state.recordingAliases, [fileName]: alias },
        }));
      },

      removeRecordingAlias: (fileName: string) => {
        set((state) => {
          const { [fileName]: _, ...rest } = state.recordingAliases;
          return { recordingAliases: rest };
        });
      },

      setRecordingCollection: (fileName: string, collectionId: string) => {
        set((state) => ({
          recordingCollections: { ...state.recordingCollections, [fileName]: collectionId },
        }));
      },

      removeRecordingCollection: (fileName: string) => {
        set((state) => {
          const { [fileName]: _, ...rest } = state.recordingCollections;
          return { recordingCollections: rest };
        });
      },

      // Keeps the aliases of the given file names, drops the others
      cleanOrphanAliases: (currentFileNames: string[]) => {
        set((state) => {
          const fileSet = new Set(currentFileNames);
          const cleaned: Record<string, string> = {};
          for (const [key, value] of Object.entries(state.recordingAliases) as [string, string][]) {
            if (fileSet.has(key)) {
              cleaned[key] = value;
            }
          }
          return { recordingAliases: cleaned };
        });
      },
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        theme: state.theme,
        recordingCollections: state.recordingCollections,
      }),
    }
  )
);
