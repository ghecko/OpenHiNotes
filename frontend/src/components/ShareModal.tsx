import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Share2,
  Search,
  Users,
  User as UserIcon,
  Trash2,
} from 'lucide-react';
import { sharesApi } from '@/api/shares';
import { groupsApi } from '@/api/groups';
import { apiClient } from '@/api/client';
import type { ResourceShare, User, UserGroup } from '@/types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'transcription' | 'collection';
  resourceId: string;
  resourceName: string;
}

export function ShareModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}: ShareModalProps) {
  const [shares, setShares] = useState<ResourceShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [selectedPermission, setSelectedPermission] = useState<'read' | 'write'>('read');
  const [error, setError] = useState<string | null>(null);
  const [shareTab, setShareTab] = useState<'users' | 'groups'>('users');

  // IDs already shared with (to filter them out of suggestions)
  const sharedUserIds = new Set(
    shares.filter((s) => s.grantee_type === 'user').map((s) => s.grantee_id)
  );
  const sharedGroupIds = new Set(
    shares.filter((s) => s.grantee_type === 'group').map((s) => s.grantee_id)
  );

  const loadShares = useCallback(async () => {
    try {
      const data = await sharesApi.listForResource(resourceType, resourceId);
      setShares(data);
    } catch {
      // ignore
    }
  }, [resourceType, resourceId]);

  const loadGroups = useCallback(async () => {
    try {
      const data = await groupsApi.list();
      setGroups(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadShares();
      loadGroups();
      setSearchQuery('');
      setSearchResults([]);
      setError(null);
    }
  }, [isOpen, loadShares, loadGroups]);

  // Search users with debounce
  useEffect(() => {
    if (shareTab !== 'users' || !searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await apiClient.get<User[]>(
          `/users/search?q=${encodeURIComponent(searchQuery)}&limit=5`
        );
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, shareTab]);

  const handleShare = async (granteeType: 'user' | 'group', granteeId: string) => {
    setLoading(true);
    setError(null);
    try {
      await sharesApi.create({
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_type: granteeType,
        grantee_id: granteeId,
        permission: selectedPermission,
      });
      await loadShares();
      setSearchQuery('');
      setSearchResults([]);
    } catch (e: any) {
      setError(e.message || 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePermission = async (shareId: string, permission: 'read' | 'write') => {
    try {
      await sharesApi.update(shareId, permission);
      await loadShares();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await sharesApi.delete(shareId);
      await loadShares();
    } catch (e: any) {
      setError(e.message || 'Failed to revoke');
    }
  };

  // Filter groups not yet shared with
  const availableGroups = groups.filter((g) => !sharedGroupIds.has(g.id));
  const filteredGroups = searchQuery
    ? availableGroups.filter((g) =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableGroups;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Share {resourceType === 'transcription' ? 'Transcription' : 'Collection'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[280px]">
                {resourceName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Add people / groups section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Add people or groups
              </h3>
              <select
                value={selectedPermission}
                onChange={(e) => setSelectedPermission(e.target.value as 'read' | 'write')}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="read">Can view</option>
                <option value="write">Can edit</option>
              </select>
            </div>

            {/* Tab switcher: Users / Groups */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => { setShareTab('users'); setSearchQuery(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  shareTab === 'users'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-650'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                Users
              </button>
              <button
                onClick={() => { setShareTab('groups'); setSearchQuery(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  shareTab === 'groups'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-650'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Groups
                {groups.length > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    shareTab === 'groups'
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                  }`}>
                    {groups.length}
                  </span>
                )}
              </button>
            </div>

            {/* Users tab */}
            {shareTab === 'users' && (
              <div className="relative">
                <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                    autoFocus
                  />
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {searchResults.map((user) => {
                      const alreadyShared = sharedUserIds.has(user.id);
                      return (
                        <button
                          key={user.id}
                          onClick={() => !alreadyShared && handleShare('user', user.id)}
                          disabled={loading || alreadyShared}
                          className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
                            alreadyShared
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                            <UserIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {user.display_name || user.email}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {user.email}
                            </div>
                          </div>
                          {alreadyShared && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                              Already shared
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Groups tab */}
            {shareTab === 'groups' && (
              <div className="space-y-2">
                {/* Search groups */}
                {groups.length > 3 && (
                  <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Filter groups..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                    />
                  </div>
                )}

                {filteredGroups.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3">
                    {groups.length === 0
                      ? 'No groups available. Ask an admin to create one.'
                      : availableGroups.length === 0
                      ? 'All groups already have access.'
                      : 'No groups match your search.'}
                  </p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {filteredGroups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => handleShare('group', group.id)}
                        disabled={loading}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-left"
                      >
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {group.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                            {group.description && ` \u2022 ${group.description}`}
                          </div>
                        </div>
                        <span className="text-xs text-primary-500 dark:text-primary-400 font-medium flex-shrink-0">
                          + Add
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          {shares.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700" />
          )}

          {/* Current shares */}
          {shares.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Who has access ({shares.length})
              </h3>
              <div className="space-y-2">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          share.grantee_type === 'user'
                            ? 'bg-primary-100 dark:bg-primary-900/30'
                            : 'bg-blue-100 dark:bg-blue-900/30'
                        }`}
                      >
                        {share.grantee_type === 'user' ? (
                          <UserIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                        ) : (
                          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {share.grantee?.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {share.grantee_type === 'group' ? 'Group' : share.grantee?.email || ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={share.permission}
                        onChange={(e) =>
                          handleUpdatePermission(share.id, e.target.value as 'read' | 'write')
                        }
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <option value="read">Can view</option>
                        <option value="write">Can edit</option>
                      </select>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Revoke access"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
