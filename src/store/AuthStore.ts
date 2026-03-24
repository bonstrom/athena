import { create } from "zustand";
import { useNavigate } from "react-router-dom";

interface AuthState {
  openAiKey: string;
  deepSeekKey: string;
  googleApiKey: string;
  moonshotApiKey: string;
  userName: string;
  backupInterval: number;
  customInstructions: string;
  clearAuth: () => void;
  setOpenAiKey: (key: string) => void;
  setDeepSeekKey: (key: string) => void;
  setGoogleApiKey: (key: string) => void;
  setMoonshotApiKey: (key: string) => void;
  setUserName: (name: string) => void;
  setBackupInterval: (minutes: number) => void;
  setCustomInstructions: (instructions: string) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedOpenAiKey = localStorage.getItem("openAiKey") ?? "";
  const storedDeepSeekKey = localStorage.getItem("deepSeekKey") ?? "";
  const storedGoogleApiKey = localStorage.getItem("googleApiKey") ?? "";
  const storedMoonshotApiKey = localStorage.getItem("moonshotApiKey") ?? "";
  const userName = localStorage.getItem("userName") ?? "";
  const storedBackupInterval = Number(localStorage.getItem("backupInterval") ?? "1");
  const storedCustomInstructions = localStorage.getItem("customInstructions") ?? "";

  return {
    openAiKey: storedOpenAiKey,
    deepSeekKey: storedDeepSeekKey,
    googleApiKey: storedGoogleApiKey,
    moonshotApiKey: storedMoonshotApiKey,
    userName: userName,
    backupInterval: storedBackupInterval,
    customInstructions: storedCustomInstructions,
    clearAuth: (): void => {
      localStorage.removeItem("openAiKey");
      localStorage.removeItem("deepSeekKey");
      localStorage.removeItem("googleApiKey");
      localStorage.removeItem("moonshotApiKey");
      localStorage.removeItem("userName");
      localStorage.removeItem("customInstructions");
      set({
        openAiKey: "",
        deepSeekKey: "",
        googleApiKey: "",
        moonshotApiKey: "",
        userName: undefined,
        customInstructions: "",
      });
    },
    setOpenAiKey: (key: string): void => {
      localStorage.setItem("openAiKey", key);
      set({ openAiKey: key });
    },
    setDeepSeekKey: (key: string): void => {
      localStorage.setItem("deepSeekKey", key);
      set({ deepSeekKey: key });
    },
    setGoogleApiKey: (key: string): void => {
      localStorage.setItem("googleApiKey", key);
      set({ googleApiKey: key });
    },
    setMoonshotApiKey: (key: string): void => {
      localStorage.setItem("moonshotApiKey", key);
      set({ moonshotApiKey: key });
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
