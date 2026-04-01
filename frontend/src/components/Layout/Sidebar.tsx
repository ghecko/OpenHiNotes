import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  HardDrive,
  Upload,
  FileText,
  FolderOpen,
  MessageSquare,
  Settings,
  Shield,
  Plug,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuthStore();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/recordings', label: 'Recordings', icon: HardDrive },
    { path: '/upload', label: 'Upload', icon: Upload },
    { path: '/transcriptions', label: 'Transcriptions', icon: FileText },
    { path: '/collections', label: 'Collections', icon: FolderOpen },
    { path: '/chat', label: 'Chat', icon: MessageSquare },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const adminItems = user?.role === 'admin' ? [
    { path: '/admin/templates', label: 'Templates', icon: FileText },
    { path: '/admin/users', label: 'Users', icon: Shield },
    { path: '/admin/settings', label: 'API Settings', icon: Plug },
  ] : [];

  return (
    <div
      className={`flex flex-col bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-r border-gray-200/60 dark:border-gray-700/40 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand / Logo area */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200/60 dark:border-gray-700/40">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-500/20">
              <span className="text-white font-bold text-sm">OH</span>
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary-600 to-primary-400 dark:from-primary-400 dark:to-primary-300 bg-clip-text text-transparent truncate">
              OpenHiNotes
            </h1>
          </div>
        ) : (
          <div className="mx-auto w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-500/20">
            <span className="text-white font-bold text-sm">OH</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${
            isCollapsed ? 'mx-auto mt-2' : ''
          }`}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                active
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {/* Active indicator bar */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary-500 dark:bg-primary-400" />
              )}
              <Icon
                className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  active ? 'text-primary-600 dark:text-primary-400' : ''
                }`}
              />
              {!isCollapsed && (
                <span className={`text-sm font-medium transition-colors duration-200 ${active ? 'font-semibold' : ''}`}>
                  {label}
                </span>
              )}
            </Link>
          );
        })}

        {/* Admin section */}
        {adminItems.length > 0 && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200/80 dark:border-gray-700/60" />
              </div>
              {!isCollapsed && (
                <div className="relative flex justify-start pl-3">
                  <span className="bg-white dark:bg-gray-800 pr-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Admin
                  </span>
                </div>
              )}
            </div>
            {adminItems.map(({ path, label, icon: Icon }) => {
              const active = isActive(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary-500 dark:bg-primary-400" />
                  )}
                  <Icon
                    className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                      active ? 'text-primary-600 dark:text-primary-400' : ''
                    }`}
                  />
                  {!isCollapsed && (
                    <span className={`text-sm font-medium transition-colors duration-200 ${active ? 'font-semibold' : ''}`}>
                      {label}
                    </span>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </div>
  );
}
