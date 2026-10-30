import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useDeviceConnection } from '@/hooks/useDeviceConnection';
import { transcriptionsApi } from '@/api/transcriptions';
import { Transcription } from '@/types';
import { format } from 'date-fns';
import {
  AlertCircle,
  CheckCircle,
  Loader,
  FileText,
  HardDrive,
  Wifi,
  WifiOff,
  Inbox,
} from 'lucide-react';

export function Dashboard() {
  const device = useAppStore((s) => s.device);
  const user = useAuthStore((s) => s.user);
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
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader className="w-4 h-4 text-primary-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Loader className="w-4 h-4 text-yellow-500 animate-spin" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'completed':
        return `${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`;
      case 'processing':
        return `${base} bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400`;
      case 'failed':
        return `${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`;
      default:
        return `${base} bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400`;
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <Layout title="Dashboard">
      {/* Welcome Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting()}{user?.display_name ? `, ${user.display_name}` : ''} 👋
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Here's an overview of your workspace
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Device Status Card */}
        <div className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200/60 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ${device?.connected ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
              {device?.connected ? (
                <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              )}
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Device Status
            </h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              {device?.connected ? (
                <div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{device.model}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Connected · <Link to="/device" className="text-primary-600 dark:text-primary-400 hover:underline">Configure</Link>
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
                    className="mt-3 px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg text-sm transition-all duration-200 disabled:opacity-50 font-medium shadow-sm hover:shadow-md"
                  >
                    {deviceLoading ? 'Connecting...' : 'Connect Device'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transcriptions Count Card */}
        <div className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200/60 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Transcriptions
            </h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {totalCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Total transcriptions</p>
        </div>

        {/* Device Storage Card */}
        {device?.storageInfo && (
          <div className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200/60 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <HardDrive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Device Storage
              </h3>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              {(device.storageInfo.usedSpace / 1024 / 1024 / 1024).toFixed(1)} GB /{' '}
              {(device.storageInfo.totalSpace / 1024 / 1024 / 1024).toFixed(1)} GB
            </p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${(device.storageInfo.usedSpace / device.storageInfo.totalSpace) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Recent Transcriptions */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200/60 dark:border-gray-700/40">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Recent Transcriptions
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Your latest transcription activity
          </p>
        </div>

        {isLoading ? (
          <div className="p-16 text-center">
            <Loader className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading transcriptions...</p>
          </div>
        ) : transcriptions.length === 0 ? (
          <div className="p-16 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700/50 mb-4">
              <Inbox className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">No transcriptions yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Start by uploading an audio file to get your first transcription.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 dark:bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {transcriptions.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors duration-150"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {t.original_filename}
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
