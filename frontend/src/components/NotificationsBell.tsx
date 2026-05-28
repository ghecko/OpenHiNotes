import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2 } from 'lucide-react';
import { notificationsApi } from '@/api/notifications';
import { AppNotification } from '@/types';

const POLL_MS = 30_000;

export function NotificationsBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = async () => {
    try {
      const c = await notificationsApi.count();
      setUnread(c.unread);
    } catch {
      // Silent — notifications are non-critical.
    }
  };

  const loadList = async () => {
    setIsLoading(true);
    try {
      const list = await notificationsApi.list({ limit: 20 });
      setItems(list);
      setUnread(list.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll for unread count in the background
  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  // Load full list when opening the panel
  useEffect(() => {
    if (open) loadList();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (n: AppNotification) => {
    if (n.is_read) return;
    try {
      const updated = await notificationsApi.markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? updated : x)));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const onClickItem = async (n: AppNotification) => {
    await markRead(n);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteOne = async (n: AppNotification) => {
    try {
      await notificationsApi.delete(n.id);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      if (!n.is_read) setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 sm:p-2.5 rounded-xl transition-all duration-200 ${
          open
            ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-white'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-400'
        }`}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200/60 dark:border-gray-700/40 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</p>
            {items.some((n) => !n.is_read) && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                      !n.is_read ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => onClickItem(n)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {!n.is_read && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          )}
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {n.title}
                          </p>
                        </div>
                        {n.body && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </button>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.is_read && (
                          <button
                            onClick={() => markRead(n)}
                            title="Mark read"
                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteOne(n)}
                          title="Delete"
                          className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
