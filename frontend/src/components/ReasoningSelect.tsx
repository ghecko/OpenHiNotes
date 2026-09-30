import { Brain } from 'lucide-react';
import { LlmFeatures, ReasoningLevel } from '@/types';

interface ReasoningSelectProps {
  features: LlmFeatures | null;
  value: ReasoningLevel;
  onChange: (value: ReasoningLevel) => void;
  disabled?: boolean;
  className?: string;
}

/** Thinking level for one summary. Renders nothing when the LLM has no reasoning control. */
export function ReasoningSelect({ features, value, onChange, disabled, className = '' }: ReasoningSelectProps) {
  if (!features || features.reasoning_levels.length === 0) return null;
  const defaultLabel = features.reasoning_default
    ? `Default (${features.reasoning_levels.find((l) => l.value === features.reasoning_default)?.label ?? features.reasoning_default})`
    : 'Default (model)';
  return (
    <label
      className={`flex items-center gap-1.5 px-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 ${className}`}
      title="How much the model thinks before writing. More thinking is slower, not always better."
    >
      <Brain className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" />
      <span className="sr-only">Thinking</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReasoningLevel)}
        disabled={disabled}
        className="bg-transparent py-2 pr-1 focus:outline-none disabled:opacity-50 cursor-pointer"
      >
        <option value="default">{defaultLabel}</option>
        {features.reasoning_levels.map((l) => (
          <option key={l.value} value={l.value}>
            Thinking: {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
