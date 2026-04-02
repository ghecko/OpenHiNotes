import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { transcriptionsApi } from '@/api/transcriptions';
import { useAppStore } from '@/store/useAppStore';
import { Transcription } from '@/types';
import { format } from 'date-fns';
import {
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader,
  Search,
  RefreshCw,
  FileText,
  Inbox,
  Clock,
  Unplug,
  ArrowUpDown,
} from 'lucide-react';

export function Transcriptions() {
  const navigate = useNavigate();
  const recordings = useAppStore((s) => s.recordings);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'shared'>('all');

  // Set of filenames currently on the device — used to detect orphaned transcriptions
  const deviceFileNames = useMemo(
    () => new Set(recordings.map((r) => r.fileName)),
    [recordings],
  );

  useEffect(() => {
    loadTranscriptions();
  }, [sortOrder, ownershipFilter]);

  const loadTranscriptions = async () => {
    setIsLoading(true);
    try {
      const response = await transcriptionsApi.getTranscriptions(0, 100, sortOrder, ownershipFilter);
      setTranscriptions(response.items);
    } catch (error) {
      console.error('Failed to load transcriptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this transcription?')) {
      try {
        await transcriptionsApi.deleteTranscription(id);
        setTranscriptions((prev) => prev.filter((t) => t.id !== id));
      } catch (error) {
        console.error('Failed to delete transcription:', error);
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3.5 h-3.5" />;
      case 'processing':
        return <Loader className="w-3.5 h-3.5 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5" />;
      default:
        return <Clock className="w-3.5 h-3.5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-150';
    switch (status) {
      case 'completed':
        return `${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`;
      case 'processing':
        return `${base} bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400`;
      case 'failed':
        return `${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`;
      default:
        return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400`;
    }
  };

  const filteredTranscriptions = transcriptions.filter((t) => {
    const searchTarget = (t.title || t.original_filename).toLowerCase();
    const matchesSearch = searchTarget.includes(searchTerm.toLowerCase()) ||
      t.original_filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <Layout title="Transcriptions">
      <div className="space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search transcriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/60 dark:border-gray-700/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/60 dark:border-gray-700/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-200"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          {/* Ownership filter */}
          <div className="inline-flex rounded-xl border border-gray-200/60 dark:border-gray-700/40 overflow-hidden">
            {(['all', 'mine', 'shared'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setOwnershipFilter(f)}
                className={`px-3 py-2.5 text-sm font-medium transition-colors ${
                  ownershipFilter === f
                    ? 'bg-primary-500 text-white'
                    : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'mine' ? 'Mine' : 'Shared'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/40 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
            title={`Sort by date: ${sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}`}
          >
            <ArrowUpDown className="w-4 h-4" />
            <span className="text-sm">{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
          </button>

          <button
            onClick={loadTranscriptions}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl font-medium transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Transcriptions Table */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center">
              <Loader className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">Loading transcriptions...</p>
            </div>
          ) : filteredTranscriptions.length === 0 ? (
            <div className="p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700/50 mb-4">
                {transcriptions.length === 0 ? (
                  <Inbox className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                ) : (
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">
                {transcriptions.length === 0
                  ? 'No transcriptions yet'
                  : 'No matching transcriptions'}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {transcriptions.length === 0
                  ? 'Upload an audio file to create your first transcription.'
                  : 'Try adjusting your search or filter criteria.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/80 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Language
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {filteredTranscriptions.map((t) => (
                    <tr
                      key={t.id}
                      className="group hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-150 cursor-pointer"
                      onClick={() => navigate(`/transcriptions/${t.id}`)}
                    >
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                            <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-150 truncate">
                                {t.title || t.original_filename}
                              </span>
                              {deviceFileNames.size > 0 && !deviceFileNames.has(t.original_filename) && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0"
                                  title="Source recording no longer on device"
                                >
                                  <Unplug className="w-3 h-3" />
                                  Orphan
                                </span>
                              )}
                            </div>
                            {t.title && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 block truncate">
                                {t.original_filename}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 uppercase">
                        {t.language}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {t.audio_duration
                          ? `${Math.ceil(t.audio_duration / 60)} min`
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(t.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={getStatusBadge(t.status)}>
                          {getStatusIcon(t.status)}
                          <span className="capitalize">{t.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
