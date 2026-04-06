import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { groupsApi } from '@/api/groups';
import { apiClient } from '@/api/client';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Search,
  UserPlus,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { UserGroup, UserGroupDetail, User } from '@/types';

export function Groups({ embedded }: { embedded?: boolean }) {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<UserGroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<User[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await groupsApi.list();
      setGroups(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const loadGroupDetail = async (groupId: string) => {
    try {
      const detail = await groupsApi.get(groupId);
      setExpandedGroup(detail);
    } catch {
      // ignore
    }
  };

  const toggleGroup = (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      setExpandedGroup(null);
    } else {
      setExpandedGroupId(groupId);
      loadGroupDetail(groupId);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await groupsApi.create({ name: newGroupName, description: newGroupDesc || undefined });
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
      await loadGroups();
    } catch {
      // ignore
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    try {
      await groupsApi.update(editingGroup.id, {
        name: newGroupName,
        description: newGroupDesc || undefined,
      });
      setEditingGroup(null);
      setNewGroupName('');
      setNewGroupDesc('');
      await loadGroups();
    } catch {
      // ignore
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await groupsApi.delete(groupId);
      if (expandedGroupId === groupId) {
        setExpandedGroupId(null);
        setExpandedGroup(null);
      }
      await loadGroups();
    } catch {
      // ignore
    }
  };

  const handleAddMember = async (groupId: string, userId: string) => {
    try {
      const updated = await groupsApi.addMember(groupId, userId);
      setExpandedGroup(updated);
      setShowAddMember(null);
      setMemberSearchQuery('');
      setMemberSearchResults([]);
      await loadGroups();
    } catch {
      // ignore
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      await groupsApi.removeMember(groupId, userId);
      await loadGroupDetail(groupId);
      await loadGroups();
    } catch {
      // ignore
    }
  };

  // Search users for adding to group
  useEffect(() => {
    if (!memberSearchQuery || memberSearchQuery.length < 2) {
      setMemberSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await apiClient.get<User[]>(
          `/users/search?q=${encodeURIComponent(memberSearchQuery)}&limit=5`
        );
        setMemberSearchResults(results);
      } catch {
        setMemberSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearchQuery]);

  const content = (
    <>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Groups</h1>
          </div>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setNewGroupName('');
              setNewGroupDesc('');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Group
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No groups yet. Create one to start organizing users.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Group header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedGroupId === group.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{group.name}</h3>
                      {group.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{group.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingGroup(group);
                        setNewGroupName(group.name);
                        setNewGroupDesc(group.description || '');
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGroup(group.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded: members */}
                {expandedGroupId === group.id && expandedGroup && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Members
                      </h4>
                      <button
                        onClick={() => {
                          setShowAddMember(group.id);
                          setMemberSearchQuery('');
                          setMemberSearchResults([]);
                        }}
                        className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        <UserPlus className="w-4 h-4" />
                        Add Member
                      </button>
                    </div>

                    {/* Add member search */}
                    {showAddMember === group.id && (
                      <div className="mb-3 relative">
                        <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700">
                          <Search className="w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search users..."
                            value={memberSearchQuery}
                            onChange={(e) => setMemberSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder-gray-400"
                            autoFocus
                          />
                          <button
                            onClick={() => setShowAddMember(null)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {memberSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                            {memberSearchResults.map((user) => (
                              <button
                                key={user.id}
                                onClick={() => handleAddMember(group.id, user.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-600 text-left text-sm"
                              >
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {user.display_name || user.email}
                                </span>
                                <span className="text-gray-400 text-xs">{user.email}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Members list */}
                    {expandedGroup.members.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No members yet</p>
                    ) : (
                      <div className="space-y-2">
                        {expandedGroup.members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                                <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                                  {(member.display_name || member.email).charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {member.display_name || member.email}
                                </span>
                                {member.display_name && (
                                  <span className="text-xs text-gray-400 ml-2">{member.email}</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveMember(group.id, member.id)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create / Edit Group Modal */}
        {(showCreateModal || editingGroup) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {editingGroup ? 'Edit Group' : 'New Group'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Engineering Team"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="What is this group for?"
                    rows={2}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingGroup(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
                >
                  {editingGroup ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return content;
  return <Layout title="User Groups">{content}</Layout>;
}