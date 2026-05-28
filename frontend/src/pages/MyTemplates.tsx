import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { templatesApi } from '@/api/templates';
import { SummaryTemplate, TemplateTargetType } from '@/types';
import {
  Plus,
  Save,
  X,
  Edit,
  Trash2,
  Send,
  Lock,
  Clock,
  Globe,
  AlertTriangle,
} from 'lucide-react';

const CATEGORY_SUGGESTIONS = [
  'General',
  'HR',
  'Client & Sales',
  'Project Management',
  'Leadership',
  'Security',
  'Education',
  'Media',
  'Healthcare',
  'UX & Research',
  'Personal',
];

interface FormState {
  name: string;
  description: string;
  prompt_template: string;
  category: string;
  target_type: TemplateTargetType;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  prompt_template: '',
  category: '',
  target_type: 'both',
};

export function MyTemplates() {
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMine = async () => {
    setIsLoading(true);
    try {
      const t = await templatesApi.getTemplates({ mine: true, includeInactive: true });
      setTemplates(t);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const focused = useMemo(
    () => (focusId ? templates.find((t) => t.id === focusId) : null),
    [focusId, templates],
  );

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsCreating(true);
  };

  const startEdit = (t: SummaryTemplate) => {
    setForm({
      name: t.name,
      description: t.description || '',
      prompt_template: t.prompt_template,
      category: t.category || '',
      target_type: t.target_type || 'both',
    });
    setEditingId(t.id);
    setIsCreating(false);
  };

  const cancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsCreating(false);
  };

  const save = async () => {
    if (!form.name.trim() || !form.prompt_template.trim()) {
      setError('Name and prompt are required');
      return;
    }
    setError(null);
    try {
      if (editingId) {
        const updated = await templatesApi.updateTemplate(editingId, form);
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const created = await templatesApi.createTemplate(form);
        setTemplates((prev) => [...prev, created]);
      }
      cancel();
    } catch (err) {
      console.error(err);
      setError('Save failed. Please try again.');
    }
  };

  const submit = async (t: SummaryTemplate) => {
    try {
      const updated = await templatesApi.submitForReview(t.id);
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (err) {
      console.error(err);
      setError('Could not submit for review.');
    }
  };

  const remove = async (t: SummaryTemplate) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      await templatesApi.deleteTemplate(t.id);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      console.error(err);
      setError('Delete failed.');
    }
  };

  return (
    <Layout title="My Templates">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Create your own summary templates. Templates start as{' '}
            <span className="font-medium">private</span> — only you can use them. Submit a template for
            review to share it with everyone. Once approved, a template becomes public and is managed
            by admins.
          </p>
          {!isCreating && !editingId && (
            <button
              onClick={startCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              New template
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {(isCreating || editingId) && (
          <TemplateForm
            form={form}
            setForm={setForm}
            onSave={save}
            onCancel={cancel}
            title={editingId ? 'Edit template' : 'Create template'}
          />
        )}

        {isLoading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            You don't have any templates yet. Click "New template" to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                highlight={focused?.id === t.id}
                onEdit={startEdit}
                onDelete={remove}
                onSubmit={submit}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function TemplateForm({
  form,
  setForm,
  onSave,
  onCancel,
  title,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Template name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. General, Personal"
              list="category-suggestions-user"
            />
            <datalist id="category-suggestions-user">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target</label>
            <select
              value={form.target_type}
              onChange={(e) => setForm({ ...form, target_type: e.target.value as TemplateTargetType })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="both">Both (Record + Whisper)</option>
              <option value="record">Record only</option>
              <option value="whisper">Whisper only</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief description of what this template does"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Use {'{{transcript}}'} for transcription text, {'{{meeting_date}}'} for the date extracted
            from the device filename.
          </p>
          <textarea
            value={form.prompt_template}
            onChange={(e) => setForm({ ...form, prompt_template: e.target.value })}
            rows={6}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter prompt template…"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-lg font-medium text-sm"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function VisibilityBadge({ template }: { template: SummaryTemplate }) {
  if (template.visibility === 'private') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
        <Lock className="w-3 h-3" />
        Private
      </span>
    );
  }
  if (template.visibility === 'pending_review') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
        <Clock className="w-3 h-3" />
        Pending review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200">
      <Globe className="w-3 h-3" />
      Public
    </span>
  );
}

function TemplateRow({
  template,
  highlight,
  onEdit,
  onDelete,
  onSubmit,
}: {
  template: SummaryTemplate;
  highlight: boolean;
  onEdit: (t: SummaryTemplate) => void;
  onDelete: (t: SummaryTemplate) => void;
  onSubmit: (t: SummaryTemplate) => void;
}) {
  const canEdit = template.visibility === 'private' || template.visibility === 'pending_review';
  const canSubmit = template.visibility === 'private';

  return (
    <div
      className={`p-5 rounded-lg border transition-colors ${
        highlight
          ? 'border-amber-400 dark:border-amber-500 bg-amber-50/60 dark:bg-amber-900/10'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {template.category && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {template.category}
              </span>
            )}
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {template.name}
            </h3>
            <VisibilityBadge template={template} />
            {template.target_type && template.target_type !== 'both' && (
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  template.target_type === 'whisper'
                    ? 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300'
                    : 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300'
                }`}
              >
                {template.target_type === 'whisper' ? 'Whisper' : 'Record'}
              </span>
            )}
          </div>
          {template.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{template.description}</p>
          )}
          {template.review_feedback && template.visibility === 'private' && (
            <div className="mt-3 p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">
              <p className="font-medium mb-1">Reviewer feedback</p>
              <p className="whitespace-pre-wrap">{template.review_feedback}</p>
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-3 bg-gray-50 dark:bg-gray-900/40 p-2 rounded font-mono line-clamp-3">
            {template.prompt_template}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {canEdit && (
          <button
            onClick={() => onEdit(template)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        )}
        {canSubmit && (
          <button
            onClick={() => onSubmit(template)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded hover:bg-amber-200 dark:hover:bg-amber-800/70 transition-colors"
          >
            <Send className="w-4 h-4" />
            Submit for review
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onDelete(template)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
        {template.visibility === 'public' && (
          <span className="text-xs text-gray-500 dark:text-gray-500 italic self-center">
            Approved and public — managed by admins.
          </span>
        )}
      </div>
    </div>
  );
}
