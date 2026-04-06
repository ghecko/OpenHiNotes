import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { User } from '@/types';
import { apiClient } from '@/api/client';
import { format } from 'date-fns';
import {
  Shield,
  User as UserIcon,
  Plus,
  X,
  Check,
  Ban,
  Clock,
  AlertCircle,
  Mail,
  Lock,
  Search,
} from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'pending' | 'rejected';

export function Users({ embedded }: { embedded?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadUsers();
    loadPendingCount();
  }, [statusFilter]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<User[]>(`/users?status=${statusFilter}`);
      setUsers(response);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingCount = async () => {
    try {
      const data = await apiClient.get<{ count: number }>('/users/pending-count');
      setPendingCount(data.count);
    } catch {
      // ignore
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await apiClient.patch(`/users/${userId}`, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole as any } : u))
      );
    } catch (error) {
      console.error('Failed to update user role:', error);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await apiClient.patch(`/users/${userId}`, { is_active: !currentActive });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: !currentActive } : u))
      );
    } catch (error) {
      console.error('Failed to update user status:', error);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await apiClient.post(`/users/${userId}/approve`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, status: 'active' as any, is_active: true } : u
        )
      );
      setPendingCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('Failed to approve user:', error);
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await apiClient.post(`/users/${userId}/reject`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, status: 'rejected' as any, is_active: false } : u
        )
      );
      setPendingCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('Failed to reject user:', error);
    }
  };

  const handleUserCreated = () => {
    setShowCreateModal(false);
    loadUsers();
  };

  const statusBadge = (user: User) => {
    if (user.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
    }
    if (user.status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          <Ban className="w-3 h-3" />
          Rejected
        </span>
      );
    }
    return (
      <span
        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
          user.is_active
            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}
      >
        {user.is_active ? 'Active' : 'Inactive'}
      </span>
    );
  };

  const filterTabs: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'rejected', label: 'Rejected' },
  ];

  const content = (
    <>
      <div className="space-y-4">
        {/* Header bar: filter + create */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Status filter tabs */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  statusFilter === tab.key
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-bold leading-none">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        </div>

        {/* Users table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              {statusFilter === 'pending'
                ? 'No pending registrations'
                : statusFilter === 'rejected'
                ? 'No rejected users'
                : 'No users found'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Display Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {user.display_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                              : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {user.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">{statusBadge(user)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="text-xs">
                          {user.registration_source === 'admin_created' ? 'Admin' : 'Self'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {format(new Date(user.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.status === 'pending' ? (
                            <>
                              <button
                                onClick={() => handleApprove(user.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors font-medium"
                                title="Approve"
                              >
                                <Check className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(user.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors font-medium"
                                title="Reject"
                              >
                                <Ban className="w-3 h-3" />
                                Reject
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleToggleRole(user.id, user.role)}
                                className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors font-medium"
                              >
                                Toggle Role
                              </button>
                              <button
                                onClick={() => handleToggleActive(user.id, user.is_active)}
                                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                                  user.is_active
                                    ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800'
                                    : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
                                }`}
                              >
                                {user.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleUserCreated}
        />
      )}
    </>
  );

  if (embedded) return content;
  return <Layout title="User Management">{content}</Layout>;
}

// ── Create User Modal ──────────────────────────────────────────────────

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('user');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post('/users', {
        email,
        password,
        display_name: displayName || undefined,
        role,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create User</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                placeholder="user@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Display Name
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                placeholder="Min. 8 characters"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Admin-created accounts bypass registration restrictions and are immediately active.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}