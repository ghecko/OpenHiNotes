import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { TranscriptionViewer } from '@/components/TranscriptionViewer';
import { SpeakerEditor } from '@/components/SpeakerEditor';
import { ChatPanel } from '@/components/ChatPanel';
import { transcriptionsApi } from '@/api/transcriptions';
import { summariesApi } from '@/api/summaries';
import { templatesApi } from '@/api/templates';
import { Transcription, Summary, SummaryTemplate } from '@/types';
import { format } from 'date-fns';
import { Save, Loader, Plus, Pencil, Trash2, X, FileText, Maximize2 } from 'lucide-react';
import { formatMarkdown } from '@/utils/formatMarkdown';

function SummaryModal({
  summary,
  onClose,
  onDelete,
}: {
  summary: Summary;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Summary</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {format(new Date(summary.created_at), 'MMM d, yyyy HH:mm')} &bull; {summary.model_used}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(summary.id)}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Delete summary"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div
            className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(summary.content) }}
          />
        </div>
      </div>
    </div>
  );
}

export function TranscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [templates, setTemplates] = useState<SummaryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [showSpeakerEditor, setShowSpeakerEditor] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [openSummaryId, setOpenSummaryId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const t = await transcriptionsApi.getTranscription(id);
      setTranscription(t);
      setNotes(t.notes || '');

      const s = await summariesApi.getSummaries(id);
      setSummaries(s);

      const temps = await templatesApi.getTemplates();
      setTemplates(temps);
      if (temps.length > 0) {
        setSelectedTemplate(temps[0].id);
      }
    } catch (error) {
      console.error('Failed to load transcription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEditTitle = () => {
    if (!transcription) return;
    setEditTitle(transcription.title || transcription.original_filename);
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleSaveTitle = async () => {
    if (!transcription) return;
    const trimmed = editTitle.trim();
    const newTitle = !trimmed || trimmed === transcription.original_filename ? null : trimmed;
    setIsEditingTitle(false);
    if (newTitle !== transcription.title) {
      try {
        const updated = await transcriptionsApi.updateTitle(transcription.id, newTitle);
        setTranscription(updated);
      } catch (error) {
        console.error('Failed to update title:', error);
      }
    }
  };

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditTitle();
    }
  };

  const handleSaveNotes = async () => {
    if (!transcription) return;

    setIsSavingNotes(true);
    try {
      const updated = await transcriptionsApi.updateNotes(transcription.id, notes);
      setTranscription(updated);
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveSpeakers = async (speakers: Record<string, string>) => {
    if (!transcription) return;

    try {
      const updated = await transcriptionsApi.updateSpeakers(transcription.id, speakers);
      setTranscription(updated);
      setShowSpeakerEditor(false);
    } catch (error) {
      console.error('Failed to save speakers:', error);
    }
  };

  const handleGenerateSummary = async () => {
    if (!transcription) return;

    setIsGeneratingSummary(true);
    try {
      const summary = await summariesApi.createSummary({
        transcription_id: transcription.id,
        template_id: !showCustomPrompt ? selectedTemplate : undefined,
        custom_prompt: showCustomPrompt ? customPrompt : undefined,
      });

      setSummaries((prev) => [...prev, summary]);
      setShowCustomPrompt(false);
      setCustomPrompt('');
    } catch (error) {
      console.error('Failed to generate summary:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleDeleteSummary = async (summaryId: string) => {
    if (!window.confirm('Delete this summary?')) return;
    try {
      await summariesApi.deleteSummary(summaryId);
      setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      if (openSummaryId === summaryId) setOpenSummaryId(null);
    } catch (error) {
      console.error('Failed to delete summary:', error);
    }
  };

  if (isLoading) {
    return (
      <Layout title="Transcription">
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!transcription) {
    return (
      <Layout title="Transcription">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Transcription not found</p>
          <button
            onClick={() => navigate('/transcriptions')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Back to Transcriptions
          </button>
        </div>
      </Layout>
    );
  }

  const displayTitle = transcription.title || transcription.original_filename;
  const openSummary = summaries.find((s) => s.id === openSummaryId) || null;

  return (
    <Layout title={displayTitle}>
      <div className="space-y-6">
        {/* Editable Title */}
        <div className="flex items-center gap-3">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleSaveTitle}
              className="flex-1 text-2xl font-bold bg-transparent text-gray-900 dark:text-white border-b-2 border-primary-500 focus:outline-none focus:border-primary-600 py-1"
              maxLength={255}
            />
          ) : (
            <button
              onClick={handleStartEditTitle}
              className="group flex items-center gap-2 text-left"
              title="Click to rename"
            >
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                {displayTitle}
              </h1>
              <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          {transcription.title && (
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate" title={transcription.original_filename}>
              ({transcription.original_filename})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Language</p>
            <p className="font-semibold text-gray-900 dark:text-white uppercase">
              {transcription.language}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Duration</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {transcription.audio_duration
                ? `${Math.ceil(transcription.audio_duration / 60)} min`
                : '-'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
            <p className="font-semibold text-gray-900 dark:text-white capitalize">
              {transcription.status}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Date</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {format(new Date(transcription.created_at), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        <TranscriptionViewer
          transcription={transcription}
          onSpeakerUpdate={async (speakerId, newName) => {
            if (!transcription) return;
            const updatedSpeakers = { ...transcription.speakers, [speakerId]: newName };
            try {
              const updated = await transcriptionsApi.updateSpeakers(transcription.id, updatedSpeakers);
              setTranscription(updated);
            } catch (error) {
              console.error('Failed to update speaker:', error);
            }
          }}
        />

        {transcription.status === 'completed' && (
          <>
            {showSpeakerEditor ? (
              <SpeakerEditor
                speakers={transcription.speakers}
                segments={transcription.segments}
                onSave={handleSaveSpeakers}
              />
            ) : (
              <button
                onClick={() => setShowSpeakerEditor(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Edit Speaker Names
              </button>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                rows={4}
                placeholder="Add notes about this transcription..."
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {isSavingNotes && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Saving...</p>
              )}
            </div>

            {/* Summaries Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Summaries {summaries.length > 0 && <span className="text-sm font-normal text-gray-500">({summaries.length})</span>}
              </h3>

              {summaries.length === 1 ? (
                /* Single summary: show inline with delete button */
                <div className="mb-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(summaries[0].created_at), 'MMM d, yyyy HH:mm')} &bull;{' '}
                        {summaries[0].model_used}
                      </p>
                      <button
                        onClick={() => handleDeleteSummary(summaries[0].id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Delete summary"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div
                      className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(summaries[0].content) }}
                    />
                  </div>
                </div>
              ) : summaries.length > 1 ? (
                /* Multiple summaries: show as tiles, click to open modal */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {summaries.map((summary) => (
                    <div
                      key={summary.id}
                      onClick={() => setOpenSummaryId(summary.id)}
                      className="group relative p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-all hover:shadow-md"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(summary.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSummary(summary.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete summary"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <Maximize2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{summary.model_used}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4">
                        {summary.content.slice(0, 200)}{summary.content.length > 200 ? '...' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Summary modal */}
              {openSummary && (
                <SummaryModal
                  summary={openSummary}
                  onClose={() => setOpenSummaryId(null)}
                  onDelete={handleDeleteSummary}
                />
              )}

              {/* Generate summary controls */}
              <div className="space-y-4">
                {showCustomPrompt ? (
                  <>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={4}
                      placeholder="Enter custom prompt for summarization..."
                      className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary || !customPrompt.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGeneratingSummary && <Loader className="w-4 h-4 animate-spin" />}
                        Generate
                      </button>
                      <button
                        onClick={() => setShowCustomPrompt(false)}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <select
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a template...</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary || !selectedTemplate}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGeneratingSummary && <Loader className="w-4 h-4 animate-spin" />}
                        <Plus className="w-4 h-4" />
                        Generate Summary
                      </button>
                      <button
                        onClick={() => setShowCustomPrompt(true)}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                      >
                        Custom Prompt
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Chat</h3>
              <ChatPanel
                transcriptionId={transcription.id}
                transcriptionNames={{ [transcription.id]: transcription.title || transcription.original_filename }}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
