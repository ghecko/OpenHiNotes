import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { SummaryTemplate } from '@/types';

interface TemplateSelectorProps {
  templates: SummaryTemplate[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Canonical category order for grouped display */
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

  // Sort categories by canonical order, then alphabetically for unknowns
  const ordered: { category: string; items: SummaryTemplate[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) {
      ordered.push({ category: cat, items: map.get(cat)! });
    }
  }
  // Append any categories not in CATEGORY_ORDER
  for (const [cat, items] of map.entries()) {
    if (!CATEGORY_ORDER.includes(cat)) {
      ordered.push({ category: cat, items });
    }
  }
  return ordered;
}

export function TemplateSelector({
  templates,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a template...',
}: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === value) || null;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    // Determine if dropdown should open upward
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 320); // 320px = max dropdown height + padding
    }
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  // Filtered flat list when searching
  const query = search.toLowerCase().trim();
  const filteredFlat = query
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.category || '').toLowerCase().includes(query) ||
          (t.description || '').toLowerCase().includes(query)
      )
    : [];

  const grouped = groupByCategory(templates);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-left text-sm ${
          open ? 'ring-2 ring-blue-500 border-blue-500' : ''
        }`}
      >
        <span className={`flex-1 truncate ${!selected ? 'text-gray-400 dark:text-gray-500' : ''}`}>
          {selected ? (
            <span className="flex items-center gap-2">
              {selected.category && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 shrink-0">
                  {selected.category}
                </span>
              )}
              {selected.name}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute z-50 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden ${
          openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
        }`}>
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-md">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Template list */}
          <div className="max-h-72 overflow-y-auto">
            {query ? (
              /* Flat filtered results */
              filteredFlat.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  No templates match "{search}"
                </div>
              ) : (
                filteredFlat.map((t) => (
                  <TemplateOption key={t.id} template={t} selected={t.id === value} onSelect={handleSelect} showCategory />
                ))
              )
            ) : (
              /* Grouped by category */
              grouped.map(({ category, items }) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                    {category}
                  </div>
                  {items.map((t) => (
                    <TemplateOption key={t.id} template={t} selected={t.id === value} onSelect={handleSelect} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateOption({
  template,
  selected,
  onSelect,
  showCategory = false,
}: {
  template: SummaryTemplate;
  selected: boolean;
  onSelect: (id: string) => void;
  showCategory?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template.id)}
      className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
        selected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {showCategory && template.category && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 shrink-0">
                {template.category}
              </span>
            )}
            <span className={`text-sm font-medium truncate ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
              {template.name}
            </span>
          </div>
          {template.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {template.description}
            </p>
          )}
        </div>
        {selected && (
          <span className="text-blue-600 dark:text-blue-400 text-xs shrink-0 mt-0.5">✓</span>
        )}
      </div>
    </button>
  );
}
