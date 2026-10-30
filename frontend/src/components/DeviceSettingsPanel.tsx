import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings2, Bluetooth, BluetoothConnected, Loader, X, RefreshCw, Headphones,
} from 'lucide-react';
import { deviceService } from '@/services/deviceService';
import {
  HiDockDevice, DeviceSettings, RecordingQuality, AudioInputSource, BluetoothStatus, BluetoothDevice,
} from '@/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scan window per round, then results are read; mirrors the official HiNotes loop. */
const BT_SCAN_SECONDS = 10;
const BT_SCAN_ROUND_MS = 5000;
const BT_CONNECT_TIMEOUT_MS = 20000;

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
        checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

interface Props {
  device: HiDockDevice;
}

export function DeviceSettingsPanel({ device }: Props) {
  const caps = deviceService.getCapabilities();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [quality, setQuality] = useState<RecordingQuality | null>(null);
  const [audioInput, setAudioInput] = useState<AudioInputSource | null>(null);
  const [btStatus, setBtStatus] = useState<BluetoothStatus | null>(null);
  const [showBlueCatch, setShowBlueCatch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (caps.settings) setSettings(await deviceService.getSettings());
      if (caps.recordingQuality) setQuality(await deviceService.getRecordingQuality());
      if (caps.bluetooth) {
        setBtStatus(await deviceService.getBluetoothStatus());
        setAudioInput(await deviceService.getAudioInput());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read device configuration');
    } finally {
      setLoading(false);
    }
  }, [caps.settings, caps.recordingQuality, caps.bluetooth]);

  useEffect(() => {
    load();
  }, [load, device.id]);

  /** Apply a change on the device, then update local state only if it succeeded. */
  const apply = async (change: () => Promise<void>, onSuccess: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await change();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply setting');
    } finally {
      setBusy(false);
    }
  };

  const toggleSetting = (key: keyof DeviceSettings, value: boolean) =>
    apply(() => deviceService.setSetting(key, value), () => setSettings((s) => (s ? { ...s, [key]: value } : s)));

  const btConnected = btStatus?.state === 'connected';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Settings2 className="w-5 h-5 text-gray-500 dark:text-gray-400" /> Configuration
        </h3>
        <button
          onClick={load}
          disabled={loading || busy}
          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg disabled:opacity-50"
          title="Re-read settings from the device"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-6 pb-4">
        {error && (
          <div className="mb-3 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400">
            <Loader className="w-4 h-4 animate-spin" /> Reading device configuration...
          </div>
        ) : (
          <div>
            {caps.recordingQuality && quality && (
              <Row
                title="Recording quality"
                description={quality === 'high'
                  ? 'High bitrate, up to 1 hour per recording. Larger files, slower transfer.'
                  : 'Recommended for calls and most recordings. Smaller files, faster transfer.'}
              >
                <select
                  value={quality}
                  disabled={busy}
                  onChange={(e) => {
                    const q = e.target.value as RecordingQuality;
                    apply(() => deviceService.setRecordingQuality(q), () => setQuality(q));
                  }}
                  className="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50"
                >
                  <option value="standard">
                    {caps.opusStandardQuality ? 'Standard (16 kbps)' : 'Standard (96 kbps)'}
                  </option>
                  <option value="high">High (768 kbps)</option>
                </select>
              </Row>
            )}

            {caps.bluetooth && (
              <Row
                title="BlueCatch"
                description={btConnected
                  ? `Connected to ${btStatus?.device?.name || btStatus?.device?.mac}`
                    + (btStatus?.battery !== undefined ? ` (${btStatus.battery}% battery)` : '')
                  : 'Scan and connect to Bluetooth earphones.'}
              >
                <button
                  onClick={() => setShowBlueCatch(true)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  View Devices
                </button>
              </Row>
            )}

            {caps.audioInput && btConnected && audioInput && (
              <Row title="Audio input" description="Microphone used when recording.">
                <select
                  value={audioInput}
                  disabled={busy}
                  onChange={(e) => {
                    const src = e.target.value as AudioInputSource;
                    apply(() => deviceService.setAudioInput(src), () => setAudioInput(src));
                  }}
                  className="px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg text-sm disabled:opacity-50"
                >
                  <option value="device">{device.name} microphone</option>
                  <option value="bluetooth">{btStatus?.device?.name || 'Bluetooth headset'}</option>
                </select>
              </Row>
            )}

            {settings && caps.autoRecord && (
              <Row title="Auto Record" description="Record calls automatically.">
                <Toggle checked={settings.autoRecord} disabled={busy} onChange={(v) => toggleSetting('autoRecord', v)} />
              </Row>
            )}

            {settings && caps.recordOnVibe && settings.recordOnVibe !== undefined && (
              <Row title="Save Vibe-mic Recordings" description="Once transferred, they will appear in Whispers.">
                <Toggle checked={settings.recordOnVibe} disabled={busy} onChange={(v) => toggleSetting('recordOnVibe', v)} />
              </Row>
            )}

            {settings && caps.notifyAboutRecording && settings.notifyAboutRecording !== undefined && (
              <Row title="Notify About Recording" description='Play a "Recording Started" alert for all participants.'>
                <Toggle checked={settings.notifyAboutRecording} disabled={busy} onChange={(v) => toggleSetting('notifyAboutRecording', v)} />
              </Row>
            )}

            {settings && caps.bluetoothTone && settings.bluetoothTone !== undefined && (
              <Row title="Bluetooth Prompt Tone" description="Play voice prompts on Bluetooth pairing and connection events.">
                <Toggle checked={settings.bluetoothTone} disabled={busy} onChange={(v) => toggleSetting('bluetoothTone', v)} />
              </Row>
            )}

            {settings && caps.usbPopup && settings.usbPopup !== undefined && (
              <Row title="Browser Popup on Connect" description="Let Chrome show the HiDock web app popup when the device is plugged in.">
                <Toggle checked={settings.usbPopup} disabled={busy} onChange={(v) => toggleSetting('usbPopup', v)} />
              </Row>
            )}

            {!caps.settings && (
              <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
                Update the device firmware to change its settings from here.
              </p>
            )}

            {caps.settings && !settings && !quality && !btStatus && (
              <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
                This device did not report any configurable settings.
              </p>
            )}
          </div>
        )}
      </div>

      {showBlueCatch && (
        <BlueCatchModal
          status={btStatus}
          onStatus={setBtStatus}
          onClose={() => setShowBlueCatch(false)}
        />
      )}
    </div>
  );
}

// ---- BlueCatch device picker ----

interface ModalProps {
  status: BluetoothStatus | null;
  onStatus: (s: BluetoothStatus | null) => void;
  onClose: () => void;
}

function BlueCatchModal({ status, onStatus, onClose }: ModalProps) {
  const [paired, setPaired] = useState<BluetoothDevice[]>([]);
  const [found, setFound] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Id of the running scan loop; bumping it stops that loop. */
  const scanRun = useRef(0);
  const scanActive = useRef(false);

  const scanLoop = useCallback(async () => {
    const run = ++scanRun.current;
    const active = () => run === scanRun.current;
    scanActive.current = true;
    setScanning(true);
    setError(null);
    try {
      setPaired(await deviceService.getPairedBluetoothDevices());
      while (active()) {
        await deviceService.startBluetoothScan(BT_SCAN_SECONDS);
        await sleep(BT_SCAN_ROUND_MS);
        if (!active()) break;
        await deviceService.stopBluetoothScan();
        await sleep(500);
        const results = await deviceService.getBluetoothScanResults();
        if (!active()) break;
        setFound((prev) => {
          const byMac = new Map(prev.map((d) => [d.mac, d]));
          for (const d of results) byMac.set(d.mac, { ...d, name: d.name || byMac.get(d.mac)?.name || '' });
          return Array.from(byMac.values()).sort((a, b) => Number(!!b.audio) - Number(!!a.audio) || (b.rssi ?? 0) - (a.rssi ?? 0));
        });
      }
    } catch (err) {
      if (active()) setError(err instanceof Error ? err.message : 'Bluetooth scan failed');
    } finally {
      if (active()) {
        scanActive.current = false;
        setScanning(false);
      }
    }
  }, []);

  const stopScan = useCallback(async () => {
    scanRun.current++;
    if (!scanActive.current) return;
    scanActive.current = false;
    setScanning(false);
    try {
      await deviceService.stopBluetoothScan();
    } catch {
      // the device stops on its own when the scan window ends
    }
  }, []);

  useEffect(() => {
    scanLoop();
    return () => { stopScan(); };
  }, [scanLoop, stopScan]);

  const connect = async (mac: string) => {
    await stopScan();
    setConnecting(mac);
    setError(null);
    try {
      await deviceService.connectBluetoothDevice(mac);
      const deadline = Date.now() + BT_CONNECT_TIMEOUT_MS;
      let s: BluetoothStatus | null = null;
      while (Date.now() < deadline) {
        await sleep(1000);
        s = await deviceService.getBluetoothStatus();
        if (s?.state === 'connected' || s?.state === 'disconnected') break;
      }
      onStatus(s);
      if (s?.state !== 'connected') {
        setError('Could not connect. Make sure the earphones are in pairing mode and try again.');
      } else {
        setPaired(await deviceService.getPairedBluetoothDevices());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async () => {
    setError(null);
    try {
      await deviceService.disconnectBluetoothDevice();
      await sleep(1000);
      onStatus(await deviceService.getBluetoothStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  };

  const forgetAll = async () => {
    if (!window.confirm('Remove all paired Bluetooth devices from the HiDock?')) return;
    setError(null);
    try {
      await deviceService.clearPairedBluetoothDevices();
      setPaired([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear paired devices');
    }
  };

  const connectedMac = status?.state === 'connected' ? status.device?.mac : undefined;
  const pairedMacs = new Set(paired.map((d) => d.mac));
  const discovered = found.filter((d) => !pairedMacs.has(d.mac));

  const deviceRow = (d: BluetoothDevice) => (
    <li key={d.mac} className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {d.audio ? <Headphones className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <Bluetooth className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm text-gray-900 dark:text-white truncate">{d.name || 'Unnamed device'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{d.mac}</p>
        </div>
      </div>
      {d.mac === connectedMac ? (
        <button onClick={disconnect} className="px-3 py-1.5 text-sm rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white">
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => connect(d.mac)}
          disabled={connecting !== null}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center gap-1"
        >
          {connecting === d.mac && <Loader className="w-3.5 h-3.5 animate-spin" />}
          {connecting === d.mac ? 'Connecting...' : 'Connect'}
        </button>
      )}
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <BluetoothConnected className="w-5 h-5" /> BlueCatch
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
        )}

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Paired</h4>
            {paired.length > 0 && (
              <button onClick={forgetAll} className="text-xs text-red-600 hover:underline">Forget all</button>
            )}
          </div>
          {paired.length === 0
            ? <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No paired devices.</p>
            : <ul className="divide-y divide-gray-100 dark:divide-gray-700">{paired.map(deviceRow)}</ul>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nearby</h4>
            {scanning ? (
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Loader className="w-3 h-3 animate-spin" /> Scanning
              </span>
            ) : (
              <button onClick={scanLoop} disabled={connecting !== null} className="flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50">
                <RefreshCw className="w-3 h-3" /> Scan again
              </button>
            )}
          </div>
          {discovered.length === 0
            ? <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                {scanning ? 'Put your earphones in pairing mode...' : 'No devices found.'}
              </p>
            : <ul className="divide-y divide-gray-100 dark:divide-gray-700">{discovered.map(deviceRow)}</ul>}
        </div>
      </div>
    </div>
  );
}
