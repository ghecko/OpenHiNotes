import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, AlertCircle, Save, FolderOpen, Trash2, X, Plus, MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';
import { ChatMessage } from '@/types';
import { chatApi, SSE_ERROR_PREFIX } from '@/api/chat';
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
}

interface DisplayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  isError?: boolean;
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
}: ChatPanelProps) {
  // Default: scope to transcript when inside a transcript view
  const isScoped = scopeToTranscription ?? !!transcriptionId;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
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

  const toggleFolder = (key: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: DisplayMessage = { role: 'user', content: input };

    setInput('');
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setAwaitingFirstChunk(true);
    userHasScrolledUp.current = false;

    try {
      const messagesToSend: ChatMessage[] = [...messages.filter(m => !m.isError), userMessage].map(
        ({ role, content }) => ({ role, content }),
      );
      const stream = await chatApi.sendChatMessage(messagesToSend, transcriptionId, { collectionId });

      let assistantMessage = '';
      let receivedContent = false;

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      for await (const chunk of chatApi.parseSSEStream(stream)) {
        if (chunk.startsWith(SSE_ERROR_PREFIX)) {
          const errorText = chunk.slice(SSE_ERROR_PREFIX.length);
          setAwaitingFirstChunk(false);
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: errorText, isError: true };
            return updated;
          });
          setIsStreaming(false);
          return;
        }

        if (!receivedContent) {
          receivedContent = true;
          setAwaitingFirstChunk(false);
        }

        assistantMessage += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantMessage };
          return updated;
        });
      }

      setIsStreaming(false);
      setAwaitingFirstChunk(false);
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Failed to send message';
      setAwaitingFirstChunk(false);
      setIsStreaming(false);

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: errorText, isError: true };
          return updated;
        }
        return [...prev, { role: 'assistant', content: errorText, isError: true }];
      });
    }
  };

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
            <button
              onClick={openSaveDialog}
              disabled={isSaving}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
              title="Save conversation"
            >
              <Save className="w-4 h-4" />
            </button>
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
          if (
            message.role === 'assistant' &&
            message.content === '' &&
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
                  <div
                    className="text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
                  />
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
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Type a message..."
            rows={3}
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 resize-none"
          />
          <button
            onClick={handleSendMessage}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium flex items-center justify-center gap-2 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
