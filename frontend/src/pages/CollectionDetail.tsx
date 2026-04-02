import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ChatPanel } from '@/components/ChatPanel';
import { collectionsApi } from '@/api/collections';
import { transcriptionsApi } from '@/api/transcriptions';
import { Collection, Transcription } from '@/types';
import {
  FolderOpen, Plus, Trash2, ArrowLeft, FileText, MessageSquare, X, Share2, Eye, Pencil,
} from 'lucide-react';
import { ShareModal } from '@/components/ShareModal';

export function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add transcription modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [allTranscriptions, setAllTranscriptions] = useState<Transcription[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  // Tab view
  const [activeTab, setActiveTab] = useState<'transcriptions' | 'chat'>('transcriptions');

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false);

  // Derived permission
  const permissionLevel = collection?.permission_level || 'owner';
  const canEdit = permissionLevel === 'owner' || permissionLevel === 'write';
  const isOwner = permissionLevel === 'owner';

  const loadCollection = async () => {
    if (!id) return;
    try {
      const [coll, trans] = await Promise.all([
        collectionsApi.get(id),
        collectionsApi.listTranscriptions(id),
      ]);
      setCollection(coll);
      setTranscriptions(trans);
    } catch (err) {
      console.error('Failed to load collection:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, [id]);

  const handleOpenAddModal = async () => {
    setShowAddModal(true);
    setIsLoadingAll(true);
    try {
      const res = await transcriptionsApi.getTranscriptions(0, 200);
      setAllTranscriptions(res.items.filter((t) => t.status === 'completed'));
    } catch (err) {
      console.error('Failed to load transcriptions:', err);
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleAssign = async (transcriptionId: string) => {
    if (!id) return;
    try {
      await collectionsApi.assignTranscription(id, transcriptionId);
      await loadCollection();
    } catch (err) {
      console.error('Failed to assign transcription:', err);
    }
  };

  const handleRemove = async (transcriptionId: string) => {
    if (!id) return;
    try {
      await collectionsApi.removeTranscription(id, transcriptionId);
      await loadCollection();
    } catch (err) {
      console.error('Failed to remove transcription:', err);
    }
  };

  if (isLoading) {
    return (
      <Layout title="Collection">
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
      </Layout>
    );
  }

  if (!collection) {
    return (
      <Layout title="Collection">
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Collection not found.</div>
      </Layout>
    );
  }

  const existingIds = new Set(transcriptions.map((t) => t.id));
  const availableTranscriptions = allTranscriptions.filter((t) => !existingIds.has(t.id));

  return (
    <Layout title={collection.name}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/collections')}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{collection.name}</h2>
              {/* Permission indicator */}
              {permissionLevel && permissionLevel !== 'owner' && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                    permissionLevel === 'write'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {permissionLevel === 'read' ? (
                    <><Eye className="w-3 h-3" /> Read only</>
                  ) : (
                    <><Pencil className="w-3 h-3" /> Can edit</>
                  )}
                </span>
              )}
            </div>
            {collection.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{collection.description}</p>
            )}
          </div>
          {/* Share button (owner only) */}
          {isOwner && (
            <button
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors flex-shrink-0"
              title="Share this collection"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('transcriptions')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'transcriptions'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Transcriptions ({transcriptions.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'chat'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Chat
            </span>
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'transcriptions' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Transcription
              </button>
            </div>

            {transcriptions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No transcriptions in this collection yet.</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Add transcriptions to chat or summarize across them.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transcriptions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
                  >
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium text-gray-900 dark:text-white truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                        onClick={() => navigate(`/transcriptions/${t.id}`)}
                      >
                        {t.title || t.original_filename}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {t.title && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{t.original_filename}</span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {t.audio_duration && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {Math.round(t.audio_duration / 60)} min
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(t.id)}
                      className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove from collection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="h-[600px]">
            <ChatPanel
              collectionId={id}
              scopeToTranscription={false}
              transcriptionNames={Object.fromEntries(
                transcriptions.map((t) => [t.id, t.title || t.original_filename])
              )}
            />
          </div>
        )}

        {/* Add transcription modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
            <div
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Transcription</h3>
                <button onClick={() => setShowAddModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {isLoadingAll ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</p>
                ) : availableTranscriptions.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No more transcriptions available to add.
                  </p>
                ) : (
                  availableTranscriptions.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-colors"
                      onClick={async () => {
                        await handleAssign(t.id);
                        // Remove the assigned item from available list
                        setAllTranscriptions((prev) => prev.filter((at) => at.id !== t.id));
                      }}
                    >
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {t.title || t.original_filename}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {t.audio_duration ? ` · ${Math.round(t.audio_duration / 60)} min` : ''}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Share modal */}
      {collection && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          resourceType="collection"
          resourceId={collection.id}
          resourceName={collection.name}
        />
      )}
    </Layout>
  );
}
