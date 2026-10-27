import { useState } from 'react';
import { BookA, X } from 'lucide-react';
import { glossaryApi } from '@/api/glossary';
import { parseAliases } from '@/components/VocabularyEditor';

interface AddToVocabularyModalProps {
  /** What the recognizer wrote, e.g. "Voxub" */
  heardAs: string;
  /** The correct spelling, e.g. "VoxHub" */
  term: string;
  /** Collections of the transcription the user can edit, offered as scopes */
  collections?: { id: string; name: string }[];
  onClose: () => void;
  onAdded?: (scope: string) => void;
}

/** Save a correction made in a transcript to the general or the collection vocabulary. */
export function AddToVocabularyModal({ heardAs, term: initialTerm, collections = [], onClose, onAdded }: AddToVocabularyModalProps) {
  const [term, setTerm] = useState(initialTerm);
  const [aliases, setAliases] = useState(heardAs);
  /** A collection id, or 'general' */
  const [scope, setScope] = useState<string>(collections[0]?.id ?? 'general');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const collection = collections.find((c) => c.id === scope);
      await glossaryApi.add({
        term,
        aliases: parseAliases(aliases),
        collection_id: collection ? collection.id : null,
      });
      onAdded?.(collection ? collection.name : 'general vocabulary');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not add the term');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BookA className="w-5 h-5" />
            Add to vocabulary
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Correct spelling</span>
          <input value={term} onChange={(e) => setTerm(e.target.value)} className={inputClass} autoFocus />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Heard as (comma-separated)</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={inputClass} />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Use it for</legend>
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input type="radio" checked={scope === c.id} onChange={() => setScope(c.id)} />
              Transcriptions of the collection “{c.name}”
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="radio" checked={scope === 'general'} onChange={() => setScope('general')} />
            All my transcriptions (general)
          </label>
        </fieldset>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Summaries and chat will use this spelling. Transcripts are not rewritten automatically: use Replace All to fix this one.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !term.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded font-medium"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
