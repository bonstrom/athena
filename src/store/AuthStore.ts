import { create } from "zustand";
import { useNavigate } from "react-router-dom";

interface AuthState {
  openAiKey: string;
  deepSeekKey: string;
  userName: string;
  backupInterval: number;
  customInstructions: string;
  clearAuth: () => void;
  setOpenAiKey: (key: string) => void;
  setDeepSeekKey: (key: string) => void;
  setUserName: (name: string) => void;
  setBackupInterval: (minutes: number) => void;
  setCustomInstructions: (instructions: string) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedOpenAiKey = localStorage.getItem("openAiKey") ?? "";
  const storedDeepSeekKey = localStorage.getItem("deepSeekKey") ?? "";
  const userName = localStorage.getItem("userName") ?? "";
  const storedBackupInterval = Number(localStorage.getItem("backupInterval") ?? "1");
  const storedCustomInstructions = localStorage.getItem("customInstructions") ?? "";

  return {
    openAiKey: storedOpenAiKey,
    deepSeekKey: storedDeepSeekKey,
    userName: userName,
    backupInterval: storedBackupInterval,
    customInstructions: storedCustomInstructions,
    clearAuth: (): void => {
      localStorage.removeItem("openAiKey");
      localStorage.removeItem("deepSeekKey");
      localStorage.removeItem("userName");
      localStorage.removeItem("customInstructions");
      set({ openAiKey: "", deepSeekKey: "", userName: undefined, customInstructions: "" });
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
    setBackupInterval: (minutes: number): void => {
      localStorage.setItem("backupInterval", String(minutes));
      set({ backupInterval: minutes });
    },
    setCustomInstructions: (instructions: string): void => {
      localStorage.setItem("customInstructions", instructions);
      set({ customInstructions: instructions });
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
