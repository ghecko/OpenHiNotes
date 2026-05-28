import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { templatesApi } from '@/api/templates';
import { SummaryTemplate } from '@/types';
import { Check, X, AlertTriangle, RefreshCw, Inbox } from 'lucide-react';

/**
 * Admin review queue for user-submitted templates.
 *
 * Lists templates in `pending_review`, letting an admin:
 *  - Approve (→ public, creator gets a notification).
 *  - Reject with optional feedback (→ back to private with feedback stored
 *    on the template + surfaced in the creator's notification).
 *
 * "Edit before approving" is intentionally not implemented as a separate
 * mode: admins can open the template in the main Templates tab (which has
 * full admin edit), then come back and approve. Keeps this view focused.
 */
export function TemplateReview({ embedded }: { embedded?: boolean }) {
  const [pending, setPending] = useState<SummaryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await templatesApi.getPendingReview();
      setPending(items);
    } catch (err) {
      console.error(err);
      setError('Failed to load pending templates.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (t: SummaryTemplate) => {
    setBusyId(t.id);
    try {
      await templatesApi.approveTemplate(t.id);
      setPending((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      console.error(err);
      setError(`Could not approve "${t.name}".`);
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (t: SummaryTemplate) => {
    setRejectingId(t.id);
    setFeedback('');
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    setBusyId(rejectingId);
    try {
      await templatesApi.rejectTemplate(rejectingId, feedback.trim() || undefined);
      setPending((prev) => prev.filter((x) => x.id !== rejectingId));
      setRejectingId(null);
      setFeedback('');
    } catch (err) {
      console.error(err);
      setError('Could not reject template.');
    } finally {
      setBusyId(null);
    }
  };

  const cancelReject = () => {
    setRejectingId(null);
    setFeedback('');
  };

  const content = (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Template review queue
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Templates submitted by users waiting for approval.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No templates waiting for review.
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((t) => (
            <div
              key={t.id}
              className="p-5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-900/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.category && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {t.category}
                      </span>
                    )}
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {t.name}
                    </h3>
                    {t.target_type && t.target_type !== 'both' && (
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                          t.target_type === 'whisper'
                            ? 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300'
                            : 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300'
                        }`}
                      >
                        {t.target_type === 'whisper' ? 'Whisper' : 'Record'}
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t.description}
                    </p>
                  )}
                  <pre className="text-xs text-gray-600 dark:text-gray-300 mt-3 bg-white dark:bg-gray-900/40 p-3 rounded border border-gray-200 dark:border-gray-700 whitespace-pre-wrap font-mono">
                    {t.prompt_template}
                  </pre>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Submitted {new Date(t.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {rejectingId === t.id ? (
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Rejection feedback <span className="text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="What should the creator change before resubmitting?"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={confirmReject}
                      disabled={busyId === t.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Confirm reject
                    </button>
                    <button
                      onClick={cancelReject}
                      className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => approve(t)}
                    disabled={busyId === t.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => openReject(t)}
                    disabled={busyId === t.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) return content;
  return <Layout title="Template review">{content}</Layout>;
}
