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

function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
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
      dateCreated: new Date(),
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
  private receiveBuffer = new Uint8Array(0);
  private connectingPromise: Promise<HiDockDevice> | null = null;

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
        this.receiveBuffer = new Uint8Array(0);

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
      this.receiveBuffer = new Uint8Array(0);
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
  ): Promise<Blob> {
    const fileNameBytes = new TextEncoder().encode(fileName);
    
    // Command body: [0..3] totalSize (BE), [4..] fileName
    const body = new Uint8Array(4 + fileNameBytes.length);
    writeU32BE(body, 0, fileSize);
    body.set(fileNameBytes, 4);

    console.log('[OpenHiNotes] Starting stream download for %s (%d bytes)', fileName, fileSize);

    const seqId = await this.sendCommand(COMMANDS.GET_FILE_BLOCK, body);
    const chunks: Uint8Array[] = [];
    let received = 0;
    const startTime = Date.now();
    const timeout = 60000; // 1 minute per file

    while (received < fileSize && (Date.now() - startTime < timeout)) {
      try {
        const response = await this.receiveResponse(seqId, 5000, COMMANDS.GET_FILE_BLOCK);
        if (response.body.length === 0) break;

        chunks.push(new Uint8Array(response.body));
        received += response.body.length;

        if (onProgress && fileSize > 0) {
          onProgress(Math.min(100, Math.round((received / fileSize) * 100)));
        }
      } catch (err) {
        // If we timeout but have almost everything, some devices don't send the last bit of padding
        if (received > 0 && received >= fileSize - 1024) break; 
        throw err;
      }
    }

    console.log('[OpenHiNotes] Download complete: received %d bytes', received);

    // .hda files usually have a 44-byte WAV header at the start
    return new Blob(chunks, { type: 'audio/wav' });
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

  private async receiveResponse(
    expectedSeqId: number,
    timeout = 10000,
    expectedCommandId?: number
  ): Promise<{ commandId: number; body: Uint8Array }> {
    if (!this.device) throw new Error('Device not connected');

    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      // Small read to feel out the pipe
      const result = await this.device.transferIn(ENDPOINT_IN, 65536);
      if (result.status === 'ok' && result.data) {
        this.receiveBuffer = concatBuffers(
          this.receiveBuffer,
          new Uint8Array(result.data.buffer),
        );
      }

      // Try to extract a complete packet
      const pkt = this.tryParsePacket(expectedSeqId, expectedCommandId);
      if (pkt) {
        return pkt;
      }

      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timeout waiting for response to seq ${expectedSeqId}`);
  }

  private tryParsePacket(
    expectedSeqId: number,
    expectedCommandId?: number
  ): { commandId: number; body: Uint8Array } | null {
    while (this.receiveBuffer.length >= 12) {
      // Find sync bytes
      if (this.receiveBuffer[0] !== 0x12 || this.receiveBuffer[1] !== 0x34) {
        // Skip one byte and retry
        this.receiveBuffer = this.receiveBuffer.slice(1);
        continue;
      }

      const commandId = readU16BE(this.receiveBuffer, 2);
      const seqId = readU32BE(this.receiveBuffer, 4);
      const lengthField = readU32BE(this.receiveBuffer, 8);

      const checksumLen = (lengthField >>> 24) & 0xff;
      const bodyLen = lengthField & 0x00ffffff;
      const totalLen = 12 + bodyLen + checksumLen;

      if (this.receiveBuffer.length < totalLen) return null; // need more data

      const body = this.receiveBuffer.slice(12, 12 + bodyLen);
      this.receiveBuffer = this.receiveBuffer.slice(totalLen);

      // In streaming mode, some packets might have seqId 0 or the commandId we expect
      if (seqId === expectedSeqId || (expectedCommandId !== undefined && commandId === expectedCommandId)) {
        return { commandId, body };
      }
      // Non-matching seqId — discard and keep looking
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

    return recordings;
  }
}

export const deviceService = new DeviceService();
