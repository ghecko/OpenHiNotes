import { HardDrive, Laptop, Unplug, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { AudioLocation } from '@/utils/audioLocation';
import { parseServerDate } from '@/utils/dates';

const NEUTRAL = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300 flex-shrink-0';

/** Where a transcription's audio comes from: the HiDock it is on, an upload, or gone. */
export function AudioLocationBadge({ location }: { location: AudioLocation }) {
  if (location.kind === 'upload') {
    return (
      <span className={NEUTRAL} title="Uploaded file, not a device recording">
        <Upload className="w-3 h-3" />
        Upload
      </span>
    );
  }
  if (location.kind === 'recording') {
    return (
      <span className={NEUTRAL} title="Recorded in the browser, not a device recording">
        <Laptop className="w-3 h-3" />
        Browser
      </span>
    );
  }
  if (location.kind === 'on_device') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex-shrink-0"
        title={`Source recording is on ${location.device}, which is connected`}
      >
        <HardDrive className="w-3 h-3" />
        {location.device.replace(/^HiDock /, '')}
      </span>
    );
  }
  if (location.kind === 'orphan') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0"
        title={location.device
          ? `Source recording is no longer on ${location.device}`
          : 'Source recording is not on any of your devices'}
      >
        <Unplug className="w-3 h-3" />
        Orphan
      </span>
    );
  }
  if (location.kind === 'other_device') {
    const seen = location.seenAt ? parseServerDate(location.seenAt) : null;
    const when = seen && !Number.isNaN(seen.getTime()) ? `, last seen there ${format(seen, 'PP')}` : '';
    return (
      <span className={NEUTRAL} title={`Source recording is on ${location.device}, which is not connected${when}`}>
        <HardDrive className="w-3 h-3" />
        {location.device.replace(/^HiDock /, '')}
      </span>
    );
  }
  return null;
}
