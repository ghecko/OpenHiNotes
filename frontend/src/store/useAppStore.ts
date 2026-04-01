import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  HiDockDevice,
  AudioRecording,
  Transcription,
  SummaryTemplate,
} from '@/types';

interface AppState {
  device: HiDockDevice | null;
  recordings: AudioRecording[];
  isDeviceConnected: boolean;
  selectedRecordings: string[];
  theme: 'dark' | 'light';
  transcriptions: Transcription[];
  templates: SummaryTemplate[];
  recordingAliases: Record<string, string>; // fileName → alias
  recordingCollections: Record<string, string>; // fileName → collectionId

  setDevice: (device: HiDockDevice | null) => void;
  setRecordings: (recordings: AudioRecording[]) => void;
  addRecordings: (recordings: AudioRecording[]) => void;
  toggleRecordingSelection: (id: string) => void;
  clearSelectedRecordings: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setTranscriptions: (transcriptions: Transcription[]) => void;
  setTemplates: (templates: SummaryTemplate[]) => void;
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
      isDeviceConnected: false,
      selectedRecordings: [],
      theme: 'light',
      transcriptions: [],
      templates: [],
      recordingAliases: {},
      recordingCollections: {},

      setDevice: (device: HiDockDevice | null) => {
        set({
          device,
          isDeviceConnected: device?.connected ?? false,
        });
      },

      setRecordings: (recordings: AudioRecording[]) => {
        set({ recordings });
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
        recordingAliases: state.recordingAliases,
        recordingCollections: state.recordingCollections,
      }),
    }
  )
);
