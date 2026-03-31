import { HiDockDevice, StorageInfo, AudioRecording } from '@/types';

const VENDOR_ID = 0x10d6;
const ALTERNATE_VENDOR_ID = 0x3887;
const INTERFACE_NUMBER = 0;
const ENDPOINT_IN = 2;
const ENDPOINT_OUT = 1;

const COMMANDS = {
  GET_DEVICE_INFO: 1,
  SET_DEVICE_TIME: 3,
  GET_FILE_LIST: 4,
  TRANSFER_FILE: 5,
  GET_FILE_COUNT: 6,
  DELETE_FILE: 7,
  GET_SETTINGS: 11,
  SET_SETTINGS: 12,
  GET_FILE_BLOCK: 13,
  GET_CARD_INFO: 16,
  FORMAT_CARD: 17,
};

interface DeviceInfo {
  model: string;
  serialNumber: string;
  firmwareVersion: string;
}

// ---- Unsigned integer helpers (JS bitwise ops are 32-bit signed) ----

function readU16BE(d: Uint8Array, o: number): number {
  return ((d[o] << 8) | d[o + 1]) >>> 0;
}

function readU32BE(d: Uint8Array, o: number): number {
  return (((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0);
}

function readU64BE(d: Uint8Array, o: number): number {
  // Returns a JS number — precise up to 2^53
  return readU32BE(d, o) * 0x100000000 + readU32BE(d, o + 4);
}

function writeU16BE(d: Uint8Array, o: number, v: number): void {
  d[o] = (v >> 8) & 0xff;
  d[o + 1] = v & 0xff;
}

function writeU32BE(d: Uint8Array, o: number, v: number): void {
  d[o] = (v >>> 24) & 0xff;
  d[o + 1] = (v >>> 16) & 0xff;
  d[o + 2] = (v >>> 8) & 0xff;
  d[o + 3] = v & 0xff;
}

/**
 * GrowableBuffer — efficient buffer for accumulating USB data with O(1)
 * amortized appends.  Replaces the O(n²) concat-copy pattern where every
 * USB read created a new Uint8Array and copied the entire existing buffer.
 * Uses geometric growth (doubling) with an offset-based consumption model
 * so parsing can advance through data without copying.
 *
 * Ported from the reference hidock-next implementation.
 */
class GrowableBuffer {
  private static readonly MIN_CAPACITY = 65536; // 64 KB — matches USB read size
  private buf: Uint8Array;
  private offset = 0; // read cursor: bytes before this have been consumed
  private used = 0;   // write cursor: bytes after this are uninitialised

  constructor(initialCapacity?: number) {
    const cap = Math.max(initialCapacity ?? GrowableBuffer.MIN_CAPACITY, GrowableBuffer.MIN_CAPACITY);
    this.buf = new Uint8Array(cap);
  }

  get length(): number { return this.used - this.offset; }

  /** Append data, growing the underlying buffer if necessary. */
  append(data: Uint8Array): void {
    if (data.length === 0) return;
    const required = this.used + data.length;
    if (required > this.buf.length) this.grow(required);
    this.buf.set(data, this.used);
    this.used += data.length;
  }

  /** Read one byte at *index* (relative to current offset). */
  byteAt(index: number): number {
    return this.buf[this.offset + index];
  }

  /** Copy-out a range (indices relative to current offset). */
  sliceCopy(start: number, end: number): Uint8Array {
    return this.buf.slice(this.offset + start, this.offset + end);
  }

  /** Advance read cursor by *count* bytes. Compacts when waste > 50 %. */
  consume(count: number): void {
    this.offset += count;
    if (this.offset > this.buf.length / 2) this.compact();
  }

  /** Atomic extract-then-consume. */
  extractAndConsume(start: number, end: number, consumeCount: number): Uint8Array {
    const copy = this.sliceCopy(start, end);
    this.consume(consumeCount);
    return copy;
  }

  /** Reset to empty state, keeping allocated capacity. */
  clear(): void { this.offset = 0; this.used = 0; }

  // ---- internals ----

  private grow(minCapacity: number): void {
    let newCap = this.buf.length;
    while (newCap < minCapacity) newCap *= 2;
    const newBuf = new Uint8Array(newCap);
    newBuf.set(this.buf.subarray(this.offset, this.used));
    this.buf = newBuf;
    this.used -= this.offset;
    this.offset = 0;
  }

  private compact(): void {
    const len = this.length;
    if (len > 0) this.buf.copyWithin(0, this.offset, this.used);
    this.offset = 0;
    this.used = len;
  }
}

// ---- Date parsing from filename ----

function parseFilenameDate(filename: string): Date {
  try {
    // Format: YYYYMMDDHHMMSS (14-digit prefix)
    if (filename.length >= 14 && filename.slice(0, 14).match(/^\d{14}$/)) {
      const year = parseInt(filename.slice(0, 4));
      const month = parseInt(filename.slice(4, 6)) - 1;
      const day = parseInt(filename.slice(6, 8));
      const hour = parseInt(filename.slice(8, 10));
      const minute = parseInt(filename.slice(10, 12));
      const second = parseInt(filename.slice(12, 14));
      return new Date(year, month, day, hour, minute, second);
    }

    // Format: 2025May12-114141-Rec44.hda
    const monthMatch = filename.match(/^(\d{4})([A-Za-z]{3})(\d{1,2})-(\d{2})(\d{2})(\d{2})/);
    if (monthMatch) {
      const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = monthMatch;
      const monthMap: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };
      const month = monthMap[monthStr];
      if (month !== undefined) {
        return new Date(parseInt(yearStr), month, parseInt(dayStr),
          parseInt(hourStr), parseInt(minuteStr), parseInt(secondStr));
      }
    }

    // Format: HDA_20250108_144523.hda or 2025-12-08_0044.hda
    const numericMatch = filename.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_](\d{2})(\d{2})(\d{2})?/);
    if (numericMatch) {
      const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = numericMatch;
      return new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr),
        parseInt(hourStr), parseInt(minuteStr), parseInt(secondStr || '0'));
    }
  } catch (error) {
    console.debug('[OpenHiNotes] Date parse error for "%s":', filename, error);
  }

  // Fallback to current date
  return new Date();
}

// ---- Audio format detection & WAV header ----

/**
 * Detect audio format from the first bytes of downloaded data.
 * HiDock .hda files can be WAV (RIFF header), MPEG audio, or raw PCM.
 */
function detectAudioFormat(firstChunk: Uint8Array): 'wav' | 'mpeg' | 'pcm' {
  if (firstChunk.length >= 4) {
    // WAV: starts with "RIFF"
    if (firstChunk[0] === 0x52 && firstChunk[1] === 0x49 &&
        firstChunk[2] === 0x46 && firstChunk[3] === 0x46) {
      return 'wav';
    }
    // MPEG frame sync: 0xFF followed by 0xE0+ (11 sync bits)
    if (firstChunk[0] === 0xFF && (firstChunk[1] & 0xE0) === 0xE0) {
      return 'mpeg';
    }
  }
  return 'pcm';
}

/**
 * Create a WAV file header for raw PCM data.
 * HiDock file versions: v2 = 16kHz 16-bit mono, others = 16kHz 8-bit mono.
 */
function createWavHeader(
  dataSize: number,
  fileVersion: number,
): Uint8Array {
  const sampleRate = 16000;
  const bitsPerSample = fileVersion === 2 ? 16 : 16; // treat all as 16-bit for browser compat
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);         // PCM sub-chunk size
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Uint8Array(header);
}

// ---- File record parsing ----
// HiDock file record format (from GET_FILE_LIST body):
//   [0]       fileVersion   (uint8)
//   [1]       filenameLen   (uint8)  — single byte; filenames are ≤ 255 chars
//   [0]           fileVersion   (uint8)
//   [1 .. 3]      filenameLen   (uint24 BE)
//   [4 .. 4+N-1]  filename      (ASCII/UTF-16)
//   [4+N .. 7+N]  fileSize      (uint32 BE)
//   [8+N .. 13+N] reserved      (6 bytes)
//   [14+N .. 29+N] signature    (16 bytes)
//   Total per record = 30 + filenameLen

const FILE_RECORD_OVERHEAD = 30;

function parseFileRecord(
  data: Uint8Array,
  offset: number,
  isFirst: boolean = false
): { recording: AudioRecording; bytesRead: number } | null {
  // Discard leading 0xFF bytes (flash padding)
  while (offset < data.length && data[offset] === 0xff) {
    // If we hit 0xFFFF, it's the header, not a record.
    if (data[offset + 1] === 0xff) return null;
    offset++;
  }

  // Need at least version + 3-byte length
  if (offset + 4 > data.length) return null;

  const version = data[offset];
  // Filename length is 3 bytes Big Endian in newer firmwares
  const filenameLen = (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];

  if (isFirst) {
    console.log('[OpenHiNotes] First record header at offset %d: v=%d len=%d total_bytes=%d', 
      offset, version, filenameLen, data.length - offset);
  }

  // Sanity check
  if (version === 255 || filenameLen === 0 || filenameLen > 512) {
     return null; 
  }

  const recordLen = 1 + 3 + 4 + 6 + 16 + filenameLen; 
  if (offset + recordLen > data.length) return null;

  const filenameStart = offset + 4;
  const sizeOffset = filenameStart + filenameLen;
  const size = readU32BE(data, sizeOffset);
  
  // Calculate duration (Hz heuristic)
  const duration = version === 2 ? size / 32000 : size / 16000;

  const rawFilename = data.slice(filenameStart, filenameStart + filenameLen);
  
  if (isFirst) {
    console.log('[OpenHiNotes] Raw filename bytes:', Array.from(rawFilename).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // Detect if UTF-16LE or ASCII
  let fileName = '';
  let nullCount = 0;
  if (rawFilename.length >= 4) {
    for (let i = 1; i < rawFilename.length; i += 2) {
      if (rawFilename[i] === 0) nullCount++;
    }
    
    if (nullCount > rawFilename.length / 4) {
      fileName = new TextDecoder('utf-16le').decode(rawFilename);
    } else {
      fileName = new TextDecoder('utf-8').decode(rawFilename);
    }
  } else {
    fileName = new TextDecoder('utf-8').decode(rawFilename);
  }

  // Strip non-printable characters and leading nulls
  fileName = fileName.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

  if (fileName.length < 3) {
    fileName = `Recording_${offset}_${Math.floor(size / 1024)}KB`;
  }

  const sigOffset = sizeOffset + 4 + 6;
  const signature = data.slice(sigOffset, Math.min(sigOffset + 16, data.length));

  return {
    recording: {
      id: `${fileName}_${offset}`,
      fileName,
      size,
      duration,
      dateCreated: parseFilenameDate(fileName),
      fileVersion: version,
      signature,
    },
    bytesRead: recordLen,
  };
}

// ========================================================================

class DeviceService {
  private device: USBDevice | null = null;
  private sequenceId = 0;
  private receiveBuffer = new GrowableBuffer();
  private connectingPromise: Promise<HiDockDevice> | null = null;

  /**
   * In-memory cache of downloaded audio blobs keyed by fileName.
   * Survives component re-renders and page navigations because
   * DeviceService is a singleton.  Cleared on device disconnect.
   */
  private blobCache = new Map<string, Blob>();

  // ---- Public API ----

  async requestDevice(): Promise<USBDevice> {
    try {
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: VENDOR_ID },
          { vendorId: ALTERNATE_VENDOR_ID },
        ],
      });
      return device;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        throw new Error('No HiDock device found. Please connect your device.');
      }
      throw error;
    }
  }

  async connectDevice(device: USBDevice): Promise<HiDockDevice> {
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = (async () => {
      try {
        this.device = device;
        this.sequenceId = 0;
        this.receiveBuffer.clear();

        if (!device.opened) {
          await device.open();
        }
        await device.selectConfiguration(1);
        await device.claimInterface(INTERFACE_NUMBER);

        const info = await this.getDeviceInfo();
        const storage = await this.getStorageInfo();

        return {
          id: `${device.vendorId}-${device.productId}-${info.serialNumber}`,
          name: `HiDock ${info.model}`,
          model: info.model,
          serialNumber: info.serialNumber,
          firmwareVersion: info.firmwareVersion,
          connected: true,
          storageInfo: storage,
        };
      } catch (error) {
        await this.disconnectDevice();
        throw error;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  async disconnectDevice(): Promise<void> {
    if (this.device) {
      try {
        await this.device.releaseInterface(INTERFACE_NUMBER);
        await this.device.close();
      } catch {
        // ignore cleanup errors
      }
      this.device = null;
      this.receiveBuffer.clear();
      this.blobCache.clear();
    }
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const seqId = await this.sendCommand(COMMANDS.GET_DEVICE_INFO);
    const { body } = await this.receiveResponse(seqId);

    let offset = 0;
    const read = (len: number) => {
      const s = new TextDecoder().decode(body.slice(offset, offset + len));
      offset += len;
      return s;
    };

    const modelLen = readU16BE(body, offset); offset += 2;
    const model = read(modelLen);

    const serialLen = readU16BE(body, offset); offset += 2;
    const serialNumber = read(serialLen);

    const fwLen = readU16BE(body, offset); offset += 2;
    const firmwareVersion = read(fwLen);

    return { model, serialNumber, firmwareVersion };
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const seqId = await this.sendCommand(COMMANDS.GET_CARD_INFO);
    const { body } = await this.receiveResponse(seqId);

    console.log('[OpenHiNotes] GET_CARD_INFO raw:', body.length,
      Array.from(body.slice(0, Math.min(body.length, 64))).map(b => b.toString(16).padStart(2, '0')).join(' '));

    let freeMiB = 0;
    let capacityMiB = 0;
    let status = 0;

    if (body.length >= 12) {
      freeMiB = readU32BE(body, 0);
      capacityMiB = readU32BE(body, 4);
      status = readU32BE(body, 8);
    }

    console.log('[OpenHiNotes] Storage MiB: free=%d, capacity=%d, status=%d', freeMiB, capacityMiB, status);

    const totalSpace = capacityMiB * 1024 * 1024;
    const freeSpace = freeMiB * 1024 * 1024;
    const usedSpace = totalSpace - freeSpace;

    // Get real file count
    let fileCount = 0;
    try {
      const countSeq = await this.sendCommand(COMMANDS.GET_FILE_COUNT);
      const { body: countBody } = await this.receiveResponse(countSeq);
      if (countBody.length >= 4) {
        fileCount = readU32BE(countBody, 0);
      }
    } catch (e) {
      console.warn('[OpenHiNotes] Failed to get file count:', e);
    }

    return {
      totalSpace: totalSpace || 1,
      usedSpace: usedSpace || 0,
      freeSpace: Math.max(0, freeSpace),
      fileCount: fileCount || 0
    };
  }

  async getFileList(onProgress?: (files: AudioRecording[]) => void): Promise<AudioRecording[]> {
    // Send index 0 as parameter to some firmware versions
    const body = new Uint8Array(4);
    writeU32BE(body, 0, 0);
    const seqId = await this.sendCommand(COMMANDS.GET_FILE_LIST, body);
    return this.receiveStreamingFileList(seqId, onProgress);
  }

  async downloadFile(
    fileName: string,
    fileSize: number,
    onProgress?: (percent: number) => void,
    fileVersion?: number,
  ): Promise<Blob> {
    console.log('[OpenHiNotes] Starting stream download for %s (%d bytes)', fileName, fileSize);

    // Clear receive buffer before download to prevent stale data interference
    this.receiveBuffer.clear();

    // Try TRANSFER_FILE command first (cmd 5, body = filename only).
    // This is the protocol used by the reference desktop app (jensen.js)
    // and works more reliably with newer v5 firmware.
    const fileNameBytes = new TextEncoder().encode(fileName);
    let seqId: number;
    let streamCmd: number;

    try {
      seqId = await this.sendCommand(COMMANDS.TRANSFER_FILE, fileNameBytes);
      streamCmd = COMMANDS.TRANSFER_FILE;
      console.log('[OpenHiNotes] Using TRANSFER_FILE (cmd 5) protocol');
    } catch {
      // Fall back to GET_FILE_BLOCK (cmd 13) with 4-byte size prefix
      const body = new Uint8Array(4 + fileNameBytes.length);
      writeU32BE(body, 0, fileSize);
      body.set(fileNameBytes, 4);
      seqId = await this.sendCommand(COMMANDS.GET_FILE_BLOCK, body);
      streamCmd = COMMANDS.GET_FILE_BLOCK;
      console.log('[OpenHiNotes] Fallback to GET_FILE_BLOCK (cmd 13) protocol');
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    const startTime = Date.now();
    let consecutiveTimeouts = 0;
    const maxConsecutiveTimeouts = 100;
    let lastProgressLog = -1; // Track last logged progress percentage

    // Optimized download loop matching reference implementation pattern:
    // 1. Read raw USB data into buffer
    // 2. Parse ALL available packets in a tight inner loop
    // This avoids per-packet overhead from receiveResponse() and extracts
    // multiple packets per USB read, dramatically improving throughput.
    while (received < fileSize && consecutiveTimeouts < maxConsecutiveTimeouts) {
      const gotData = await this.readToBuffer();

      if (!gotData) {
        consecutiveTimeouts++;
        if (consecutiveTimeouts % 20 === 0) {
          console.warn('[OpenHiNotes] Download: %d consecutive empty reads at %d/%d bytes',
            consecutiveTimeouts, received, fileSize);
        }
        // Check if we're close enough to done
        if (received > 0 && received >= fileSize - 1024) {
          console.log('[OpenHiNotes] Close enough to expected size, finishing');
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }

      consecutiveTimeouts = 0;

      // Tight inner loop: parse ALL available packets from the buffer
      while (received < fileSize) {
        const msg = this.tryParsePacket(seqId, streamCmd);
        if (!msg) break; // No complete packet available yet

        if (msg.body.length === 0) {
          if (received > 0) {
            console.log('[OpenHiNotes] Empty packet at %d/%d — end of transfer', received, fileSize);
            break;
          }
          continue;
        }

        chunks.push(new Uint8Array(msg.body));
        received += msg.body.length;

        // Log progress at every 10% milestone (not every chunk)
        const pct = Math.round((received / fileSize) * 100);
        const milestone = Math.floor(pct / 10) * 10;
        if (milestone > lastProgressLog) {
          lastProgressLog = milestone;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const speed = (received / 1024 / ((Date.now() - startTime) / 1000)).toFixed(0);
          console.log('[OpenHiNotes] Download: %d%% (%d/%d bytes) — %ss elapsed, %s KB/s',
            pct, received, fileSize, elapsed, speed);
        }

        if (onProgress && fileSize > 0) {
          onProgress(Math.min(100, pct));
        }
      }
    }

    if (consecutiveTimeouts >= maxConsecutiveTimeouts) {
      console.error('[OpenHiNotes] Too many consecutive timeouts, aborting');
      throw new Error(`Download stalled at ${Math.round((received / fileSize) * 100)}% (${received}/${fileSize} bytes)`);
    }

    if (received === 0) {
      throw new Error('No data received from device');
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log('[OpenHiNotes] Download complete: received %d/%d bytes in %ds', received, fileSize, elapsed);

    // Detect the actual audio format from the first chunk
    const format = chunks.length > 0 ? detectAudioFormat(chunks[0]) : 'pcm';
    console.log('[OpenHiNotes] Detected audio format: %s (fileVersion=%d)', format, fileVersion ?? -1);

    if (format === 'wav') {
      // Already has a valid WAV header
      return new Blob(chunks, { type: 'audio/wav' });
    }

    if (format === 'mpeg') {
      // MPEG Layer 1/2 audio — browser can play this natively
      return new Blob(chunks, { type: 'audio/mpeg' });
    }

    // Raw PCM: prepend a WAV header so the browser can decode it
    const wavHeader = createWavHeader(received, fileVersion ?? 1);
    return new Blob([wavHeader, ...chunks], { type: 'audio/wav' });
  }

  async deleteFile(fileName: string): Promise<void> {
    const fileNameBytes = new TextEncoder().encode(fileName);
    const seqId = await this.sendCommand(COMMANDS.DELETE_FILE, fileNameBytes);
    await this.receiveResponse(seqId);
  }

  async formatStorage(): Promise<void> {
    const seqId = await this.sendCommand(COMMANDS.FORMAT_CARD);
    await this.receiveResponse(seqId, 60000);
  }

  async syncTime(): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new Uint8Array(4);
    writeU32BE(body, 0, timestamp);
    const seqId = await this.sendCommand(COMMANDS.SET_DEVICE_TIME, body);
    await this.receiveResponse(seqId);
  }

  getDeviceName(): string | null {
    return this.device?.productName ?? null;
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  /** Return a previously downloaded blob from cache, or undefined. */
  getCachedBlob(fileName: string): Blob | undefined {
    return this.blobCache.get(fileName);
  }

  /** Store a downloaded blob in the cache. */
  setCachedBlob(fileName: string, blob: Blob): void {
    this.blobCache.set(fileName, blob);
  }

  // ---- Protocol internals ----

  private async sendCommand(commandId: number, body?: Uint8Array): Promise<number> {
    if (!this.device) throw new Error('Device not connected');

    this.sequenceId = (this.sequenceId + 1) & 0xffffffff;
    const seqId = this.sequenceId;

    const bodyLen = body?.length ?? 0;
    const packet = new Uint8Array(12 + bodyLen);

    packet[0] = 0x12;
    packet[1] = 0x34;
    writeU16BE(packet, 2, commandId);
    writeU32BE(packet, 4, seqId);
    writeU32BE(packet, 8, bodyLen);

    if (body) packet.set(body, 12);

    await this.device.transferOut(ENDPOINT_OUT, packet);
    return seqId;
  }

  /**
   * Read raw USB data into the receive buffer.
   * Returns true if data was received, false on timeout/error.
   */
  private async readToBuffer(): Promise<boolean> {
    if (!this.device) return false;

    try {
      const result = await this.device.transferIn(ENDPOINT_IN, 65536);
      if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
        // Use slice() to create a copy — the underlying buffer may be reused by WebUSB
        const newData = new Uint8Array(
          result.data.buffer.slice(
            result.data.byteOffset,
            result.data.byteOffset + result.data.byteLength,
          ),
        );
        this.receiveBuffer.append(newData);
        return true;
      }
      return false;
    } catch (err) {
      // DOMException NetworkError = USB timeout (expected, device has no data yet)
      // DOMException InvalidStateError = device disconnected
      return false;
    }
  }

  private async receiveResponse(
    expectedSeqId: number,
    timeout = 10000,
    expectedCommandId?: number
  ): Promise<{ commandId: number; body: Uint8Array }> {
    if (!this.device) throw new Error('Device not connected');

    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      // Check buffer first before reading more data
      const pkt = this.tryParsePacket(expectedSeqId, expectedCommandId);
      if (pkt) {
        return pkt;
      }

      const gotData = await this.readToBuffer();
      if (!gotData) {
        // Small delay to prevent busy-waiting when device has no data
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    throw new Error(`Timeout waiting for resp (seq ${expectedSeqId}, cmd ${expectedCommandId})`);
  }

  private tryParsePacket(
    expectedSeqId: number,
    expectedCommandId?: number
  ): { commandId: number; body: Uint8Array } | null {
    const buf = this.receiveBuffer;

    while (buf.length >= 12) {
      // Find sync marker 0x12 0x34
      if (buf.byteAt(0) !== 0x12 || buf.byteAt(1) !== 0x34) {
        buf.consume(1);
        continue;
      }

      const commandId = (buf.byteAt(2) << 8) | buf.byteAt(3);
      const seqId =
        ((buf.byteAt(4) << 24) | (buf.byteAt(5) << 16) |
         (buf.byteAt(6) << 8)  |  buf.byteAt(7)) >>> 0;
      const lengthField =
        ((buf.byteAt(8) << 24) | (buf.byteAt(9) << 16) |
         (buf.byteAt(10) << 8) |  buf.byteAt(11)) >>> 0;

      const checksumLen = (lengthField >>> 24) & 0xff;
      const bodyLen = lengthField & 0x00ffffff;
      const totalLen = 12 + bodyLen + checksumLen;

      if (buf.length < totalLen) return null; // incomplete packet

      // Extract body and consume the packet atomically
      const body = buf.extractAndConsume(12, 12 + bodyLen, totalLen);

      // Only log non-streaming packets to avoid flooding console during downloads
      if (bodyLen < 100 || commandId === COMMANDS.GET_DEVICE_INFO || commandId === COMMANDS.GET_CARD_INFO) {
        console.debug('[OpenHiNotes] RECV pkt: cmd=%d, seq=%d, len=%d', commandId, seqId, bodyLen);
      }

      // Match logic: accept exact seqId match OR command match for streaming
      const isFileTransferCmd = (
        commandId === COMMANDS.TRANSFER_FILE || commandId === COMMANDS.GET_FILE_BLOCK
      );
      const expectedIsFileTransfer = (
        expectedCommandId === COMMANDS.TRANSFER_FILE || expectedCommandId === COMMANDS.GET_FILE_BLOCK
      );
      const isCmdMatch = expectedCommandId !== undefined && (
        commandId === expectedCommandId ||
        (expectedIsFileTransfer && isFileTransferCmd)
      );

      if (seqId === expectedSeqId || isCmdMatch) {
        return { commandId, body };
      }

      console.log('[OpenHiNotes] Discarding non-matching packet: cmd=%d, seq=%d (expected seq=%d, cmd=%s)',
          commandId, seqId, expectedSeqId, expectedCommandId);
    }
    return null;
  }

  private async receiveStreamingFileList(
    seqId: number,
    onProgress?: (files: AudioRecording[]) => void
  ): Promise<AudioRecording[]> {
    const recordings: AudioRecording[] = [];
    let isHeaderProcessed = false;
    let fileDataBuffer = new Uint8Array(0);

    let totalOnDevice = 0;

    // Timeout after 15 seconds if no files received
    const deadline = Date.now() + 15000;

    while (Date.now() < deadline) {
      try {
        const { body } = await this.receiveResponse(seqId, 2000, COMMANDS.GET_FILE_LIST);

        if (body.length > 0) {
          // Accumulate into buffer to handle records splitting across packets
          const combined = new Uint8Array(fileDataBuffer.length + body.length);
          combined.set(fileDataBuffer);
          combined.set(body, fileDataBuffer.length);
          fileDataBuffer = combined;

          let offset = 0;

          // Check for 6-byte header: FF FF totalFiles(4)
          if (!isHeaderProcessed && fileDataBuffer.length >= 6 && fileDataBuffer[0] === 0xff && fileDataBuffer[1] === 0xff) {
            totalOnDevice = readU32BE(fileDataBuffer, 2);
            console.log('[OpenHiNotes] Device reports total files:', totalOnDevice);
            offset = 6;
            isHeaderProcessed = true;
          }

          const currentBatch: AudioRecording[] = [];
          while (offset < fileDataBuffer.length) {
            const result = parseFileRecord(fileDataBuffer, offset, recordings.length === 0);
            if (!result) break; // Incomplete record, wait for more packets

            recordings.push(result.recording);
            currentBatch.push(result.recording);
            offset += result.bytesRead;
          }

          // Discard processed data
          if (offset > 0) {
            fileDataBuffer = fileDataBuffer.slice(offset);
          }

          if (currentBatch.length > 0 && onProgress) {
            onProgress([...currentBatch]);
          }

          // If we've reached the target count, we're done!
          if (totalOnDevice > 0 && recordings.length >= totalOnDevice) {
            console.log('[OpenHiNotes] Fetch complete: reached target of %d files', totalOnDevice);
            break;
          }
        } else {
           // Body length 0 often means finished
           if (recordings.length > 0) break;
        }
      } catch (error) {
        if (recordings.length > 0) break; // If we have some, assume done
        throw error;
      }

      await new Promise(r => setTimeout(r, 10));
    }

    if (fileDataBuffer.length > 0) {
      console.warn('[OpenHiNotes] Unparsed file data remaining (%d bytes):', fileDataBuffer.length,
        Array.from(fileDataBuffer.slice(0, 40)).map(b => (b as number).toString(16).padStart(2, '0')).join(' '));
    }

    // Sort by date, newest first
    recordings.sort((a, b) => b.dateCreated.getTime() - a.dateCreated.getTime());
    return recordings;
  }
}

export const deviceService = new DeviceService();
