import { useRef, useCallback } from 'react';
import { formatMarkdown } from '@/utils/formatMarkdown';

interface InteractiveMarkdownProps {
  content: string;
  /** Called with the updated raw markdown when a checkbox is toggled. */
  onContentChange?: (newContent: string) => void;
  className?: string;
}

/**
 * Renders markdown as HTML with interactive checkboxes.
 * Clicking a checkbox toggles `- [ ]` ↔ `- [x]` in the raw markdown
 * and fires `onContentChange` so the parent can persist the update.
 */
export function InteractiveMarkdown({ content, onContentChange, className }: InteractiveMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('checkbox-toggle') || !onContentChange) return;

      // Find which checkbox index was clicked
      const container = containerRef.current;
      if (!container) return;
      const allCheckboxes = container.querySelectorAll('.checkbox-toggle');
      let clickedIdx = -1;
      allCheckboxes.forEach((cb, i) => {
        if (cb === target) clickedIdx = i;
      });
      if (clickedIdx === -1) return;

      // Toggle the Nth checkbox in the raw markdown
      let seen = 0;
      const updated = content.replace(
        /^([\s]*[-*]\s+)\[([ x])\]/gim,
        (match, prefix, state) => {
          if (seen++ === clickedIdx) {
            const newState = state.trim().toLowerCase() === 'x' ? ' ' : 'x';
            return `${prefix}[${newState}]`;
          }
          return match;
        },
      );

      if (updated !== content) {
        onContentChange(updated);
      }
    },
    [content, onContentChange],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: formatMarkdown(content) }}
    />
  );
}
