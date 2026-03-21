import { create } from "zustand";
import { useNavigate } from "react-router-dom";

interface AuthState {
  openAiKey: string;
  deepSeekKey: string;
  userName: string;
  clearAuth: () => void;
  setOpenAiKey: (key: string) => void;
  setDeepSeekKey: (key: string) => void;
  setUserName: (name: string) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedOpenAiKey = localStorage.getItem("openAiKey") ?? "";
  const storedDeepSeekKey = localStorage.getItem("deepSeekKey") ?? "";
  const userName = localStorage.getItem("userName") ?? "";

  return {
    openAiKey: storedOpenAiKey,
    deepSeekKey: storedDeepSeekKey,
    userName: userName,
    clearAuth: (): void => {
      localStorage.removeItem("openAiKey");
      localStorage.removeItem("deepSeekKey");
      localStorage.removeItem("userName");
      set({ openAiKey: "", deepSeekKey: "", userName: undefined });
    },
    setOpenAiKey: (key: string): void => {
      localStorage.setItem("openAiKey", key);
      set({ openAiKey: key });
    },
    setDeepSeekKey: (key: string): void => {
      localStorage.setItem("deepSeekKey", key);
      set({ deepSeekKey: key });
    },
    setUserName: (userName: string): void => {
      localStorage.setItem("userName", userName);
      set({ userName });
    },
  };
});

export const useLogout = (): (() => void) => {
  const navigate = useNavigate();

  return (): void => {
    useAuthStore.getState().clearAuth();
    void navigate("/settings", { replace: true });
  };
};
