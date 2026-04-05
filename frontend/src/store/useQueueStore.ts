import { create } from 'zustand';
import { Transcription, QueueSSEEvent } from '@/types';
import { transcriptionsApi } from '@/api/transcriptions';

interface QueueItem {
  transcription: Transcription;
  /** Whether we're actively listening to SSE updates for this item */
  isStreaming: boolean;
  /** Function to abort the SSE stream */
  abortStream?: () => void;
}

interface QueueNotification {
  id: string;
  transcriptionId: string;
  title: string;
  type: 'started' | 'completed' | 'failed' | 'queued' | 'cancelled';
  message: string;
  timestamp: number;
  read: boolean;
}

interface VoxhubInfo {
  pending: number;
  processing: number;
  total: number;
  jobs_ahead: number;
}

interface QueueState {
  /** Active queue items (queued + processing) for the current user */
  items: QueueItem[];
  /** Notification history */
  notifications: QueueNotification[];
  /** Whether the queue panel is open */
  isPanelOpen: boolean;
  /** Loading state */
  isLoading: boolean;
  /** VoxHub server queue info */
  voxhubInfo: VoxhubInfo | null;

  // Actions
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  fetchMyQueue: () => Promise<void>;
  fetchVoxhubInfo: () => Promise<void>;
  addQueueItem: (transcription: Transcription) => void;
  updateQueueItem: (transcriptionId: string, updates: Partial<Transcription>) => void;
  removeQueueItem: (transcriptionId: string) => void;
  cancelQueueItem: (transcriptionId: string) => Promise<boolean>;
  startStreaming: (transcriptionId: string) => void;
  stopStreaming: (transcriptionId: string) => void;
  stopAllStreaming: () => void;
  addNotification: (notification: Omit<QueueNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  unreadCount: () => number;
}

export const useQueueStore = create<QueueState>()((set, get) => ({
  items: [],
  notifications: [],
  isPanelOpen: false,
  isLoading: false,
  voxhubInfo: null,

  setPanelOpen: (open) => set({ isPanelOpen: open }),
  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),

  fetchMyQueue: async () => {
    set({ isLoading: true });
    try {
      // Abort any existing SSE streams before replacing items
      get().stopAllStreaming();

      const items = await transcriptionsApi.getMyQueueItems();
      set({
        items: items.map((t) => ({
          transcription: t,
          isStreaming: false,
        })),
        isLoading: false,
      });

      // Start streaming for each active item
      for (const t of items) {
        if (t.status === 'queued' || t.status === 'processing') {
          get().startStreaming(t.id);
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  fetchVoxhubInfo: async () => {
    try {
      const info = await transcriptionsApi.getVoxhubQueueInfo();
      set({ voxhubInfo: info });
    } catch {
      // Ignore — info is optional
    }
  },

  cancelQueueItem: async (transcriptionId) => {
    try {
      await transcriptionsApi.cancelTranscription(transcriptionId);
      const item = get().items.find((i) => i.transcription.id === transcriptionId);
      const title = item?.transcription.title || item?.transcription.original_filename || 'Transcription';

      get().addNotification({
        transcriptionId,
        title,
        type: 'cancelled',
        message: 'Transcription cancelled',
      });

      get().removeQueueItem(transcriptionId);
      return true;
    } catch {
      return false;
    }
  },

  addQueueItem: (transcription) => {
    set((s) => ({
      items: [
        ...s.items.filter((i) => i.transcription.id !== transcription.id),
        { transcription, isStreaming: false },
      ],
    }));

    // Add notification
    get().addNotification({
      transcriptionId: transcription.id,
      title: transcription.title || transcription.original_filename,
      type: 'queued',
      message: transcription.queue_position
        ? `Added to queue at position ${transcription.queue_position}`
        : 'Added to queue',
    });

    // Start SSE streaming for this item
    get().startStreaming(transcription.id);
  },

  updateQueueItem: (transcriptionId, updates) => {
    set((s) => ({
      items: s.items.map((item) =>
        item.transcription.id === transcriptionId
          ? {
              ...item,
              transcription: { ...item.transcription, ...updates },
            }
          : item
      ),
    }));
  },

  removeQueueItem: (transcriptionId) => {
    const item = get().items.find((i) => i.transcription.id === transcriptionId);
    if (item?.abortStream) {
      item.abortStream();
    }
    set((s) => ({
      items: s.items.filter((i) => i.transcription.id !== transcriptionId),
    }));
  },

  startStreaming: (transcriptionId) => {
    const existing = get().items.find((i) => i.transcription.id === transcriptionId);
    if (!existing || existing.isStreaming) return;

    const abort = transcriptionsApi.streamQueueStatus(
      transcriptionId,
      (event: QueueSSEEvent) => {
        const store = get();
        const item = store.items.find((i) => i.transcription.id === transcriptionId);
        if (!item) return;

        const title = item.transcription.title || item.transcription.original_filename;

        switch (event.event) {
          case 'progress':
            store.updateQueueItem(transcriptionId, {
              progress: event.progress ?? null,
              progress_stage: event.stage ?? null,
              status: 'processing',
            });
            break;

          case 'position_update':
            store.updateQueueItem(transcriptionId, {
              queue_position: event.queue_position ?? null,
            });
            break;

          case 'processing_started':
            store.updateQueueItem(transcriptionId, {
              status: 'processing',
              progress: 0,
              queue_position: 0,
            });
            store.addNotification({
              transcriptionId,
              title,
              type: 'started',
              message: 'Transcription started processing',
            });
            break;

          case 'completed':
            store.updateQueueItem(transcriptionId, {
              status: 'completed',
              progress: 100,
              queue_position: null,
            });
            store.addNotification({
              transcriptionId,
              title,
              type: 'completed',
              message: 'Transcription completed!',
            });
            // Remove from active queue after a short delay
            setTimeout(() => {
              store.removeQueueItem(transcriptionId);
            }, 500);
            break;

          case 'failed':
            store.updateQueueItem(transcriptionId, {
              status: 'failed',
              error_message: event.error || 'Transcription failed',
              queue_position: null,
            });
            store.addNotification({
              transcriptionId,
              title,
              type: 'failed',
              message: event.error || 'Transcription failed',
            });
            setTimeout(() => {
              store.removeQueueItem(transcriptionId);
            }, 500);
            break;

          case 'cancelled':
            store.updateQueueItem(transcriptionId, {
              status: 'cancelled',
              queue_position: null,
            });
            store.addNotification({
              transcriptionId,
              title,
              type: 'cancelled',
              message: 'Transcription cancelled',
            });
            setTimeout(() => {
              store.removeQueueItem(transcriptionId);
            }, 500);
            break;

          case 'status':
          case 'queued':
            store.updateQueueItem(transcriptionId, {
              status: (event.status as Transcription['status']) || 'queued',
              progress: event.progress ?? null,
              progress_stage: event.stage ?? null,
              queue_position: event.queue_position ?? null,
            });
            break;
        }
      },
      () => {
        // On error, mark as not streaming
        set((s) => ({
          items: s.items.map((i) =>
            i.transcription.id === transcriptionId
              ? { ...i, isStreaming: false, abortStream: undefined }
              : i
          ),
        }));
      }
    );

    set((s) => ({
      items: s.items.map((i) =>
        i.transcription.id === transcriptionId
          ? { ...i, isStreaming: true, abortStream: abort }
          : i
      ),
    }));
  },

  stopStreaming: (transcriptionId) => {
    const item = get().items.find((i) => i.transcription.id === transcriptionId);
    if (item?.abortStream) {
      item.abortStream();
    }
    set((s) => ({
      items: s.items.map((i) =>
        i.transcription.id === transcriptionId
          ? { ...i, isStreaming: false, abortStream: undefined }
          : i
      ),
    }));
  },

  stopAllStreaming: () => {
    for (const item of get().items) {
      if (item.abortStream) {
        item.abortStream();
      }
    }
    set((s) => ({
      items: s.items.map((i) => ({ ...i, isStreaming: false, abortStream: undefined })),
    }));
  },

  addNotification: (notification) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({
      notifications: [
        { ...notification, id, timestamp: Date.now(), read: false },
        ...s.notifications.slice(0, 49), // Keep max 50
      ],
    }));
  },

  markNotificationRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  },

  clearNotifications: () => set({ notifications: [] }),

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
