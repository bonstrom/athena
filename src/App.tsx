import React, { Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import ChatLayout from './components/ChatLayout';
import { GlobalErrorSnackbar } from './components/GlobalErrorSnackbar';
import { useAutoBackup } from './hooks/useAutoBackup';
import { useAuthStore } from './store/AuthStore';
import { ErrorBoundary } from './components/ErrorBoundary';

const Home = React.lazy(() => import('./pages/Home'));
const Settings = React.lazy(() => import('./pages/Settings'));
const ChatView = React.lazy(() => import('./pages/ChatView'));

const App: React.FC = () => {
  const { backupInterval } = useAuthStore();
  useAutoBackup(backupInterval); // Run auto-backup based on user preference

  return (
    <ErrorBoundary>
      <HashRouter>
        <Suspense>
          <Routes>
            <Route path="/" element={<ChatLayout />}>
              <Route index element={<Home />} />

              <Route path="settings" element={<Settings />} />

              <Route path="chat/:topicId" element={<ChatView />} />
            </Route>
          </Routes>
        </Suspense>

        <GlobalErrorSnackbar />
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
