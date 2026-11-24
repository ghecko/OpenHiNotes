import { apiClient } from './client';
import { KnownDevice } from '@/types';

export const devicesApi = {
  /** The HiDocks this user has connected, with the files each held when last seen. */
  async list(): Promise<KnownDevice[]> {
    return apiClient.get<KnownDevice[]>('/devices');
  },

  /** Name a device (empty = back to the model name). Returns the updated list. */
  async rename(serial: string, name: string, model?: string | null): Promise<KnownDevice[]> {
    return apiClient.patch<KnownDevice[]>(`/devices/${encodeURIComponent(serial)}`, { name, model: model ?? null });
  },

  /**
   * Record the file list a connected device just returned. The server also
   * marks this device as the origin of the user's transcriptions that had none
   * and whose source file is in the list.
   */
  async reportFiles(
    serial: string,
    model: string | null,
    filenames: string[],
  ): Promise<{ devices: KnownDevice[]; claimed: number }> {
    return apiClient.put<{ devices: KnownDevice[]; claimed: number }>(
      `/devices/${encodeURIComponent(serial)}/files`,
      { model, filenames },
    );
  },
};
