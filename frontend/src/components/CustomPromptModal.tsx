import { ReactNode, useEffect, useMemo, useState } from 'react';
import { X, Loader, Sparkles, Save, RotateCcw, AlertCircle, CheckCircle } from 'lucide-react';
import { templatesApi } from '@/api/templates';
import { TemplateSelector } from '@/components/TemplateSelector';
import { SummaryTemplate, TemplateTargetType, User } from '@/types';

interface CustomPromptModalProps {
  templates: SummaryTemplate[];
  /** Template to pre-load when the modal opens (usually the one selected in the panel). */
  initialTemplateId?: string;
  /** Default target type for a template saved from here. */
  recordingType: 'record' | 'whisper';
  currentUser: User | null;
  isGenerating: boolean;
  /** Queues the summary. Must throw on failure so the modal can show the error. */
  onGenerate: (prompt: string) => Promise<void>;
  /** Called after a create/update so the parent can refresh and select it. */
  onTemplateSaved: (template: SummaryTemplate) => void;
  onClose: () => void;
  /** Rendered in the footer next to Generate (e.g. the thinking level selector). */
  extraControls?: ReactNode;
}

/** Mirror of the backend `_can_edit` rule in routers/templates.py. */
function canEditTemplate(user: User | null, t: SummaryTemplate | undefined): boolean {
  if (!user || !t) return false;
  if (user.role === 'admin' || user.role === 'template_manager') return true;
  if (t.is_default) return false;
  if (t.created_by !== user.id) return false;
  return t.visibility === 'private' || t.visibility === 'pending_review';
}

const TARGET_OPTIONS: { value: TemplateTargetType; label: string }[] = [
  { value: 'record', label: 'Meetings (Rec)' },
  { value: 'whisper', label: 'Memos (Whisper)' },
  { value: 'both', label: 'Both' },
];

export function CustomPromptModal({
  templates,
  initialTemplateId,
  recordingType,
  currentUser,
  isGenerating,
  onGenerate,
  onTemplateSaved,
  onClose,
  extraControls,
}: CustomPromptModalProps) {
  const initial = templates.find((t) => t.id === initialTemplateId);
  const [baseId, setBaseId] = useState<string>(initial?.id ?? '');
  const [prompt, setPrompt] = useState<string>(initial?.prompt_template ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // "Save as new template" form
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveCategory, setSaveCategory] = useState('');
  const [saveTarget, setSaveTarget] = useState<TemplateTargetType>(recordingType);
  const [isSaving, setIsSaving] = useState(false);

  const base = templates.find((t) => t.id === baseId);
  const isDirty = base ? prompt !== base.prompt_template : prompt.trim() !== '';
  const canUpdateBase = canEditTemplate(currentUser, base);
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'template_manager';

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category).filter((c): c is string => !!c))).sort(),
    [templates],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isGenerating, isSaving]);

  const loadTemplate = (id: string) => {
    if (id === baseId) return;
    const next = templates.find((t) => t.id === id);
    if (isDirty && !window.confirm('Replace the current prompt? Your edits will be lost.')) return;
    setBaseId(id);
    setPrompt(next?.prompt_template ?? '');
    setError(null);
    setNotice(null);
  };

  const openSaveForm = () => {
    setSaveName(base ? `${base.name} (custom)` : '');
    setSaveDescription(base?.description ?? '');
    setSaveCategory(base?.category ?? '');
    setSaveTarget(base?.target_type ?? recordingType);
    setShowSaveForm(true);
    setError(null);
    setNotice(null);
  };

  const handleSaveNew = async () => {
    if (!saveName.trim() || !prompt.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await templatesApi.createTemplate({
        name: saveName.trim(),
        description: saveDescription.trim(),
        prompt_template: prompt,
        category: saveCategory.trim() || undefined,
        target_type: saveTarget,
      });
      onTemplateSaved(created);
      setBaseId(created.id);
      setShowSaveForm(false);
      setNotice(
        isPrivileged
          ? `Template "${created.name}" saved.`
          : `Template "${created.name}" saved in My Templates (private).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateBase = async () => {
    if (!base || !prompt.trim()) return;
    if (!window.confirm(`Overwrite the prompt of "${base.name}"?`)) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await templatesApi.updateTemplate(base.id, { prompt_template: prompt });
      onTemplateSaved(updated);
      setNotice(`Template "${updated.name}" updated.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError(null);
    try {
      await onGenerate(prompt);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate summary');
    }
  };

  const busy = isGenerating || isSaving;
  const inputCls =
    'w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Custom prompt</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Start from a template or from scratch, tweak it, generate, and save it if you like the result.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Load from template
            </label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <TemplateSelector
                  templates={templates}
                  value={baseId}
                  onChange={(id) => (id ? loadTemplate(id) : setBaseId(''))}
                  placeholder="Start from scratch, or pick a template to load..."
                  disabled={busy}
                />
              </div>
              {base && isDirty && (
                <button
                  onClick={() => setPrompt(base.prompt_template)}
                  disabled={busy}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50"
                  title={`Revert to the original prompt of "${base.name}"`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Revert
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Prompt{base && isDirty && <span className="ml-2 text-amber-600 dark:text-amber-400">modified</span>}
              </label>
              <span className="text-xs text-gray-400">
                Placeholders: <code className="font-mono">{'{{transcript}}'}</code>,{' '}
                <code className="font-mono">{'{{meeting_date}}'}</code>
              </span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={14}
              autoFocus
              placeholder="Enter a prompt for summarization... The transcript is added automatically if {{transcript}} is absent."
              className={`${inputCls} font-mono resize-y min-h-[12rem]`}
            />
          </div>

          {showSaveForm && (
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 space-y-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Save as new template</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name *</label>
                  <input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Security audit debrief"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Description</label>
                  <input
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Category</label>
                  <input
                    value={saveCategory}
                    onChange={(e) => setSaveCategory(e.target.value)}
                    list="custom-prompt-categories"
                    className={inputCls}
                    placeholder="Personal"
                  />
                  <datalist id="custom-prompt-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Use for</label>
                  <select
                    value={saveTarget}
                    onChange={(e) => setSaveTarget(e.target.value as TemplateTargetType)}
                    className={inputCls}
                  >
                    {TARGET_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {!isPrivileged && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Saved as a private template, visible only to you. You can submit it for review from My Templates.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveForm(false)}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-lg disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNew}
                  disabled={isSaving || !saveName.trim() || !prompt.trim()}
                  className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save template
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="break-words min-w-0">{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {!showSaveForm && (
            <button
              onClick={openSaveForm}
              disabled={busy || !prompt.trim()}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save as template...
            </button>
          )}
          {canUpdateBase && isDirty && !showSaveForm && (
            <button
              onClick={handleUpdateBase}
              disabled={busy || !prompt.trim()}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
              title={`Overwrite the prompt of "${base?.name}"`}
            >
              <Save className="w-4 h-4" />
              Update "{base?.name}"
            </button>
          )}
          <div className="flex-1" />
          {extraControls}
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={busy || !prompt.trim()}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
