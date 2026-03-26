import { HashRouter, Routes, Route } from "react-router-dom";
import ChatLayout from "./components/ChatLayout";
import { GlobalErrorSnackbar } from "./components/GlobalErrorSnackbar";
import ChatView from "./pages/ChatView";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import { useAutoBackup } from "./hooks/useAutoBackup";
import { useAuthStore } from "./store/AuthStore";
import { ErrorBoundary } from "./components/ErrorBoundary";

const App: React.FC = () => {
  const { backupInterval } = useAuthStore();
  useAutoBackup(backupInterval); // Run auto-backup based on user preference

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route
            path="/"
            element={<ChatLayout />}>
            <Route
              path="home"
              index
              element={<Home />}
            />

            <Route
              path="settings"
              element={<Settings />}
            />

            <Route
              path="chat/:topicId"
              element={<ChatView />}
            />
          </Route>
        </Routes>

        <GlobalErrorSnackbar />
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
