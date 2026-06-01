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
    // Checkboxes and lists are parsed line by line using a stack-based approach
    // to support nested lists and mixed list types properly.

  const lines = processed.split('\n');
  const resultLines: string[] = [];
  const stack: { type: 'ul' | 'ol' | 'checkbox'; indent: number }[] = [];

  function closeListsToLevel(targetIndent: number) {
    while (stack.length > 0 && stack[stack.length - 1].indent > targetIndent) {
      const popped = stack.pop();
      if (popped) {
        if (popped.type === 'ul') resultLines.push('</ul>');
        else if (popped.type === 'ol') resultLines.push('</ol>');
        else if (popped.type === 'checkbox') resultLines.push('</div>');
      }
    }
  }

  function closeAllLists() {
    while (stack.length > 0) {
      const popped = stack.pop();
      if (popped) {
        if (popped.type === 'ul') resultLines.push('</ul>');
        else if (popped.type === 'ol') resultLines.push('</ol>');
        else if (popped.type === 'checkbox') resultLines.push('</div>');
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const checkboxCheckedMatch = line.match(/^(\s*)[-*]\s+\[x\]\s*(.*)$/i);
    const checkboxUncheckedMatch = line.match(/^(\s*)[-*]\s+\[\s?\]\s*(.*)$/i);
    const ulMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);

    if (checkboxCheckedMatch) {
      const indent = checkboxCheckedMatch[1].length;
      const content = checkboxCheckedMatch[2] || '';
      closeListsToLevel(indent);

      let top = stack[stack.length - 1];
      if (!top || indent > top.indent) {
        stack.push({ type: 'checkbox', indent });
        const plClass = indent > 0 ? ' pl-4' : '';
        resultLines.push(`<div class="space-y-1 my-1${plClass}">`);
      } else if (top.indent === indent && top.type !== 'checkbox') {
        stack.pop();
        if (top.type === 'ul') resultLines.push('</ul>');
        else if (top.type === 'ol') resultLines.push('</ol>');

        stack.push({ type: 'checkbox', indent });
        const plClass = indent > 0 ? ' pl-4' : '';
        resultLines.push(`<div class="space-y-1 my-1${plClass}">`);
      }

      resultLines.push(`<label class="flex items-start gap-2 ml-4 cursor-pointer checkbox-item"><input type="checkbox" checked class="mt-1 rounded border-gray-300 text-primary-600 checkbox-toggle" /><span class="line-through text-gray-500 dark:text-gray-400">${content}</span></label>`);
    } else if (checkboxUncheckedMatch) {
      const indent = checkboxUncheckedMatch[1].length;
      const content = checkboxUncheckedMatch[2] || '';
      closeListsToLevel(indent);

      let top = stack[stack.length - 1];
      if (!top || indent > top.indent) {
        stack.push({ type: 'checkbox', indent });
        const plClass = indent > 0 ? ' pl-4' : '';
        resultLines.push(`<div class="space-y-1 my-1${plClass}">`);
      } else if (top.indent === indent && top.type !== 'checkbox') {
        stack.pop();
        if (top.type === 'ul') resultLines.push('</ul>');
        else if (top.type === 'ol') resultLines.push('</ol>');

        stack.push({ type: 'checkbox', indent });
        const plClass = indent > 0 ? ' pl-4' : '';
        resultLines.push(`<div class="space-y-1 my-1${plClass}">`);
      }

      resultLines.push(`<label class="flex items-start gap-2 ml-4 cursor-pointer checkbox-item"><input type="checkbox" class="mt-1 rounded border-gray-300 checkbox-toggle" /><span>${content}</span></label>`);
    } else if (ulMatch) {
      const indent = ulMatch[1].length;
      const content = ulMatch[2];
      closeListsToLevel(indent);

      let top = stack[stack.length - 1];
      if (!top || indent > top.indent) {
        stack.push({ type: 'ul', indent });
        resultLines.push('<ul class="list-disc pl-4 my-1 space-y-0.5">');
      } else if (top.indent === indent && top.type !== 'ul') {
        stack.pop();
        if (top.type === 'ol') resultLines.push('</ol>');
        else if (top.type === 'checkbox') resultLines.push('</div>');

        stack.push({ type: 'ul', indent });
        resultLines.push('<ul class="list-disc pl-4 my-1 space-y-0.5">');
      }

      resultLines.push(`<li class="ml-4">${content}</li>`);
    } else if (olMatch) {
      const indent = olMatch[1].length;
      const content = olMatch[3];
      closeListsToLevel(indent);

      let top = stack[stack.length - 1];
      if (!top || indent > top.indent) {
        stack.push({ type: 'ol', indent });
        resultLines.push('<ol class="list-decimal pl-4 my-1 space-y-0.5">');
      } else if (top.indent === indent && top.type !== 'ol') {
        stack.pop();
        if (top.type === 'ul') resultLines.push('</ul>');
        else if (top.type === 'checkbox') resultLines.push('</div>');

        stack.push({ type: 'ol', indent });
        resultLines.push('<ol class="list-decimal pl-4 my-1 space-y-0.5">');
      }

      resultLines.push(`<li class="ml-4">${content}</li>`);
    } else if (line.trim() === '') {
      // Don't close lists for blank lines, just preserve them
      resultLines.push(line);
    } else {
      closeAllLists();
      resultLines.push(line);
    }
  }
  closeAllLists();
  processed = resultLines.join('\n')
    // Line breaks for remaining newlines (but not inside tags)
    .replace(/\n/g, '<br/>');

  // Clean up `<br/>` tags adjacent to block/list HTML tags
  processed = processed
    .replace(/(?:<br\/>\s*)+(<\/?(?:ul|ol|li|div|label|h2|h3|h4|hr)[^>]*>)/g, '$1')
    .replace(/(<\/?(?:ul|ol|li|div|label|h2|h3|h4|hr)[^>]*>)(?:\s*<br\/>)+/g, '$1');

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
