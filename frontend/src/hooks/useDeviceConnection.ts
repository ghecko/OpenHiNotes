import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { deviceService } from '@/services/deviceService';
import { AudioRecording } from '@/types';

export function useDeviceConnection() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { setDevice, setRecordings, device } = useAppStore();
  const isInitializing = useRef(false);

  useEffect(() => {
    const initializeDevice = async () => {
      if (isInitializing.current || device?.connected) return;
      if (localStorage.getItem('device_connected') === 'true') {
        isInitializing.current = true;
        try {
          const devices = await navigator.usb.getDevices();
          if (devices.length > 0) {
            const hiDockDevice = await deviceService.connectDevice(devices[0]);
            setDevice(hiDockDevice);
          }
        } catch (err) {
          console.error('Failed to reconnect to device:', err);
        } finally {
          isInitializing.current = false;
        }
      }
    };

    initializeDevice();
  }, [setDevice]);

  const connectDevice = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const usbDevice = await deviceService.requestDevice();
      const hiDockDevice = await deviceService.connectDevice(usbDevice);
      setDevice(hiDockDevice);
      localStorage.setItem('device_connected', 'true');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect device';
      setError(message);
      console.error('Connection error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setDevice]);

  const disconnectDevice = useCallback(async () => {
    try {
      await deviceService.disconnectDevice();
      setDevice(null);
      localStorage.removeItem('device_connected');
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect device';
      setError(message);
    }
  }, [setDevice]);

  const refreshRecordings = useCallback(async () => {
    if (!deviceService.isConnected()) {
      setError('Device not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const recordings = await deviceService.getFileList();
      setRecordings(recordings);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh recordings';
      setError(message);
      console.error('Refresh error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setRecordings]);

  const downloadRecording = useCallback(
    async (fileName: string, fileSize: number, onProgress?: (percent: number) => void, fileVersion?: number) => {
      if (!deviceService.isConnected()) {
        setError('Device not connected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const blob = await deviceService.downloadFile(fileName, fileSize, onProgress, fileVersion);
        return blob;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to download recording';
        setError(message);
        console.error('Download error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const deleteRecording = useCallback(async (fileName: string) => {
    if (!deviceService.isConnected()) {
      setError('Device not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deviceService.deleteFile(fileName);
      await refreshRecordings();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete recording';
      setError(message);
      console.error('Delete error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshRecordings]);

  const formatDevice = useCallback(async () => {
    if (!deviceService.isConnected()) {
      setError('Device not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deviceService.formatStorage();
      setRecordings([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to format device';
      setError(message);
      console.error('Format error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setRecordings]);

  const syncTime = useCallback(async () => {
    if (!deviceService.isConnected()) {
      setError('Device not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deviceService.syncTime();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync time';
      setError(message);
      console.error('Sync error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    connectDevice,
    disconnectDevice,
    refreshRecordings,
    downloadRecording,
    deleteRecording,
    formatDevice,
    syncTime,
    isLoading,
    error,
    device,
  };
}
