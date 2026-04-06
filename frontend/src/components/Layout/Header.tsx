import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, Settings } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { QueueIndicator } from '@/components/QueuePanel';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, setTheme, device } = useAppStore();
  const deviceConnected = device?.connected ?? false;
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  return (
    <div className="relative z-40 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-700/40 px-6 py-4 flex items-center justify-between shadow-sm shadow-gray-200/50 dark:shadow-gray-900/50">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Device connected badge */}
        {deviceConnected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200/60 dark:border-green-700/40 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs font-medium text-green-700 dark:text-green-300">Device Connected</span>
          </div>
        )}

        {/* Queue indicator */}
        <QueueIndicator />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="relative p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-xl transition-all duration-300 group"
          aria-label="Toggle theme"
        >
          <div className="relative w-5 h-5 overflow-hidden">
            {/* Sun icon */}
            <Sun
              className={`absolute inset-0 w-5 h-5 text-amber-500 transition-all duration-500 ease-in-out ${
                theme === 'dark'
                  ? 'rotate-0 scale-100 opacity-100'
                  : '-rotate-90 scale-0 opacity-0'
              }`}
            />
            {/* Moon icon */}
            <Moon
              className={`absolute inset-0 w-5 h-5 text-indigo-500 dark:text-indigo-400 transition-all duration-500 ease-in-out ${
                theme === 'light'
                  ? 'rotate-0 scale-100 opacity-100'
                  : 'rotate-90 scale-0 opacity-0'
              }`}
            />
          </div>
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 ${
              showUserMenu
                ? 'bg-gray-100 dark:bg-gray-700/60'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <span className="text-white text-xs font-semibold">
                {user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{user?.email}</span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl shadow-gray-200/50 dark:shadow-gray-900/50 border border-gray-200/60 dark:border-gray-700/40 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.display_name || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{user?.email}</p>
              </div>

              {/* Menu items */}
              <div className="py-1.5">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/settings');
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2.5 transition-colors duration-150"
                >
                  <Settings className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors duration-150"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}