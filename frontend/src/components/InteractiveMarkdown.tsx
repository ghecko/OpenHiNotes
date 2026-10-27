import { useRef, useCallback, useMemo } from 'react';
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

      // Toggle the Nth task item of the raw markdown (any bullet or ordered
      // marker, possibly quoted), skipping fenced code like the renderer does.
      let seen = 0;
      let fence: string | null = null;
      const updated = content
        .split('\n')
        .map((line) => {
          const fenceMatch = line.match(/^\s*(```|~~~)/);
          if (fenceMatch) {
            if (fence === null) fence = fenceMatch[1];
            else if (fence === fenceMatch[1]) fence = null;
            return line;
          }
          if (fence !== null) return line;
          return line.replace(
            /^([\s>]*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/,
            (match, prefix, state) => {
              if (seen++ !== clickedIdx) return match;
              return `${prefix}[${state.toLowerCase() === 'x' ? ' ' : 'x'}]`;
            },
          );
        })
        .join('\n');

      if (updated !== content) {
        onContentChange(updated);
      }
    },
    [content, onContentChange],
  );

  const html = useMemo(() => formatMarkdown(content), [content]);

  return (
    <div
      ref={containerRef}
      className={`markdown-content${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
