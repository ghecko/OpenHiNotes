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
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 hover:underline">$1</a>');

  // Checkboxes, lists, tables, and blockquotes are parsed line by line
  // to properly support nesting and rich HTML element structures.

  const lines = processed.split('\n');
  const resultLines: string[] = [];
  const stack: { type: 'ul' | 'ol' | 'checkbox'; indent: number }[] = [];
  let inBlockquote = false;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let tableAlignments: ('left' | 'center' | 'right' | null)[] = [];

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

  function parseRowCells(rowText: string): string[] {
    const trimmed = rowText.trim();
    let clean = trimmed;
    if (clean.startsWith('|')) clean = clean.substring(1);
    if (clean.endsWith('|')) clean = clean.substring(0, clean.length - 1);
    return clean.split('|').map(cell => cell.trim());
  }

  function generateTableHtml(headers: string[], rows: string[][], alignments: ('left' | 'center' | 'right' | null)[]): string {
    let html = '<div class="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-700">';
    html += '<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs md:text-sm text-gray-700 dark:text-gray-300">';
    
    // Headers
    html += '<thead class="bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold">';
    html += '<tr>';
    headers.forEach((header, idx) => {
      const align = alignments[idx];
      const alignClass = align === 'center' ? ' text-center' : align === 'right' ? ' text-right' : ' text-left';
      html += `<th class="px-3 py-2 border-b border-gray-200 dark:border-gray-700${alignClass}">${header}</th>`;
    });
    html += '</tr>';
    html += '</thead>';
    
    // Body
    html += '<tbody class="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900/50">';
    rows.forEach(row => {
      html += '<tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">';
      headers.forEach((_, idx) => {
        const cell = row[idx] || '';
        const align = alignments[idx];
        const alignClass = align === 'center' ? ' text-center' : align === 'right' ? ' text-right' : ' text-left';
        html += `<td class="px-3 py-2${alignClass}">${cell}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    
    html += '</table>';
    html += '</div>';
    return html;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Detect Blockquotes
    const blockquoteMatch = line.match(/^(\s*)>\s*(.*)$/);
    let isBlockquoteLine = false;
    let lineContent = line;
    if (blockquoteMatch) {
      isBlockquoteLine = true;
      lineContent = blockquoteMatch[2];
    }

    if (isBlockquoteLine && !inBlockquote) {
      closeAllLists();
      inBlockquote = true;
      resultLines.push('<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-2 italic text-gray-600 dark:text-gray-400">');
    } else if (!isBlockquoteLine && inBlockquote) {
      closeAllLists();
      if (inTable) {
        resultLines.push(generateTableHtml(tableHeaders, tableRows, tableAlignments));
        inTable = false;
      }
      resultLines.push('</blockquote>');
      inBlockquote = false;
    }

    // 2. Detect Tables
    if (inTable) {
      if (lineContent.includes('|')) {
        const cells = parseRowCells(lineContent);
        tableRows.push(cells);
        continue;
      } else {
        resultLines.push(generateTableHtml(tableHeaders, tableRows, tableAlignments));
        inTable = false;
        // Fall through to parse this lineContent normally
      }
    }

    if (!inTable && lineContent.includes('|')) {
      let nextLineRaw = lines[i + 1];
      let nextLineContent = nextLineRaw;
      if (nextLineRaw) {
        const nextBqMatch = nextLineRaw.match(/^(\s*)>\s*(.*)$/);
        if (inBlockquote && nextBqMatch) {
          nextLineContent = nextBqMatch[2];
        } else if (!inBlockquote && !nextBqMatch) {
          nextLineContent = nextLineRaw;
        } else {
          nextLineContent = '';
        }
      }

      const isNextSeparator = nextLineContent && nextLineContent.trim().match(/^\|?\s*(:?-+:?\s*\|?\s*)+$/);
      if (isNextSeparator) {
        closeAllLists();
        tableHeaders = parseRowCells(lineContent);
        const sepCells = parseRowCells(nextLineContent);
        tableAlignments = sepCells.map(cell => {
          const trimmed = cell.trim();
          if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
          if (trimmed.endsWith(':')) return 'right';
          if (trimmed.startsWith(':')) return 'left';
          return null;
        });
        inTable = true;
        tableRows = [];
        i++; // skip separator
        continue;
      }
    }

    // 3. Detect Checkboxes and Lists
    const checkboxCheckedMatch = lineContent.match(/^(\s*)[-*]\s+\[x\]\s*(.*)$/i);
    const checkboxUncheckedMatch = lineContent.match(/^(\s*)[-*]\s+\[\s?\]\s*(.*)$/i);
    const ulMatch = lineContent.match(/^(\s*)[-*]\s+(.*)$/);
    const olMatch = lineContent.match(/^(\s*)(\d+)\.\s+(.*)$/);

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
    } else if (lineContent.trim() === '') {
      resultLines.push(lineContent);
    } else {
      closeAllLists();
      resultLines.push(lineContent);
    }
  }

  closeAllLists();
  if (inTable) {
    resultLines.push(generateTableHtml(tableHeaders, tableRows, tableAlignments));
  }
  if (inBlockquote) {
    resultLines.push('</blockquote>');
  }

  processed = resultLines.join('\n')
    // Line breaks for remaining newlines (but not inside tags)
    .replace(/\n/g, '<br/>');

  // Clean up `<br/>` tags adjacent to block/list HTML tags
  processed = processed
    .replace(/(?:<br\/>\s*)+(<\/?(?:ul|ol|li|div|label|blockquote|thead|tbody|tr|th|td|h2|h3|h4|hr)[^>]*>)/g, '$1')
    .replace(/(<\/?(?:ul|ol|li|div|label|blockquote|thead|tbody|tr|th|td|h2|h3|h4|hr)[^>]*>)(?:\s*<br\/>)+/g, '$1');

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
