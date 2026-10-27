import { X } from 'lucide-react';
import { Collection } from '@/types';

interface CollectionBadgeProps {
  collection: Pick<Collection, 'id' | 'name' | 'color'>;
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
}

/** Colored pill naming a collection; optionally clickable and removable. */
export function CollectionBadge({ collection, onClick, onRemove, title }: CollectionBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-[12rem] px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: collection.color || '#9ca3af' }} />
      {onClick ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="truncate hover:underline"
          title={title}
        >
          {collection.name}
        </button>
      ) : (
        <span className="truncate" title={title}>{collection.name}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="-mr-0.5 text-gray-400 hover:text-red-500"
          title={`Remove from “${collection.name}”`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/** Collections of `ids` the user knows about (others' private collections are skipped). */
export function knownCollections<T extends Pick<Collection, 'id'>>(ids: string[] | undefined, byId: Map<string, T>): T[] {
  return (ids || []).map((id) => byId.get(id)).filter((c): c is T => !!c);
}
