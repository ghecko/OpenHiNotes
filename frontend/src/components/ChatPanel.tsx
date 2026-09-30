import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, AlertCircle, Save, FolderOpen, Trash2, X, Plus, MessageSquare, ChevronRight, ChevronDown,
  Download, Square, Brain, AlertTriangle, SlidersHorizontal,
} from 'lucide-react';
import { ChatContext, ChatMessage, ChatPhase, LlmFeatures, ReasoningLevel, Transcription } from '@/types';
import { chatApi } from '@/api/chat';
import { settingsApi } from '@/api/settings';
import { ReasoningSelect } from '@/components/ReasoningSelect';
import {
  chatConversationsApi,
  ChatConversationListItem,
} from '@/api/chatConversations';
import { formatMarkdown } from '@/utils/formatMarkdown';

interface ChatPanelProps {
  transcriptionId?: string;
  /** When set, the chat uses the full collection as context (multi-transcript) */
  collectionId?: string;
  /**
   * When true (default when transcriptionId is set), the conversation list
   * only shows chats linked to the current transcriptionId — no folder
   * grouping. When false, it loads ALL conversations and groups them by
   * transcript folder.
   */
  scopeToTranscription?: boolean;
  /** Map of transcription_id -> display name for folder labels (only used when scopeToTranscription=false) */
  transcriptionNames?: Record<string, string>;
  /**
   * Segments and speaker names of the transcription (single-transcript chat):
   * enables the context selector (speakers, time slice).
   */
  transcription?: Pick<Transcription, 'segments' | 'speakers'>;
  /** Completed summaries of the transcription that can be given as context. */
  summaryOptions?: { id: string; label: string }[];
}

interface DisplayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  isError?: boolean;
  /** The model's reasoning, kept apart from the answer (assistant only). */
  reasoning?: string;
  /** e.g. truncated output */
  warning?: string;
  /** Set while this reply is being generated. */
  phase?: ChatPhase;
  /** The user pressed Stop before the reply was complete. */
  stopped?: boolean;
}

/** Selection of what the model sees; `speakers` = undefined means every speaker. */
interface ContextSelection {
  transcript: boolean;
  speakers?: string[];
  start?: number;
  end?: number;
  summaryIds: string[];
}

const DEFAULT_CONTEXT: ContextSelection = { transcript: true, summaryIds: [] };

const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

/** "1:23", "12:03:04" or plain seconds -> seconds; null when not a time. */
const parseClock = (raw: string): number | null => {
  const text = raw.trim();
  if (!text) return null;
  const parts = text.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  let total = 0;
  for (const p of parts) total = total * 60 + Number(p);
  return total;
};

const PHASE_LABEL: Record<ChatPhase, string> = {
  waiting: 'Waiting for the model',
  thinking: 'Thinking',
  writing: 'Writing',
};

/** Live status of the reply being generated (phase, elapsed time). */
function PhaseIndicator({ phase, startedAt }: { phase: ChatPhase; startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className="flex items-center gap-1">
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 inline-block" style={{ animationDelay: '0ms' }} />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 inline-block" style={{ animationDelay: '150ms' }} />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 inline-block" style={{ animationDelay: '300ms' }} />
      </span>
      {phase === 'thinking' && <Brain className="w-3.5 h-3.5" />}
      <span>{PHASE_LABEL[phase]}… {elapsed} s</span>
    </div>
  );
}

/** The model's reasoning, collapsed by default (open while it is being produced). */
function ReasoningBlock({ reasoning, live }: { reasoning: string; live: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? live;
  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (live && isOpen && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [reasoning, live, isOpen]);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <Brain className="w-3.5 h-3.5" />
        Reasoning ({reasoning.length.toLocaleString()} chars)
      </button>
      {isOpen && (
        <pre
          ref={preRef}
          className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words p-2 text-xs font-mono bg-white/60 dark:bg-gray-900/60 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-600"
        >
          {reasoning}
        </pre>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-lg">
        <div className="flex items-center gap-1">
          <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 inline-block" style={{ animationDelay: '0ms' }} />
          <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 inline-block" style={{ animationDelay: '150ms' }} />
          <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 inline-block" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

/** Group conversations into folders by transcription_id */
function groupByTranscription(
  convos: ChatConversationListItem[],
  nameMap: Record<string, string>,
): { label: string; transcriptionId: string | null; items: ChatConversationListItem[] }[] {
  const groups = new Map<string | null, ChatConversationListItem[]>();

  for (const c of convos) {
    const key = c.transcription_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const result: { label: string; transcriptionId: string | null; items: ChatConversationListItem[] }[] = [];

  for (const [tid, items] of groups) {
    // Use transcription_name from the first item (populated by the backend),
    // fall back to the external nameMap, then to 'Unknown transcript'
    const firstItemName = items[0]?.transcription_name;
    const label = tid ? (firstItemName || nameMap[tid] || 'Unknown transcript') : 'General';
    result.push({ label, transcriptionId: tid, items });
  }

  result.sort((a, b) => {
    if (!a.transcriptionId) return 1;
    if (!b.transcriptionId) return -1;
    return a.label.localeCompare(b.label);
  });

  return result;
}

export function ChatPanel({
  transcriptionId,
  collectionId,
  scopeToTranscription,
  transcriptionNames = {},
  transcription,
  summaryOptions = [],
}: ChatPanelProps) {
  // Default: scope to transcript when inside a transcript view
  const isScoped = scopeToTranscription ?? !!transcriptionId;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [streamStartedAt, setStreamStartedAt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Thinking level (hidden when the LLM has no reasoning control)
  const [llmFeatures, setLlmFeatures] = useState<LlmFeatures | null>(null);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>('default');
  useEffect(() => {
    settingsApi.getLlmFeatures().then(setLlmFeatures).catch(() => setLlmFeatures(null));
  }, []);

  // Context selection (single-transcript chat)
  const canPickContext = !!transcriptionId && !collectionId && (!!transcription || summaryOptions.length > 0);
  const [showContext, setShowContext] = useState(false);
  const [context, setContext] = useState<ContextSelection>(DEFAULT_CONTEXT);
  const [rangeText, setRangeText] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const speakerLabels = useMemo(() => {
    const seen: string[] = [];
    for (const seg of transcription?.segments ?? []) {
      if (seg.speaker && !seen.includes(seg.speaker)) seen.push(seg.speaker);
    }
    return seen;
  }, [transcription?.segments]);
  const speakerName = (label: string) => transcription?.speakers?.[label] || label;
  const recordingEnd = useMemo(
    () => (transcription?.segments ?? []).reduce((m, seg) => Math.max(m, seg.end ?? 0), 0),
    [transcription?.segments],
  );
  // Drop selections that no longer exist (speaker merged, summary deleted)
  useEffect(() => {
    setContext((c) => {
      const speakers = c.speakers?.filter((l) => speakerLabels.includes(l));
      const summaryIds = c.summaryIds.filter((id) => summaryOptions.some((o) => o.id === id));
      if (speakers?.length === c.speakers?.length && summaryIds.length === c.summaryIds.length) return c;
      return { ...c, speakers: speakers && speakers.length > 0 ? speakers : undefined, summaryIds };
    });
  }, [speakerLabels, summaryOptions]);

  const toggleSpeaker = (label: string) => {
    setContext((c) => {
      const current = c.speakers ?? speakerLabels;
      const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
      const all = speakerLabels.every((l) => next.includes(l));
      return { ...c, speakers: all ? undefined : speakerLabels.filter((l) => next.includes(l)) };
    });
  };

  const applyRange = (which: 'start' | 'end', raw: string) => {
    setRangeText((r) => ({ ...r, [which]: raw }));
    const value = parseClock(raw);
    setContext((c) => ({ ...c, [which]: value === null ? undefined : value }));
  };

  const rangeInvalid = context.start !== undefined && context.end !== undefined && context.end < context.start;

  const contextSummary = useMemo(() => {
    if (!canPickContext) return '';
    const parts: string[] = [];
    if (context.transcript) {
      if (context.speakers === undefined && context.start === undefined && context.end === undefined) {
        parts.push('full transcript');
      } else {
        const bits: string[] = [];
        if (context.speakers !== undefined) {
          bits.push(context.speakers.length === 0 ? 'no speaker' : context.speakers.map(speakerName).join(', '));
        }
        if (context.start !== undefined || context.end !== undefined) {
          bits.push(`${formatClock(context.start ?? 0)} to ${context.end !== undefined ? formatClock(context.end) : 'end'}`);
        }
        parts.push(`transcript (${bits.join(', ')})`);
      }
    }
    if (context.summaryIds.length > 0) {
      parts.push(`${context.summaryIds.length} summar${context.summaryIds.length === 1 ? 'y' : 'ies'}`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'no transcript context';
  }, [canPickContext, context, speakerLabels, transcription?.speakers]);

  const apiContext = (): ChatContext | undefined => {
    if (!canPickContext) return undefined;
    return {
      transcript: context.transcript,
      speakers: context.speakers,
      start: context.start,
      end: context.end,
      summary_ids: context.summaryIds,
    };
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Smart auto-scroll
  const userHasScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 80;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    userHasScrolledUp.current = !isNearBottom;
  }, []);

  useEffect(() => {
    // Do not scroll when there are no messages — this prevents the page from
    // jumping to the Chat section when first opening a transcription.
    if (!userHasScrolledUp.current && (messages.length > 0 || awaitingFirstChunk)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, awaitingFirstChunk]);

  // No forced scroll when streaming ends — respect the user's scroll position

  // Conversation persistence state
  const [conversations, setConversations] = useState<ChatConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showConversationPanel, setShowConversationPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const chatExportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (chatExportRef.current && !chatExportRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    loadSavedConversations();
  }, [transcriptionId, isScoped]);

  const loadSavedConversations = async () => {
    setIsLoadingConversations(true);
    try {
      // If scoped, only fetch conversations for this transcript;
      // if in collection view, fetch for that collection; otherwise fetch all
      const convos = isScoped
        ? await chatConversationsApi.list(transcriptionId)
        : await chatConversationsApi.list(undefined, collectionId);
      setConversations(convos);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const handleSaveConversation = async () => {
    if (!saveTitle.trim() || messages.length === 0) return;

    setIsSaving(true);
    try {
      const messagesToSave = messages
        .filter((m) => !m.isError)
        .map(({ role, content }) => ({ role, content }));

      if (activeConversationId) {
        await chatConversationsApi.update(activeConversationId, {
          title: saveTitle.trim(),
          messages: messagesToSave,
        });
      } else {
        const created = await chatConversationsApi.create({
          transcription_id: transcriptionId,
          title: saveTitle.trim(),
          messages: messagesToSave,
        });
        setActiveConversationId(created.id);
      }

      setShowSaveDialog(false);
      await loadSavedConversations();
      // Auto-open conversation panel so the user sees the saved item
      setShowConversationPanel(true);
    } catch (err) {
      console.error('Failed to save conversation:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadConversation = async (id: string) => {
    try {
      const convo = await chatConversationsApi.get(id);
      const loaded: DisplayMessage[] = convo.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setMessages(loaded);
      setActiveConversationId(convo.id);
      setSaveTitle(convo.title);
      setShowConversationPanel(false);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await chatConversationsApi.delete(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setSaveTitle('');
        setMessages([]);
      }
      await loadSavedConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setActiveConversationId(null);
    setSaveTitle('');
    setShowConversationPanel(false);
  };

  const openSaveDialog = () => {
    if (!saveTitle) {
      const firstUserMsg = messages.find((m) => m.role === 'user');
      setSaveTitle(
        firstUserMsg
          ? firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? '...' : '')
          : 'Chat conversation'
      );
    }
    setShowSaveDialog(true);
  };

  const handleExportChatMarkdown = () => {
    if (messages.length === 0) return;
    const title = saveTitle || 'Chat conversation';
    const markdownText = `# Chat Conversation - ${title}
Exported on: ${new Date().toLocaleString()}

${messages.map(m => `### ${m.role === 'user' ? 'User' : 'Assistant'}
${m.content}
`).join('\n')}
`;
    const blob = new Blob([markdownText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_Chat.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportChatPDF = () => {
    if (messages.length === 0) return;
    const isDark = document.documentElement.classList.contains('dark');
    const title = saveTitle || 'Chat conversation';
    
    const htmlContent = `
      <div class="container">
        <h1>Chat Conversation - ${title}</h1>
        <div class="meta">Exported on ${new Date().toLocaleString()}</div>
        ${messages.map(m => `
          <div class="message ${m.role}">
            <div class="sender ${m.role}">${m.role === 'user' ? 'User' : 'Assistant'}</div>
            <div class="markdown-content">${m.role === 'assistant' ? formatMarkdown(m.content) : m.content.replace(/\n/g, '<br/>')}</div>
          </div>
        `).join('')}
      </div>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export as PDF');
      return;
    }

    const bgColor = isDark ? '#0f172a' : '#ffffff';
    const textColor = isDark ? '#f1f5f9' : '#1f2937';
    const metaColor = isDark ? '#94a3b8' : '#6b7280';
    const borderColor = isDark ? '#334155' : '#e5e7eb';
    const quoteBg = isDark ? '#1e293b' : '#f9fafb';
    const quoteBorder = isDark ? '#3b82f6' : '#d1d5db';
    const tableHeadBg = isDark ? '#1e293b' : '#f9fafb';
    const tableHeadText = isDark ? '#ffffff' : '#111827';
    
    // User bubble colors
    const userBg = isDark ? '#1e3a8a' : '#eff6ff';
    const userBorder = isDark ? '#3b82f6' : '#2563eb';
    const userText = isDark ? '#93c5fd' : '#1d4ed8';

    // Assistant bubble colors
    const assistantBg = isDark ? '#1e293b' : '#f9fafb';
    const assistantBorder = isDark ? '#10b981' : '#059669';
    const assistantText = isDark ? '#34d399' : '#047857';

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: auto;
              margin: 0mm;
            }
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              background-color: ${bgColor};
              color: ${isDark ? textColor : '#111827'};
              line-height: 1.6;
              padding: 20mm;
              font-size: 14px;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              font-size: 26px;
              font-weight: 700;
              margin-top: 0;
              margin-bottom: 8px;
              color: ${isDark ? '#ffffff' : '#111827'};
            }
            .meta {
              font-size: 12px;
              color: ${metaColor};
              margin-bottom: 24px;
              border-bottom: 1px solid ${borderColor};
              padding-bottom: 12px;
            }
            p { margin-bottom: 16px; }
            ul { list-style-type: disc; padding-left: 24px; margin: 12px 0; }
            ol { list-style-type: decimal; padding-left: 24px; margin: 12px 0; }
            li { margin-bottom: 6px; }
            .checkbox-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; page-break-inside: avoid; }
            .checkbox-toggle { margin-top: 4px; width: 14px; height: 14px; border: 1px solid ${borderColor}; border-radius: 3px; }
            blockquote {
              border-left: 4px solid ${quoteBorder};
              background-color: ${quoteBg};
              padding: 12px 16px;
              font-style: italic;
              margin: 16px 0;
              border-radius: 0 8px 8px 0;
              page-break-inside: avoid;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
              font-size: 13px;
              page-break-inside: auto;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            th, td {
              border: 1px solid ${borderColor};
              padding: 10px 12px;
            }
            th {
              background-color: ${tableHeadBg};
              color: ${tableHeadText};
              font-weight: 600;
            }
            
            /* Messages Bubbles */
            .message {
              margin-bottom: 24px;
              padding: 18px 20px;
              max-width: 80%;
              box-sizing: border-box;
            }
            .message.user {
              background-color: ${userBg};
              border-right: 5px solid ${userBorder};
              margin-left: auto;
              margin-right: 0;
              border-radius: 12px 12px 0 12px;
              color: ${isDark ? '#f1f5f9' : '#1e293b'};
              page-break-inside: avoid;
            }
            .message.assistant {
              background-color: ${assistantBg};
              border-left: 5px solid ${assistantBorder};
              margin-left: 0;
              margin-right: auto;
              border-radius: 12px 12px 12px 0;
              color: ${isDark ? '#f1f5f9' : '#1f2937'};
            }
            
            .sender {
              font-weight: 700;
              font-size: 11px;
              margin-bottom: 6px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .sender.user { color: ${userText}; text-align: right; }
            .sender.assistant { color: ${assistantText}; text-align: left; }
            
            a { color: ${isDark ? '#60a5fa' : '#2563eb'}; text-decoration: underline; }
            pre { background-color: ${isDark ? '#1e293b' : '#f3f4f6'}; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 12px; margin: 12px 0; }
            code { background-color: ${isDark ? '#1e293b' : '#f3f4f6'}; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 12px; }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleFolder = (key: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateLastAssistant = (patch: (m: DisplayMessage) => DisplayMessage) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === 'assistant') updated[updated.length - 1] = patch(last);
      return updated;
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming || rangeInvalid) return;

    const userMessage: DisplayMessage = { role: 'user', content: input };

    setInput('');
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setAwaitingFirstChunk(true);
    setStreamStartedAt(Date.now());
    userHasScrolledUp.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const messagesToSend: ChatMessage[] = [...messages.filter(m => !m.isError), userMessage].map(
        ({ role, content }) => ({ role, content }),
      );
      const stream = await chatApi.sendChatMessage(messagesToSend, transcriptionId, {
        collectionId,
        reasoningLevel,
        context: apiContext(),
        signal: controller.signal,
      });

      let assistantMessage = '';
      let reasoning = '';
      let receivedContent = false;

      setMessages((prev) => [...prev, { role: 'assistant', content: '', phase: 'waiting' }]);

      for await (const event of chatApi.parseSSEStream(stream)) {
        if ('error' in event) {
          const errorText = event.error;
          setAwaitingFirstChunk(false);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            // Keep what was already written, show the error after it
            if (last && last.role === 'assistant' && last.content) {
              updated[updated.length - 1] = { ...last, phase: undefined };
              updated.push({ role: 'assistant', content: errorText, isError: true });
            } else {
              updated[updated.length - 1] = { role: 'assistant', content: errorText, isError: true };
            }
            return updated;
          });
          setIsStreaming(false);
          return;
        }

        if ('phase' in event) {
          // The bubble takes over from the typing dots: phase + elapsed time
          setAwaitingFirstChunk(false);
          updateLastAssistant((m) => ({ ...m, phase: event.phase }));
        } else if ('reasoning' in event) {
          reasoning += event.reasoning;
          setAwaitingFirstChunk(false);
          updateLastAssistant((m) => ({ ...m, reasoning, phase: m.phase === 'waiting' ? 'thinking' : m.phase }));
        } else if ('content' in event) {
          if (!receivedContent) {
            receivedContent = true;
            setAwaitingFirstChunk(false);
          }
          assistantMessage += event.content;
          updateLastAssistant((m) => ({ ...m, content: assistantMessage, phase: 'writing' }));
        } else if ('final' in event) {
          assistantMessage = event.final.content;
          reasoning = event.final.reasoning;
          updateLastAssistant((m) => ({ ...m, content: assistantMessage, reasoning: reasoning || undefined }));
        } else if ('warning' in event) {
          updateLastAssistant((m) => ({ ...m, warning: event.warning }));
        } else if ('done' in event) {
          updateLastAssistant((m) => ({ ...m, phase: undefined }));
        }
      }

      updateLastAssistant((m) => ({ ...m, phase: undefined }));
      setIsStreaming(false);
      setAwaitingFirstChunk(false);
    } catch (err) {
      const aborted = controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
      setAwaitingFirstChunk(false);
      setIsStreaming(false);

      if (aborted) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && !last.isError) {
            if (last.content || last.reasoning) {
              updated[updated.length - 1] = { ...last, phase: undefined, stopped: true };
            } else {
              updated.pop(); // nothing came back: drop the empty bubble
            }
          }
          return updated;
        });
        return;
      }

      const errorText = err instanceof Error ? err.message : 'Failed to send message';
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: errorText, isError: true };
          return updated;
        }
        return [...prev, { role: 'assistant', content: errorText, isError: true }];
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  // Abort a reply in flight when the panel goes away
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const hasMessages = messages.filter((m) => !m.isError).length > 0;
  const conversationGroups = isScoped ? [] : groupByTranscription(conversations, transcriptionNames);

  // ── Render helpers ──

  /** Flat conversation list (for transcript-scoped view) */
  const renderFlatList = () => (
    <div className="space-y-1">
      {conversations.map((c) => (
        <div
          key={c.id}
          onClick={() => handleLoadConversation(c.id)}
          className={`group flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${
            activeConversationId === c.id
              ? 'bg-blue-100 dark:bg-blue-900/40 border-l-3 border-blue-500'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm'
          }`}
        >
          <MessageSquare className={`w-4 h-4 flex-shrink-0 ${
            activeConversationId === c.id ? 'text-blue-500' : 'text-gray-400'
          }`} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm truncate ${
              activeConversationId === c.id
                ? 'font-semibold text-blue-700 dark:text-blue-300'
                : 'font-medium text-gray-800 dark:text-gray-200'
            }`}>
              {c.title}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button
            onClick={(e) => handleDeleteConversation(c.id, e)}
            className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );

  /** Folder-grouped conversation list (for Chat page) */
  const renderFolderList = () => (
    <div className="space-y-1">
      {conversationGroups.map((group) => {
        const folderKey = group.transcriptionId || '__general__';
        const isCollapsed = collapsedFolders.has(folderKey);
        const isCurrentContext = group.transcriptionId === (transcriptionId || null);

        return (
          <div key={folderKey}>
            <button
              onClick={() => toggleFolder(folderKey)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                isCurrentContext
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              )}
              <FolderOpen className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-semibold truncate flex-1">{group.label}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {group.items.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="ml-6 mt-1 space-y-1">
                {group.items.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleLoadConversation(c.id)}
                    className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                      activeConversationId === c.id
                        ? 'bg-blue-100 dark:bg-blue-900/40 border-l-2 border-blue-500'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 border-l-2 border-transparent'
                    }`}
                  >
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${
                      activeConversationId === c.id ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${
                        activeConversationId === c.id
                          ? 'font-semibold text-blue-700 dark:text-blue-300'
                          : 'font-medium text-gray-800 dark:text-gray-200'
                      }`}>
                        {c.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(c.id, e)}
                      className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const conversationCount = conversations.length;

  return (
    <div className="flex flex-col h-full max-h-[600px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 rounded-t-lg">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
          {activeConversationId ? (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate" title={saveTitle}>
              {saveTitle}
            </span>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">New conversation</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConversationPanel(!showConversationPanel)}
            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${
              showConversationPanel
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
            title="Saved conversations"
          >
            <FolderOpen className="w-4 h-4" />
            {conversationCount > 0 && (
              <span className="text-xs font-medium">{conversationCount}</span>
            )}
          </button>
          {hasMessages && (
            <>
              <button
                onClick={openSaveDialog}
                disabled={isSaving}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
                title="Save conversation"
              >
                <Save className="w-4 h-4" />
              </button>
              <div className="relative" ref={chatExportRef}>
                <button
                  onClick={() => setShowExportDropdown((v) => !v)}
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  title="Export conversation"
                >
                  <Download className="w-4 h-4" />
                </button>
                {showExportDropdown && (
                  <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => { setShowExportDropdown(false); handleExportChatMarkdown(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Markdown (.md)
                    </button>
                    <button
                      onClick={() => { setShowExportDropdown(false); handleExportChatPDF(); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      PDF Document (.pdf)
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
            {activeConversationId ? 'Update conversation' : 'Save conversation'}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Conversation title..."
              className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveConversation();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
              autoFocus
            />
            <button
              onClick={handleSaveConversation}
              disabled={isSaving || !saveTitle.trim()}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : activeConversationId ? 'Update' : 'Save'}
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Conversation panel */}
      {showConversationPanel && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 max-h-96 overflow-y-auto">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 sticky top-0 bg-gray-50 dark:bg-gray-900/50 backdrop-blur-sm z-10">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {isScoped ? 'Conversations' : 'All Conversations'}
            </span>
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>

          <div className="p-3">
            {isLoadingConversations ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 px-2 py-4 text-center">Loading...</p>
            ) : conversations.length === 0 ? (
              <div className="text-center py-6 px-4">
                <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No saved conversations yet.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Use the <Save className="w-3 h-3 inline" /> button to save a chat.
                </p>
              </div>
            ) : isScoped ? (
              renderFlatList()
            ) : (
              renderFolderList()
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4"
      >
        {messages.length === 0 && !awaitingFirstChunk && (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <p className="text-center">
              Start a conversation about {collectionId ? 'this collection' : transcriptionId ? 'the transcript' : 'anything'}
            </p>
          </div>
        )}

        {messages.map((message, idx) => {
          const isLive = message.role === 'assistant' && !!message.phase && idx === messages.length - 1;
          if (
            message.role === 'assistant' &&
            message.content === '' &&
            !message.reasoning &&
            !message.isError &&
            awaitingFirstChunk &&
            idx === messages.length - 1
          ) {
            return null;
          }

          if (message.isError) {
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[85%] px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                {message.role === 'assistant' ? (
                  <>
                    {message.reasoning && (
                      <ReasoningBlock reasoning={message.reasoning} live={isLive && message.phase === 'thinking'} />
                    )}
                    {message.content && (
                      <div
                        className="text-sm leading-relaxed markdown-content"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
                      />
                    )}
                    {isLive && message.phase && (
                      <div className={message.content || message.reasoning ? 'mt-2' : ''}>
                        <PhaseIndicator phase={message.phase} startedAt={streamStartedAt} />
                      </div>
                    )}
                    {message.warning && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {message.warning}
                      </p>
                    )}
                    {message.stopped && (
                      <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">Stopped before the end of the reply.</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            </div>
          );
        })}

        {awaitingFirstChunk && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {(canPickContext || (llmFeatures && llmFeatures.reasoning_levels.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2">
            {canPickContext && (
              <button
                type="button"
                onClick={() => setShowContext((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg border transition-colors max-w-full ${
                  showContext
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                title="Choose what the model sees: the whole transcript, some speakers, a time slice, summaries"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Context: {contextSummary}</span>
              </button>
            )}
            <ReasoningSelect
              features={llmFeatures}
              value={reasoningLevel}
              onChange={setReasoningLevel}
              disabled={isStreaming}
            />
          </div>
        )}

        {canPickContext && showContext && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 space-y-3 text-sm">
            {transcription && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={context.transcript}
                    onChange={(e) => setContext((c) => ({ ...c, transcript: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Transcript
                </label>
                {context.transcript && (
                  <div className="pl-6 space-y-2">
                    {speakerLabels.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Speakers:</span>
                        {speakerLabels.map((label) => {
                          const on = context.speakers === undefined || context.speakers.includes(label);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => toggleSpeaker(label)}
                              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                on
                                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700'
                                  : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600 line-through'
                              }`}
                              title={on ? 'Click to leave this speaker out' : 'Click to include this speaker'}
                            >
                              {speakerName(label)}
                            </button>
                          );
                        })}
                        {context.speakers !== undefined && (
                          <button
                            type="button"
                            onClick={() => setContext((c) => ({ ...c, speakers: undefined }))}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            all
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span className="mr-1">Time slice:</span>
                      <input
                        type="text"
                        value={rangeText.start}
                        onChange={(e) => applyRange('start', e.target.value)}
                        placeholder="0:00"
                        className={`w-20 px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                          rangeText.start.trim() && parseClock(rangeText.start) === null ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                        }`}
                        title="Start (m:ss or h:mm:ss); empty = from the beginning"
                      />
                      <span>to</span>
                      <input
                        type="text"
                        value={rangeText.end}
                        onChange={(e) => applyRange('end', e.target.value)}
                        placeholder={recordingEnd > 0 ? formatClock(recordingEnd) : 'end'}
                        className={`w-20 px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border rounded focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                          (rangeText.end.trim() && parseClock(rangeText.end) === null) || rangeInvalid ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                        }`}
                        title="End (m:ss or h:mm:ss); empty = until the end"
                      />
                      {(rangeText.start || rangeText.end) && (
                        <button
                          type="button"
                          onClick={() => { setRangeText({ start: '', end: '' }); setContext((c) => ({ ...c, start: undefined, end: undefined })); }}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          whole recording
                        </button>
                      )}
                      {rangeInvalid && <span className="text-red-500">end is before start</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
            {summaryOptions.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium text-gray-800 dark:text-gray-200">Summaries</p>
                {summaryOptions.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 pl-0.5 text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={context.summaryIds.includes(opt.id)}
                      onChange={(e) =>
                        setContext((c) => ({
                          ...c,
                          summaryIds: e.target.checked
                            ? [...c.summaryIds, opt.id]
                            : c.summaryIds.filter((id) => id !== opt.id),
                        }))
                      }
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Less context means faster replies and less risk of overflowing the model's window. The selection applies to the next messages.
            </p>
          </div>
        )}

        <div className="flex gap-2 sm:gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Type a message..."
            rows={2}
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 resize-none text-sm sm:text-base"
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 flex-shrink-0"
              title="Stop generating"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || rangeInvalid}
              className="px-3 sm:px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2 flex-shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
