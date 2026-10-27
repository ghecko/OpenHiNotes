import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, Check, X, Loader } from 'lucide-react';
import { glossaryApi, GlossaryTerm } from '@/api/glossary';

/** "a, b , c" → ["a", "b", "c"] */
export const parseAliases = (text: string): string[] =>
  text.split(',').map((a) => a.trim()).filter(Boolean);

const inputClass =
  'px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50';

interface VocabularyEditorProps {
  /** Omit for the current user's general vocabulary. */
  collectionId?: string | null;
  canEdit?: boolean;
}

/**
 * List and edit the vocabulary of a scope: correctly spelled terms the speech
 * recognizer gets wrong, with the variants it produced ("heard as"). Summaries
 * and chat give them to the LLM, which then writes the right spelling.
 */
export function VocabularyEditor({ collectionId = null, canEdit = true }: VocabularyEditorProps) {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTerm, setNewTerm] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setTerms(await glossaryApi.list(collectionId));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Could not load the vocabulary');
    } finally {
      setIsLoading(false);
    }
  }, [collectionId]);

  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim()) return;
    const ok = await run(() =>
      glossaryApi.add({ term: newTerm, aliases: parseAliases(newAliases), collection_id: collectionId }),
    );
    if (ok) { setNewTerm(''); setNewAliases(''); }
  };

  const startEdit = (t: GlossaryTerm) => {
    setEditingId(t.id);
    setEditTerm(t.term);
    setEditAliases(t.aliases.join(', '));
  };

  const handleSave = async (id: string) => {
    const ok = await run(() => glossaryApi.update(id, { term: editTerm, aliases: parseAliases(editAliases) }));
    if (ok) setEditingId(null);
  };

  const handleDelete = (t: GlossaryTerm) => {
    if (!confirm(`Remove "${t.term}" from the vocabulary?`)) return;
    run(() => glossaryApi.delete(t.id));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {collectionId
          ? 'Terms for the transcriptions of this collection, used together with each owner\'s general vocabulary.'
          : 'Terms used for all your transcriptions, together with the vocabulary of their collection.'}{' '}
        Summaries and chat get them so the LLM writes the right spelling, even for variants not listed under "heard as".
      </p>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            placeholder="Term (e.g. Burp Suite)"
            className={`${inputClass} sm:w-48`}
          />
          <input
            value={newAliases}
            onChange={(e) => setNewAliases(e.target.value)}
            placeholder="Heard as, comma-separated (optional)"
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={busy || !newTerm.trim()}
            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded font-medium"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {isLoading ? (
        <Loader className="w-5 h-5 animate-spin text-gray-400" />
      ) : terms.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No terms yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2 group">
              {editingId === t.id ? (
                <>
                  <input value={editTerm} onChange={(e) => setEditTerm(e.target.value)} className={`${inputClass} w-40`} />
                  <input
                    value={editAliases}
                    onChange={(e) => setEditAliases(e.target.value)}
                    placeholder="Heard as, comma-separated"
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                  <button onClick={() => handleSave(t.id)} disabled={busy || !editTerm.trim()} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-40" title="Save">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600" title="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{t.term}</span>
                    {t.aliases.length > 0 && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">heard as: {t.aliases.join(', ')}</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(t)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(t)} disabled={busy} className="p-1 text-gray-400 hover:text-red-500" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
