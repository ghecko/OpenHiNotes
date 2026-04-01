import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';

// Auth Pages
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';

// Protected Pages
import { Dashboard } from '@/pages/Dashboard';
import { Recordings } from '@/pages/Recordings';
import { Upload as UploadPage } from '@/pages/Upload';
import { Transcriptions } from '@/pages/Transcriptions';
import { TranscriptionDetail } from '@/pages/TranscriptionDetail';
import { Collections } from '@/pages/Collections';
import { CollectionDetail } from '@/pages/CollectionDetail';
import { Chat } from '@/pages/Chat';
import { Settings } from '@/pages/Settings';
import { Templates } from '@/pages/admin/Templates';
import { Users } from '@/pages/admin/Users';
import { ApiSettings } from '@/pages/admin/ApiSettings';

// Components
import { ProtectedRoute } from '@/components/ProtectedRoute';

function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/recordings"
        element={
          <ProtectedRoute>
            <Recordings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <UploadPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/transcriptions"
        element={
          <ProtectedRoute>
            <Transcriptions />
          </ProtectedRoute>
        }
      />

      <Route
        path="/transcriptions/:id"
        element={
          <ProtectedRoute>
            <TranscriptionDetail />
          </ProtectedRoute>
        }
      />

      <Route
        path="/collections"
        element={
          <ProtectedRoute>
            <Collections />
          </ProtectedRoute>
        }
      />

      <Route
        path="/collections/:id"
        element={
          <ProtectedRoute>
            <CollectionDetail />
          </ProtectedRoute>
        }
      />

      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/templates"
        element={
          <ProtectedRoute adminOnly>
            <Templates />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute adminOnly>
            <Users />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute adminOnly>
            <ApiSettings />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
