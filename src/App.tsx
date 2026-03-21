import { HashRouter, Routes, Route } from "react-router-dom";
import ChatLayout from "./components/ChatLayout";
import { GlobalErrorSnackbar } from "./components/GlobalErrorSnackbar";
import ChatView from "./pages/ChatView";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

const App: React.FC = () => {
  return (
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
  );
};

export default App;
