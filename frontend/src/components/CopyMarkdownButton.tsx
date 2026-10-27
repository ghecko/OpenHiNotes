import { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

/** Copy text to the clipboard. Falls back to execCommand outside secure contexts (plain-HTTP deployments). */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
  } finally {
    document.body.removeChild(textarea);
  }
}

interface CopyMarkdownButtonProps {
  /** The raw markdown, copied as-is (not the rendered HTML). */
  content: string;
  className?: string;
  label?: string;
}

/** Copies the raw markdown source of a message or summary. */
export function CopyMarkdownButton({ content, className, label }: CopyMarkdownButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(t);
  }, [state]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await copyText(content);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const title = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy as Markdown';
  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={
        className ??
        'inline-flex items-center gap-1 p-1 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors'
      }
    >
      {state === 'copied' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {label && <span>{state === 'copied' ? 'Copied' : label}</span>}
    </button>
  );
}
