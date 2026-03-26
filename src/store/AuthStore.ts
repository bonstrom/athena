import { create } from "zustand";
import { useNavigate } from "react-router-dom";
import { SecurityUtils } from "../utils/security";

interface AuthState {
  openAiKey: string;
  deepSeekKey: string;
  googleApiKey: string;
  moonshotApiKey: string;
  userName: string;
  backupInterval: number;
  customInstructions: string;
  chatWidth: "sm" | "md" | "lg" | "full";
  clearAuth: () => void;
  setOpenAiKey: (key: string) => void;
  setDeepSeekKey: (key: string) => void;
  setGoogleApiKey: (key: string) => void;
  setMoonshotApiKey: (key: string) => void;
  setUserName: (name: string) => void;
  setBackupInterval: (minutes: number) => void;
  setCustomInstructions: (instructions: string) => void;
  setChatWidth: (width: "sm" | "md" | "lg" | "full") => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const storedOpenAiKey = SecurityUtils.decode(localStorage.getItem("openAiKey") ?? "");
  const storedDeepSeekKey = SecurityUtils.decode(localStorage.getItem("deepSeekKey") ?? "");
  const storedGoogleApiKey = SecurityUtils.decode(localStorage.getItem("googleApiKey") ?? "");
  const storedMoonshotApiKey = SecurityUtils.decode(localStorage.getItem("moonshotApiKey") ?? "");
  const userName = localStorage.getItem("userName") ?? "";
  const storedBackupInterval = Number(localStorage.getItem("backupInterval") ?? "30");
  const storedCustomInstructions = localStorage.getItem("customInstructions") ?? "";
  const storedChatWidth = (localStorage.getItem("chatWidth") as "sm" | "md" | "lg" | "full" | null) ?? "lg";

  return {
    openAiKey: storedOpenAiKey,
    deepSeekKey: storedDeepSeekKey,
    googleApiKey: storedGoogleApiKey,
    moonshotApiKey: storedMoonshotApiKey,
    userName: userName,
    backupInterval: storedBackupInterval,
    customInstructions: storedCustomInstructions,
    chatWidth: storedChatWidth,
    clearAuth: (): void => {
      localStorage.removeItem("openAiKey");
      localStorage.removeItem("deepSeekKey");
      localStorage.removeItem("googleApiKey");
      localStorage.removeItem("moonshotApiKey");
      localStorage.removeItem("userName");
      localStorage.removeItem("customInstructions");
      localStorage.removeItem("chatWidth");
      set({
        openAiKey: "",
        deepSeekKey: "",
        googleApiKey: "",
        moonshotApiKey: "",
        userName: undefined,
        customInstructions: "",
        chatWidth: "lg",
      });
    },
    setOpenAiKey: (key: string): void => {
      localStorage.setItem("openAiKey", SecurityUtils.encode(key));
      set({ openAiKey: key });
    },
    setDeepSeekKey: (key: string): void => {
      localStorage.setItem("deepSeekKey", SecurityUtils.encode(key));
      set({ deepSeekKey: key });
    },
    setGoogleApiKey: (key: string): void => {
      localStorage.setItem("googleApiKey", SecurityUtils.encode(key));
      set({ googleApiKey: key });
    },
    setMoonshotApiKey: (key: string): void => {
      localStorage.setItem("moonshotApiKey", SecurityUtils.encode(key));
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
    setChatWidth: (width: "sm" | "md" | "lg" | "full"): void => {
      localStorage.setItem("chatWidth", width);
      set({ chatWidth: width });
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
