/** Lightweight markdown-to-HTML converter for rendering assistant/summary content. */
export function formatMarkdown(text: string): string {
  // First, extract code blocks to protect them from other transformations.
  // Use a placeholder that won't be matched by bold/italic regexes.
  const codeBlocks: string[] = [];
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const langBadge = lang
      ? `<span class="absolute top-2 right-3 text-[10px] text-gray-500 dark:text-gray-400 font-mono select-none">${lang}</span>`
      : '';
    codeBlocks.push(
      `<div class="relative my-2">${langBadge}<pre class="bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-lg p-3 overflow-x-auto text-xs font-mono whitespace-pre${lang ? ' pt-6' : ''}"><code>${code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trimEnd()}</code></pre></div>`
    );
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // Extract inline code before HTML escaping to protect backtick content
  const inlineCodes: string[] = [];
  processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(
      `<code class="bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">${code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</code>`
    );
    return `\x00INLINECODE${idx}\x00`;
  });

  // Escape HTML in the rest
  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  processed = processed
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
    // Checkboxes: - [ ] and - [x]  (interactive when wrapped in a handler)
    .replace(/^[\s]*[-*]\s+\[x\]\s+(.+)$/gim, '<label class="flex items-start gap-2 ml-4 cursor-pointer checkbox-item"><input type="checkbox" checked class="mt-1 rounded border-gray-300 text-primary-600 checkbox-toggle" /><span class="line-through text-gray-500 dark:text-gray-400">$1</span></label>')
    .replace(/^[\s]*[-*]\s+\[\s?\]\s+(.+)$/gm, '<label class="flex items-start gap-2 ml-4 cursor-pointer checkbox-item"><input type="checkbox" class="mt-1 rounded border-gray-300 checkbox-toggle" /><span>$1</span></label>')
    // Unordered list items: lines starting with "- " or "* "
    .replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="ml-4">$1</li>')
    // Ordered list items: lines starting with "1. ", "2. ", etc.
    .replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-disc pl-4 my-1 space-y-0.5">$1</ul>')
    // Wrap consecutive <label> (checkboxes) in a container div
    .replace(/((?:<label[^>]*>.*<\/label>\n?)+)/g, '<div class="space-y-1 my-1">$1</div>')
    // Line breaks for remaining newlines (but not inside tags)
    .replace(/\n/g, '<br/>');

  // Restore inline code
  inlineCodes.forEach((code, idx) => {
    processed = processed.replace(`\x00INLINECODE${idx}\x00`, code);
  });

  // Restore code blocks (and remove surrounding <br/> artifacts)
  codeBlocks.forEach((block, idx) => {
    processed = processed.replace(
      new RegExp(`(?:<br/>)*\x00CODEBLOCK${idx}\x00(?:<br/>)*`),
      block
    );
  });

  return processed;
}
