import { useState } from 'react';
import { Brain, ChevronRight, AlertTriangle } from 'lucide-react';
import { Summary } from '@/types';

/** Warning (completed with a note) and the model's reasoning, collapsed. */
export function SummaryMeta({ summary }: { summary: Summary }) {
  const [open, setOpen] = useState(false);
  const warning = summary.status === 'completed' ? summary.error_message : null;
  if (!warning && !summary.reasoning) return null;
  return (
    <div className="mb-3 space-y-2">
      {warning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
      {summary.reasoning && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
            <Brain className="w-3.5 h-3.5" />
            Reasoning ({summary.reasoning.length.toLocaleString()} chars)
          </button>
          {open && (
            <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words p-3 text-xs font-mono bg-gray-100 dark:bg-gray-900/60 text-gray-600 dark:text-gray-400 rounded-lg border border-gray-200 dark:border-gray-700">
              {summary.reasoning}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
