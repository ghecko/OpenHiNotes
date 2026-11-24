import { useState } from 'react';
import { Check, HardDrive, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '@/store/useAppStore';
import { devicesApi } from '@/api/devices';
import { deviceKey, deviceLabel, modelLabel } from '@/utils/audioLocation';
import { parseServerDate } from '@/utils/dates';
import { KnownDevice } from '@/types';

/**
 * The HiDocks this user has connected, each with the name they gave it.
 * Names are what recordings show as their device ("Pocket P1"), which is the
 * only way to tell two devices of the same model apart at a glance.
 */
export function KnownDevicesCard() {
  const device = useAppStore((s) => s.device);
  const known = useAppStore((s) => s.knownDevices);
  const setKnownDevices = useAppStore((s) => s.setKnownDevices);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedKey = device?.connected ? deviceKey(device) : null;
  // The connected device can be named before its files were ever listed
  const rows: KnownDevice[] = device && connectedKey && !known.some((d) => d.serial === connectedKey)
    ? [...known, { serial: connectedKey, model: device.deviceModel, name: null, file_names: [], files_seen_at: null }]
    : known;
  if (rows.length === 0) return null;

  const startEditing = (row: KnownDevice) => {
    setEditing(row.serial);
    setDraft(row.name ?? '');
    setError(null);
  };

  const save = async (row: KnownDevice) => {
    setSaving(true);
    try {
      setKnownDevices(await devicesApi.rename(row.serial, draft.trim(), row.model));
      setEditing(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 w-full">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Your devices</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-4">
        Give a device a name to tell it apart. Recordings show the device they are on.
      </p>
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map((row) => {
          const seen = row.files_seen_at ? parseServerDate(row.files_seen_at) : null;
          const status = row.serial === connectedKey
            ? 'Connected'
            : seen && !Number.isNaN(seen.getTime())
              ? `Last connected ${format(seen, 'PP')} · ${row.file_names.length} recording${row.file_names.length !== 1 ? 's' : ''}`
              : 'Recordings not listed yet';
          return (
            <li key={row.serial} className="flex items-center gap-3 py-3">
              <HardDrive className={`w-4 h-4 flex-shrink-0 ${row.serial === connectedKey ? 'text-green-500' : 'text-gray-400'}`} />
              <div className="min-w-0 flex-1">
                {editing === row.serial ? (
                  <input
                    autoFocus
                    value={draft}
                    maxLength={60}
                    placeholder={modelLabel(row.model)}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(row);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {deviceLabel(row.serial, row.model, rows)}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {modelLabel(row.model)} · <span className="font-mono">{row.serial}</span> · {status}
                </p>
              </div>
              {editing === row.serial ? (
                <>
                  <button
                    onClick={() => save(row)}
                    disabled={saving}
                    title="Save name"
                    className="p-1.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    title="Cancel"
                    className="p-1.5 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startEditing(row)}
                  title="Rename"
                  className="p-1.5 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
