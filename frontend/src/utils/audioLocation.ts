import { DeviceModel, HiDockDevice, KnownDevice, Transcription } from '@/types';
import { MODEL_LABELS } from '@/services/deviceService';

export type SourceKind = 'device' | 'upload' | 'recording';

/**
 * Where the audio of a transcription came from and, for a HiDock recording,
 * where the source file is relative to the device whose file list is loaded:
 *  - upload / recording: uploaded or recorded in the browser, never on a device
 *  - none: nothing to report (no list loaded, combined recording, or the file
 *    is on that device)
 *  - other_device: on another of the user's HiDocks, per the origin recorded
 *    at upload or the files that device held the last time it was connected
 *  - orphan: gone from the device it came from, or on none of the known ones
 */
export type AudioLocation =
  | { kind: 'none' }
  | { kind: 'upload' }
  | { kind: 'recording' }
  | { kind: 'other_device'; device: string; seenAt: string | null }
  | { kind: 'orphan'; device: string | null };

/** Identity used for origins and the device registry. Old firmware can report
 *  an empty serial number: fall back to the USB ids. */
export function deviceKey(device: Pick<HiDockDevice, 'id' | 'serialNumber'>): string {
  return device.serialNumber || device.id;
}

/** "HiDock P1", or "HiDock" when the model is not known. */
export function modelLabel(model: string | null | undefined): string {
  return model && model in MODEL_LABELS && model !== 'unknown'
    ? `HiDock ${MODEL_LABELS[model as DeviceModel]}`
    : 'HiDock';
}

/**
 * How a device is shown: the name the user gave it, else its model. The end
 * of the serial is added when the model alone would be ambiguous (another
 * unnamed device of the same model, or an unknown model).
 */
export function deviceLabel(serial: string, model: string | null | undefined, known: KnownDevice[]): string {
  const self = known.find((d) => d.serial === serial);
  if (self?.name) return self.name;
  const ownModel = model ?? self?.model ?? null;
  const label = modelLabel(ownModel);
  const twins = known.filter((d) => d.serial !== serial && !d.name && (d.model ?? null) === ownModel);
  return twins.length > 0 || label === 'HiDock' ? `${label} (${serial.slice(-4)})` : label;
}

const BROWSER_RECORDING = /^recording-\d{4}-\d{2}-\d{2}-[\d-]+\.webm$/i;
// "2026Apr12-122606-Rec54.hda", "2025Jul03-091500-Wip02.wav"
const HIDOCK_FILE = /\.hda$|^\d{4}[a-z]{3}\d{2}-\d{6}-[a-z]+\d+\.\w+$/i;

/** Source of a transcription created before sources were recorded, from its file name. */
export function guessSourceKind(fileName: string): SourceKind {
  if (BROWSER_RECORDING.test(fileName)) return 'recording';
  return HIDOCK_FILE.test(fileName) ? 'device' : 'upload';
}

export interface AudioLocationContext {
  /** Key of the device the loaded file list belongs to; null when no list is loaded. */
  listSerial: string | null;
  /** File names on that device. */
  fileNames: Set<string>;
  known: KnownDevice[];
  /** File names per known device (serial -> names), as last seen. */
  knownFiles: Map<string, Set<string>>;
}

type Located = Pick<
  Transcription,
  'original_filename' | 'combined_sources' | 'source_kind' | 'source_device_serial' | 'source_device_model'
>;

export function locateAudio(t: Located, ctx: AudioLocationContext): AudioLocation {
  const { listSerial, fileNames, known, knownFiles } = ctx;
  if (t.combined_sources && t.combined_sources.length > 0) return { kind: 'none' };
  const name = t.original_filename;
  if (listSerial && fileNames.has(name)) return { kind: 'none' };

  const origin = t.source_device_serial || null;
  const kind: SourceKind | null = t.source_kind ?? (origin ? 'device' : null);
  if (kind === 'upload' || kind === 'recording') return { kind };
  if (!kind) {
    // Created before sources were recorded: go by the file name, unless one of
    // the user's devices is known to have held the file.
    const guess = guessSourceKind(name);
    if (guess !== 'device' && !known.some((d) => knownFiles.get(d.serial)?.has(name))) return { kind: guess };
  }

  if (!listSerial) return { kind: 'none' };
  const listed = known.find((d) => d.serial === listSerial);
  const here = deviceLabel(listSerial, listed?.model, known);

  if (origin === listSerial) return { kind: 'orphan', device: here };

  if (origin) {
    const from = known.find((d) => d.serial === origin);
    const label = deviceLabel(origin, from?.model ?? t.source_device_model, known);
    // Not one of this user's devices (a shared transcription), or its files
    // were never listed: nothing says the file is gone.
    if (!from || !from.files_seen_at) return { kind: 'other_device', device: label, seenAt: null };
    return knownFiles.get(origin)?.has(name)
      ? { kind: 'other_device', device: label, seenAt: from.files_seen_at }
      : { kind: 'orphan', device: label };
  }

  // No recorded origin: the file may still sit on another device listed earlier.
  const holder = known.find((d) => d.serial !== listSerial && knownFiles.get(d.serial)?.has(name));
  if (holder) {
    return { kind: 'other_device', device: deviceLabel(holder.serial, holder.model, known), seenAt: holder.files_seen_at };
  }
  return { kind: 'orphan', device: null };
}

/** Whether a file name is on another known device than the one whose list is loaded. */
export function heldByOtherDevice(fileName: string, ctx: AudioLocationContext): boolean {
  return ctx.known.some((d) => d.serial !== ctx.listSerial && !!ctx.knownFiles.get(d.serial)?.has(fileName));
}
