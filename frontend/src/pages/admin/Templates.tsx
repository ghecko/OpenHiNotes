import { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { templatesApi } from '@/api/templates';
import { SummaryTemplate } from '@/types';
import { Trash2, Edit, Plus, Save, X, Search, ToggleLeft, ToggleRight } from 'lucide-react';

/** Canonical category order */
const CATEGORY_ORDER = [
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

function groupByCategory(
  templates: SummaryTemplate[]
): { category: string; items: SummaryTemplate[] }[] {
  const map = new Map<string, SummaryTemplate[]>();
  for (const t of templates) {
    const cat = t.category || 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(t);
  }
  const ordered: { category: string; items: SummaryTemplate[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) ordered.push({ category: cat, items: map.get(cat)! });
  }
  for (const [cat, items] of map.entries()) {
    if (!CATEGORY_ORDER.includes(cat)) ordered.push({ category: cat, items });
  }
  return ordered;
}

export function Templates({ embedded }: { embedded?: boolean }) {
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt_template: '',
    category: '',
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const t = await templatesApi.getTemplates(true); // include inactive for admin
      setTemplates(t);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const updated = await templatesApi.toggleTemplate(id);
      setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (error) {
      console.error('Failed to toggle template:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Permanently delete this template? This cannot be undone.')) {
      try {
        await templatesApi.deleteTemplate(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      } catch (error) {
        console.error('Failed to delete template:', error);
      }
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        const updated = await templatesApi.updateTemplate(editingId, formData);
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const created = await templatesApi.createTemplate(formData);
        setTemplates((prev) => [...prev, created]);
      }
      setFormData({ name: '', description: '', prompt_template: '', category: '' });
      setEditingId(null);
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const startEdit = (template: SummaryTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      prompt_template: template.prompt_template,
      category: template.category || '',
    });
    setEditingId(template.id);
    setIsCreating(false);
  };

  const startCreate = () => {
    setFormData({ name: '', description: '', prompt_template: '', category: '' });
    setEditingId(null);
    setIsCreating(true);
  };

  const cancel = () => {
    setFormData({ name: '', description: '', prompt_template: '', category: '' });
    setEditingId(null);
    setIsCreating(false);
  };

  // Filtered list based on search + active filter
  const query = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    let result = templates;
    if (!showInactive) {
      result = result.filter((t) => t.is_active);
    }
    if (query) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.category || '').toLowerCase().includes(query) ||
          (t.description || '').toLowerCase().includes(query)
      );
    }
    return result;
  }, [templates, query, showInactive]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const isSearching = query.length > 0;

  const content = (
    <div className="space-y-6">
      {/* Top bar: Create button + Show inactive toggle + Search */}
      <div className="flex items-center gap-3">
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        )}
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors shrink-0 ${
            showInactive
              ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
          }`}
          title={showInactive ? 'Showing all templates' : 'Showing active only'}
        >
          {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          Inactive
        </button>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, or description..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Create form (only for new templates — edit is inline) */}
      {isCreating && (
        <TemplateForm
          formData={formData}
          setFormData={setFormData}
          onSave={handleSave}
          onCancel={cancel}
          title="Create Template"
        />
      )}

      {/* Template list */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            Loading templates...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            {isSearching ? `No templates match "${search}"` : 'No templates yet'}
          </div>
        ) : isSearching ? (
          /* Flat list when searching */
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filtered.map((template) => (
              editingId === template.id ? (
                <TemplateForm
                  key={template.id}
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSave}
                  onCancel={cancel}
                  title="Edit Template"
                  inline
                />
              ) : (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                  showCategory
                />
              )
            ))}
          </div>
        ) : (
          /* Grouped by category */
          grouped.map(({ category, items }) => (
            <div key={category}>
              <div className="px-6 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {category}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {items.length} template{items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((template) => (
                  editingId === template.id ? (
                    <TemplateForm
                      key={template.id}
                      formData={formData}
                      setFormData={setFormData}
                      onSave={handleSave}
                      onCancel={cancel}
                      title="Edit Template"
                      inline
                    />
                  ) : (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onEdit={startEdit}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  )
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      {!isLoading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {isSearching
            ? `${filtered.length} of ${templates.length} templates`
            : `${templates.length} template${templates.length !== 1 ? 's' : ''} across ${grouped.length} categories`}
        </p>
      )}
    </div>
  );

  if (embedded) return content;
  return <Layout title="Summary Templates">{content}</Layout>;
}

function TemplateForm({
  formData,
  setFormData,
  onSave,
  onCancel,
  title,
  inline = false,
}: {
  formData: { name: string; description: string; prompt_template: string; category: string };
  setFormData: (data: { name: string; description: string; prompt_template: string; category: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
  inline?: boolean;
}) {
  return (
    <div className={inline
      ? 'p-6 bg-blue-50/50 dark:bg-blue-900/10 border-l-4 border-blue-500'
      : 'bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700'
    }>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Template name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="e.g. General, HR, Security..."
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {CATEGORY_ORDER.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="Brief description of what this template does"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt Template</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            {"Use {{transcript}} for transcription text, {{meeting_date}} for date extracted from device filename"}
          </p>
          <textarea
            value={formData.prompt_template}
            onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
            rows={6}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y text-sm font-mono"
            placeholder="Enter prompt template..."
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white rounded-lg font-medium transition-colors text-sm"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onToggle,
  showCategory = false,
}: {
  template: SummaryTemplate;
  onEdit: (t: SummaryTemplate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  showCategory?: boolean;
}) {
  return (
    <div className={`p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
      !template.is_active ? 'opacity-60' : ''
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showCategory && template.category && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {template.category}
              </span>
            )}
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {template.name}
            </h3>
          </div>
          {template.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {template.description}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-3 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono line-clamp-2">
            {template.prompt_template}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {template.is_default && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
              Built-in
            </span>
          )}
          <button
            onClick={() => onToggle(template.id)}
            className={`px-2 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${
              template.is_active
                ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title={template.is_active ? 'Click to deactivate' : 'Click to activate'}
          >
            {template.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => onEdit(template)}
          className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit
        </button>
        {!template.is_default && (
          <button
            onClick={() => onDelete(template.id)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
