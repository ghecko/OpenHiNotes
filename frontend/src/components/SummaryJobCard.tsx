import { useEffect, useState } from 'react';
import { Loader, Brain, PenLine, Clock, XCircle, RotateCcw, Trash2, Ban } from 'lucide-react';
import { Summary } from '@/types';
import { parseServerDate } from '@/utils/dates';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function fmtElapsed(ms: number) {
  if (!isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function tail(text: string, n = 600) {
  return text.length > n ? '…' + text.slice(-n) : text;
}

interface SummaryJobCardProps {
  summary: Summary;
  templateName?: string;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

/** A summary that is queued, being generated, failed or cancelled. */
export function SummaryJobCard({ summary, templateName, onCancel, onRetry, onDelete }: SummaryJobCardProps) {
  const active = summary.status === 'pending' || summary.status === 'processing';
  const now = useNow(active);
  const started = summary.started_at ? parseServerDate(summary.started_at).getTime() : NaN;
  const lastUpdate = summary.updated_at ? parseServerDate(summary.updated_at).getTime() : NaN;
  const [busy, setBusy] = useState(false);

  const run = async (fn: (id: string) => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn(summary.id);
    } finally {
      setBusy(false);
    }
  };

  let icon = <Loader className="w-4 h-4 animate-spin text-blue-500" />;
  let label = '';
  let tone = 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20';
  if (summary.status === 'pending') {
    icon = <Clock className="w-4 h-4 text-gray-500" />;
    label = summary.queue_position && summary.queue_position > 1
      ? `Queued (#${summary.queue_position})`
      : 'Queued, starting soon';
    tone = 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50';
  } else if (summary.status === 'processing') {
    if (summary.phase === 'thinking') {
      icon = <Brain className="w-4 h-4 text-purple-500 animate-pulse" />;
      label = 'Thinking';
    } else if (summary.phase === 'writing') {
      icon = <PenLine className="w-4 h-4 text-blue-500 animate-pulse" />;
      label = 'Writing';
    } else {
      label = 'Waiting for the model (reading the transcript)';
    }
  } else if (summary.status === 'failed') {
    icon = <XCircle className="w-4 h-4 text-red-500" />;
    label = 'Failed';
    tone = 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20';
  } else if (summary.status === 'cancelled') {
    icon = <Ban className="w-4 h-4 text-gray-500" />;
    label = 'Cancelled';
    tone = 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50';
  }

  const details: string[] = [];
  if (summary.status === 'processing' && isFinite(started)) details.push(fmtElapsed(now - started));
  if (summary.reasoning) details.push(`${summary.reasoning.length.toLocaleString()} chars of reasoning`);
  if (summary.content) details.push(`${summary.content.length.toLocaleString()} chars written`);
  // No progress write for a while: the model may be slow on the prompt, or stuck.
  const quietFor = summary.status === 'processing' && isFinite(lastUpdate) ? now - lastUpdate : 0;

  const preview = summary.status === 'processing'
    ? summary.phase === 'writing' ? summary.content : summary.reasoning || ''
    : '';

  return (
    <div className={`p-3 rounded-lg border ${tone}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {label}
            {templateName && <span className="font-normal text-gray-500 dark:text-gray-400"> · {templateName}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {[summary.model_used, summary.reasoning_level && `thinking: ${summary.reasoning_level}`, ...details]
              .filter(Boolean)
              .join(' · ')}
            {quietFor > 30000 && ` · no update for ${fmtElapsed(quietFor)}`}
          </p>
          {summary.error_message && summary.status !== 'completed' && summary.status !== 'cancelled' && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300 break-words">{summary.error_message}</p>
          )}
          {preview && (
            <pre className="mt-2 max-h-32 overflow-hidden whitespace-pre-wrap break-words text-xs font-mono text-gray-500 dark:text-gray-400">
              {tail(preview)}
            </pre>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {active ? (
            <button
              onClick={() => run(onCancel)}
              disabled={busy}
              className="px-2 py-1 text-xs rounded-lg bg-white/70 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={() => run(onRetry)}
                disabled={busy}
                className="px-2 py-1 text-xs rounded-lg bg-white/70 dark:bg-gray-800/70 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
              <button
                onClick={() => run(onDelete)}
                disabled={busy}
                className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
