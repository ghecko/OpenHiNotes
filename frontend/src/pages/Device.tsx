import { useState, useEffect } from 'react';
import { Usb, Battery, BatteryCharging, Clock, Unplug, HardDrive, AlertCircle, CheckCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { DeviceSettingsPanel } from '@/components/DeviceSettingsPanel';
import { useDeviceConnection } from '@/hooks/useDeviceConnection';
import { deviceService } from '@/services/deviceService';
import { BatteryStatus } from '@/types';

const GB = 1024 * 1024 * 1024;

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{value}</dd>
    </div>
  );
}

export function Device() {
  const { device, connectDevice, disconnectDevice, formatDevice, syncTime, isLoading, error } = useDeviceConnection();
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const connected = !!device?.connected;
  const caps = connected ? deviceService.getCapabilities() : null;

  useEffect(() => {
    if (!connected || !caps?.battery) return;
    deviceService.getBatteryStatus().then(setBattery).catch(() => undefined);
  }, [connected, caps?.battery, device?.id]);

  if (!connected || !device || !caps) {
    return (
      <Layout title="Device">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Device Connected</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Connect your HiDock to see and change its configuration</p>
          <button
            onClick={connectDevice}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Connecting...' : 'Connect Device'}
          </button>
          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </Layout>
    );
  }

  const storage = device.storageInfo;
  const storagePercent = storage ? (storage.usedSpace / storage.totalSpace) * 100 : 0;

  const handleSyncTime = async () => {
    setNotice(null);
    await syncTime();
    setNotice('Device clock set to this computer\'s time.');
  };

  const handleFormat = () => {
    if (window.confirm('This will permanently erase every recording on the device. Continue?')) {
      formatDevice();
    }
  };

  return (
    <Layout title="Device">
      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">{error}</div>
      )}
      {notice && !error && (
        <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {notice}
        </div>
      )}

      <div className="max-w-3xl space-y-6">
        {/* Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Usb className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{device.name}</h2>
                <p className="text-xs text-green-600 dark:text-green-400">Connected</p>
              </div>
            </div>
            {battery && (
              <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300" title={`Battery ${battery.state}`}>
                {battery.state === 'charging'
                  ? <BatteryCharging className="w-5 h-5 text-green-500" />
                  : <Battery className="w-5 h-5" />}
                {battery.percent}%
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <InfoItem label="Model" value={device.model} />
            <InfoItem label="Firmware" value={device.firmwareVersion} />
            <InfoItem label="Serial number" value={<span className="font-mono">{device.serialNumber || '—'}</span>} />
          </dl>

          {storage ? (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Storage</span>
                <span>
                  {(storage.usedSpace / GB).toFixed(1)} / {(storage.totalSpace / GB).toFixed(1)} GB · {storage.fileCount} files
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${storagePercent}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Storage information needs a newer firmware.</p>
          )}

          <div className="flex flex-wrap gap-2 mt-6">
            <button
              onClick={handleSyncTime}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Clock className="w-4 h-4" /> Sync clock
            </button>
            <button
              onClick={disconnectDevice}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Unplug className="w-4 h-4" /> Disconnect
            </button>
          </div>
        </div>

        <DeviceSettingsPanel device={device} />

        {/* Danger zone */}
        {caps.storage && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-red-200 dark:border-red-900/60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Format storage</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Erase every recording on the device. Transcriptions in OpenHiNotes are not affected.
                </p>
              </div>
              <button
                onClick={handleFormat}
                disabled={isLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0"
              >
                Format
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
