import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { templatesApi } from '@/api/templates';
import { SummaryTemplate } from '@/types';
import { Trash2, Edit, Plus, Save, X } from 'lucide-react';

export function Templates({ embedded }: { embedded?: boolean }) {
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt_template: '',
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const t = await templatesApi.getTemplates();
      setTemplates(t);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this template?')) {
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
        setTemplates((prev) =>
          prev.map((t) => (t.id === editingId ? updated : t))
        );
      } else {
        const created = await templatesApi.createTemplate(formData);
        setTemplates((prev) => [...prev, created]);
      }

      setFormData({ name: '', description: '', prompt_template: '' });
      setEditingId(null);
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const startEdit = (template: SummaryTemplate) => {
    setFormData({
      name: template.name,
      description: template.description,
      prompt_template: template.prompt_template,
    });
    setEditingId(template.id);
    setIsCreating(false);
  };

  const startCreate = () => {
    setFormData({ name: '', description: '', prompt_template: '' });
    setEditingId(null);
    setIsCreating(true);
  };

  const cancel = () => {
    setFormData({ name: '', description: '', prompt_template: '' });
    setEditingId(null);
    setIsCreating(false);
  };

  const content = (
      <div className="space-y-6">
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        )}

        {(isCreating || editingId) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Edit Template' : 'Create Template'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Template name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Template description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Prompt Template
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {"Use {{transcript}} to reference the transcription text"}
                </p>
                <textarea
                  value={formData.prompt_template}
                  onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
                  rows={8}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Enter prompt template..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={cancel}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              No templates yet
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {templates.map((template) => (
                <div key={template.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {template.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono line-clamp-2">
                        {template.prompt_template}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          template.is_active
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {template.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => startEdit(template)}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  );

  if (embedded) return content;
  return <Layout title="Summary Templates">{content}</Layout>;
}