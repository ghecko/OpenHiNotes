import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAppStore } from '@/store/useAppStore';
import { useDeviceConnection } from '@/hooks/useDeviceConnection';
import { transcriptionsApi } from '@/api/transcriptions';
import { Transcription } from '@/types';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle, Loader } from 'lucide-react';

export function Dashboard() {
  const device = useAppStore((s) => s.device);
  const { connectDevice, isLoading: deviceLoading } = useDeviceConnection();
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTranscriptions();
  }, []);

  const loadTranscriptions = async () => {
    try {
      const response = await transcriptionsApi.getTranscriptions(0, 5);
      setTranscriptions(response.items || []);
      setTotalCount(response.total || 0);
    } catch (error) {
      console.error('Failed to load transcriptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Loader className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Loader className="w-4 h-4 text-yellow-600 animate-spin" />;
    }
  };

  return (
    <Layout title="Dashboard" deviceConnected={device?.connected}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Device Status
          </h3>
          <div className="flex items-center justify-between">
            <div>
              {device?.connected ? (
                <div>
                  <p className="text-2xl font-bold text-green-600">{device.model}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Connected
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                    Not Connected
                  </p>
                  <button
                    onClick={connectDevice}
                    disabled={deviceLoading}
                    className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50 font-medium"
                  >
                    {deviceLoading ? 'Connecting...' : 'Connect Device'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Transcriptions
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {totalCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Recent activity</p>
        </div>

        {device?.storageInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Device Storage
            </h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {(device.storageInfo.usedSpace / 1024 / 1024 / 1024).toFixed(1)} GB /{' '}
              {(device.storageInfo.totalSpace / 1024 / 1024 / 1024).toFixed(1)} GB
            </p>
            <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${(device.storageInfo.usedSpace / device.storageInfo.totalSpace) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Recent Transcriptions
          </h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            Loading transcriptions...
          </div>
        ) : transcriptions.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            No transcriptions yet. Start by uploading an audio file.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {transcriptions.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {t.original_filename}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(t.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(t.status)}
                        <span className="capitalize text-gray-700 dark:text-gray-300">
                          {t.status}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
