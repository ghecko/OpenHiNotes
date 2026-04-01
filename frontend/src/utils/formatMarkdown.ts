/** Lightweight markdown-to-HTML converter for rendering assistant/summary content. */
export function formatMarkdown(text: string): string {
  // First, extract code blocks to protect them from other transformations
  const codeBlocks: string[] = [];
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono whitespace-pre">${code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trimEnd()}</pre>`
    );
    return `__CODE_BLOCK_${idx}__`;
  });

  // Escape HTML in the rest
  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  processed = processed
    // Inline code: `code`
    .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    // Headers: ### h3, ## h2, # h1
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold text-sm mt-3 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-base mt-3 mb-1">$1</h2>')
    // Horizontal rule: --- or ***
    .replace(/^[-*]{3,}$/gm, '<hr class="border-gray-300 dark:border-gray-600 my-2"/>')
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<em>$1</em>')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
    // Unordered list items: lines starting with "- " or "* "
    .replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="ml-4">$1</li>')
    // Ordered list items: lines starting with "1. ", "2. ", etc.
    .replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<li class="ml-4">$2</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-disc pl-4 my-1 space-y-0.5">$1</ul>')
    // Line breaks for remaining newlines (but not inside tags)
    .replace(/\n/g, '<br/>');

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    processed = processed.replace(`__CODE_BLOCK_${idx}__`, block);
  });

  return processed;
}
