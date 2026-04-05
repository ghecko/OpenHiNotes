import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListOrdered,
  X,
  Loader,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Bell,
  Trash2,
  XCircle,
  Server,
  Ban,
} from 'lucide-react';
import { useQueueStore } from '@/store/useQueueStore';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function getStageLabel(stage: string | null | undefined): string {
  switch (stage) {
    case 'uploading':
      return 'Uploading audio...';
    case 'waiting':
      return 'Waiting for server...';
    case 'loading':
      return 'Loading model...';
    case 'vad':
      return 'Detecting speech...';
    case 'transcribing':
      return 'Transcribing...';
    case 'diarizing':
      return 'Identifying speakers...';
    case 'aligning':
      return 'Aligning words...';
    default:
      return stage ? `${stage.charAt(0).toUpperCase() + stage.slice(1)}...` : 'Processing...';
  }
}

/** Small badge that goes on the header, showing queue count + opening the panel */
export function QueueIndicator() {
  const { items, notifications, isPanelOpen, togglePanel, fetchMyQueue, fetchVoxhubInfo } = useQueueStore();
  const unreadCount = useQueueStore((s) => s.unreadCount());
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchMyQueue();
      fetchVoxhubInfo();
    }
  }, [fetchMyQueue, fetchVoxhubInfo]);

  // Refresh VoxHub info periodically when items are active
  useEffect(() => {
    if (items.length === 0) return;
    const interval = setInterval(() => fetchVoxhubInfo(), 10000);
    return () => clearInterval(interval);
  }, [items.length, fetchVoxhubInfo]);

  const activeCount = items.length;
  const showBadge = activeCount > 0 || unreadCount > 0;

  return (
    <div className="relative">
      <button
        onClick={togglePanel}
        className={`relative p-2 rounded-lg transition-all duration-200 ${
          isPanelOpen
            ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
        title="Transcription Queue"
      >
        <ListOrdered className="w-5 h-5" />
        {showBadge && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-primary-500 rounded-full shadow-sm">
            {activeCount > 0 ? activeCount : unreadCount}
          </span>
        )}
      </button>

      {isPanelOpen && <QueuePanel />}
    </div>
  );
}

function QueuePanel() {
  const navigate = useNavigate();
  const {
    items,
    notifications,
    isPanelOpen,
    setPanelOpen,
    clearNotifications,
    markNotificationRead,
    cancelQueueItem,
    voxhubInfo,
  } = useQueueStore();
  const [cancelling, setCancelling] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if clicking the toggle button
        const target = e.target as HTMLElement;
        if (target.closest('[title="Transcription Queue"]')) return;
        setPanelOpen(false);
      }
    }
    if (isPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPanelOpen, setPanelOpen]);

  const hasActiveItems = items.length > 0;
  const hasNotifications = notifications.length > 0;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700/60 shadow-2xl overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-800/80">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Transcription Queue
          </h3>
        </div>
        <button
          onClick={() => setPanelOpen(false)}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto max-h-[calc(80vh-48px)]">
        {/* VoxHub server info */}
        {voxhubInfo && (voxhubInfo.pending > 0 || voxhubInfo.processing > 0) && (
          <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-700/20 border-b border-gray-200/40 dark:border-gray-700/30">
            <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <Server className="w-3 h-3" />
              <span>
                VoxHub: {voxhubInfo.processing > 0 ? `${voxhubInfo.processing} processing` : ''}
                {voxhubInfo.processing > 0 && voxhubInfo.pending > 0 ? ', ' : ''}
                {voxhubInfo.pending > 0 ? `${voxhubInfo.pending} pending` : ''}
                {voxhubInfo.jobs_ahead > 0 ? ` (${voxhubInfo.jobs_ahead} ahead of you)` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Active Queue Items */}
        {hasActiveItems && (
          <div className="p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
              Active
            </p>
            {items.map(({ transcription: t }) => (
              <div
                key={t.id}
                className="p-3 bg-gray-50/80 dark:bg-gray-700/40 rounded-lg space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {t.title || t.original_filename}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {t.status === 'queued' && (
                        <>
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Queue position: {t.queue_position}
                          </span>
                        </>
                      )}
                      {t.status === 'processing' && (
                        <>
                          <Loader className="w-3 h-3 text-blue-500 animate-spin" />
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            {getStageLabel(t.progress_stage)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setCancelling(t.id);
                      await cancelQueueItem(t.id);
                      setCancelling(null);
                    }}
                    disabled={cancelling === t.id}
                    className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Cancel transcription"
                  >
                    {cancelling === t.id ? (
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Progress bar for processing items */}
                {t.status === 'processing' && (
                  <div className="space-y-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(2, t.progress || 0)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 text-right">
                      {Math.round(t.progress || 0)}%
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Notifications */}
        {hasNotifications && (
          <div className="p-3 space-y-2 border-t border-gray-200/60 dark:border-gray-700/40">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <Bell className="w-3 h-3 text-gray-400" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Notifications
                </p>
              </div>
              <button
                onClick={clearNotifications}
                className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>
            {notifications.slice(0, 10).map((notif) => (
              <button
                key={notif.id}
                onClick={() => {
                  markNotificationRead(notif.id);
                  if (notif.type === 'completed') {
                    navigate(`/transcriptions/${notif.transcriptionId}`);
                    setPanelOpen(false);
                  }
                }}
                className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                  !notif.read
                    ? 'bg-primary-50/50 dark:bg-primary-900/15 hover:bg-primary-50 dark:hover:bg-primary-900/25'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 mt-0.5">
                    {notif.type === 'completed' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {notif.type === 'failed' && (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    {notif.type === 'started' && (
                      <Loader className="w-4 h-4 text-blue-500" />
                    )}
                    {notif.type === 'queued' && (
                      <Clock className="w-4 h-4 text-amber-500" />
                    )}
                    {notif.type === 'cancelled' && (
                      <Ban className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {notif.title}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                      {formatTimeAgo(notif.timestamp)}
                    </p>
                  </div>
                  {notif.type === 'completed' && (
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!hasActiveItems && !hasNotifications && (
          <div className="p-8 text-center">
            <ListOrdered className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No transcriptions in queue
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Send transcriptions to the background to process them while you work
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
