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
//   [2 .. 2+N-1]  filename  (ASCII)
//   [2+N .. 5+N]  fileSize  (uint32 BE)
//   [6+N .. 11+N] reserved  (6 bytes — timestamps / flags)
//   [12+N .. 27+N] signature (16 bytes)
//   Total per record = 28 + filenameLen

const FILE_RECORD_OVERHEAD = 28; // 1 + 1 + 4 + 6 + 16

function parseFileRecord(
  data: Uint8Array,
  offset: number,
): { recording: AudioRecording; bytesRead: number } | null {
  // Need at least the version + length byte
  if (offset + 2 > data.length) return null;

  const version = data[offset];
  const filenameLen = data[offset + 1];

  const recordLen = FILE_RECORD_OVERHEAD + filenameLen;
  if (offset + recordLen > data.length) return null; // incomplete record
  if (filenameLen === 0) return null; // bad record

  const filenameStart = offset + 2;
  const fileName = new TextDecoder('ascii').decode(
    data.slice(filenameStart, filenameStart + filenameLen),
  );

  const sizeOffset = filenameStart + filenameLen;
  const size = readU32BE(data, sizeOffset);

  // Duration estimate based on raw PCM sample rate
  const duration =
    version === 2 ? size / 32000 : size / 16000;

  const sigOffset = sizeOffset + 4 + 6;
  const signature = data.slice(sigOffset, sigOffset + 16);

  return {
    recording: {
      id: fileName,
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
    try {
      this.device = device;
      this.sequenceId = 0;
      this.receiveBuffer = new Uint8Array(0);

      await device.open();
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
    }
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

    // Log raw bytes so we can debug the format
    console.log('[OpenHiNotes] GET_CARD_INFO raw (%d bytes):', body.length,
      Array.from(body.slice(0, Math.min(body.length, 40))).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // The response format may vary by firmware. Try the most common layout:
    // 8 bytes totalSpace (uint64 BE) + 8 bytes usedSpace (uint64 BE) + 4 bytes fileCount (uint32 BE)
    if (body.length >= 20) {
      const totalSpace = readU64BE(body, 0);
      const usedSpace = readU64BE(body, 8);
      const fileCount = readU32BE(body, 16);
      return { totalSpace, usedSpace, freeSpace: totalSpace - usedSpace, fileCount };
    }

    // Fallback: 4-byte fields
    if (body.length >= 12) {
      const totalSpace = readU32BE(body, 0);
      const usedSpace = readU32BE(body, 4);
      const fileCount = readU32BE(body, 8);
      return { totalSpace, usedSpace, freeSpace: totalSpace - usedSpace, fileCount };
    }

    console.warn('[OpenHiNotes] Unexpected GET_CARD_INFO body length:', body.length);
    return { totalSpace: 0, usedSpace: 0, freeSpace: 0, fileCount: 0 };
  }

  async getFileList(onProgress?: (files: AudioRecording[]) => void): Promise<AudioRecording[]> {
    const seqId = await this.sendCommand(COMMANDS.GET_FILE_LIST);
    return this.receiveStreamingFileList(seqId, onProgress);
  }

  async downloadFile(
    fileName: string,
    fileSize: number,
    onProgress?: (percent: number) => void,
  ): Promise<Blob> {
    const fileNameBytes = new TextEncoder().encode(fileName);
    const chunks: Uint8Array[] = [];
    const BLOCK_SIZE = 32768;
    let offset = 0;

    while (true) {
      const body = new Uint8Array(fileNameBytes.length + 8);
      body.set(fileNameBytes, 0);
      writeU32BE(body, fileNameBytes.length, offset);
      writeU32BE(body, fileNameBytes.length + 4, BLOCK_SIZE);

      const seqId = await this.sendCommand(COMMANDS.GET_FILE_BLOCK, body);
      const response = await this.receiveResponse(seqId, 30000);

      if (response.body.length === 0) break;

      chunks.push(new Uint8Array(response.body));
      offset += response.body.length;

      if (onProgress && fileSize > 0) {
        onProgress(Math.min(100, Math.round((offset / fileSize) * 100)));
      }

      if (response.body.length < BLOCK_SIZE) break;
    }

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
  ): Promise<{ commandId: number; body: Uint8Array }> {
    if (!this.device) throw new Error('Device not connected');

    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const result = await this.device.transferIn(ENDPOINT_IN, 65536);
        if (result.status === 'ok' && result.data) {
          this.receiveBuffer = concatBuffers(
            this.receiveBuffer,
            new Uint8Array(result.data.buffer),
          );
        }
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('Timeout')) throw err;
      }

      // Try to extract a complete packet
      const pkt = this.tryParsePacket(expectedSeqId);
      if (pkt) return pkt;

      await new Promise((r) => setTimeout(r, 10));
    }

    throw new Error(`Timeout waiting for response (seq: ${expectedSeqId})`);
  }

  /**
   * Try to parse one packet matching `expectedSeqId` from receiveBuffer.
   * Returns null if buffer doesn't contain a complete matching packet yet.
   */
  private tryParsePacket(
    expectedSeqId: number,
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

      if (seqId === expectedSeqId) {
        return { commandId, body };
      }
      // Non-matching seqId — discard and keep looking
    }
    return null;
  }

  private async receiveStreamingFileList(
    expectedSeqId: number,
    onProgress?: (files: AudioRecording[]) => void,
  ): Promise<AudioRecording[]> {
    if (!this.device) throw new Error('Device not connected');

    const recordings: AudioRecording[] = [];
    let fileDataBuffer = new Uint8Array(0); // accumulates file-record body data across packets
    const deadline = Date.now() + 30000;
    let emptyPackets = 0;

    while (Date.now() < deadline) {
      // Read USB data
      try {
        const result = await this.device.transferIn(ENDPOINT_IN, 65536);
        if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
          this.receiveBuffer = concatBuffers(
            this.receiveBuffer,
            new Uint8Array(result.data.buffer),
          );
          emptyPackets = 0;
        } else {
          emptyPackets++;
        }
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('Timeout')) {
          if (recordings.length > 0) return recordings;
          throw err;
        }
        emptyPackets++;
      }

      // Extract all complete protocol packets from receiveBuffer
      let gotNewData = false;
      while (this.receiveBuffer.length >= 12) {
        if (this.receiveBuffer[0] !== 0x12 || this.receiveBuffer[1] !== 0x34) {
          this.receiveBuffer = this.receiveBuffer.slice(1);
          continue;
        }

        const lengthField = readU32BE(this.receiveBuffer, 8);
        const checksumLen = (lengthField >>> 24) & 0xff;
        const bodyLen = lengthField & 0x00ffffff;
        const totalLen = 12 + bodyLen + checksumLen;

        if (this.receiveBuffer.length < totalLen) break; // wait for more

        const seqId = readU32BE(this.receiveBuffer, 4);
        const body = this.receiveBuffer.slice(12, 12 + bodyLen);
        this.receiveBuffer = this.receiveBuffer.slice(totalLen);

        // Accept packets that match our seq or have seq 0 (broadcast / streaming)
        if (seqId === expectedSeqId || seqId === 0) {
          if (bodyLen === 0) {
            // Empty body = end-of-stream marker
            return recordings;
          }
          fileDataBuffer = concatBuffers(fileDataBuffer, body);
          gotNewData = true;
        }
      }

      // Parse file records from accumulated body data
      if (gotNewData) {
        let offset = 0;
        while (offset < fileDataBuffer.length) {
          const result = parseFileRecord(fileDataBuffer, offset);
          if (!result) break; // incomplete record, wait for more data
          recordings.push(result.recording);
          offset += result.bytesRead;
        }
        // Keep any leftover bytes for next round
        fileDataBuffer = fileDataBuffer.slice(offset);

        if (onProgress && recordings.length > 0) {
          onProgress([...recordings]);
        }
      }

      // If we got several consecutive empty reads and already have recordings, we're done
      if (emptyPackets >= 3 && recordings.length > 0) {
        return recordings;
      }

      await new Promise((r) => setTimeout(r, 10));
    }

    // Log what we have for debugging
    if (fileDataBuffer.length > 0) {
      console.warn('[OpenHiNotes] Unparsed file data remaining (%d bytes):',
        fileDataBuffer.length,
        Array.from(fileDataBuffer.slice(0, 40)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }

    return recordings;
  }
}

export const deviceService = new DeviceService();
