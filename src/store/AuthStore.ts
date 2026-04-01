import { create } from "zustand";
import { useNavigate } from "react-router-dom";
import { SecurityUtils } from "../utils/security";
import { PredefinedPrompt, athenaDb } from "../database/AthenaDb";

interface AuthState {
  openAiKey: string;
  deepSeekKey: string;
  googleApiKey: string;
  moonshotApiKey: string;
  userName: string;
  backupInterval: number;
  customInstructions: string;
  chatWidth: "sm" | "md" | "lg" | "full";
  chatFontSize: number;
  themeMode: "light" | "dark";
  colorTheme: string;
  predefinedPrompts: PredefinedPrompt[];
  llmSuggestionEnabled: boolean;
  llmModelSelected: "qwen-0.5b-chat" | "distilgpt2-q8";
  llmModelDownloadStatus: Record<string, "not_downloaded" | "downloading" | "downloaded" | undefined>;
  setLlmSuggestionEnabled: (enabled: boolean) => void;
  setLlmModelSelected: (model: "qwen-0.5b-chat" | "distilgpt2-q8") => void;
  setLlmModelDownloadStatus: (modelId: string, status: "not_downloaded" | "downloading" | "downloaded") => void;
  clearAuth: () => void;
  setOpenAiKey: (key: string) => void;
  setDeepSeekKey: (key: string) => void;
  setGoogleApiKey: (key: string) => void;
  setMoonshotApiKey: (key: string) => void;
  setUserName: (name: string) => void;
  setBackupInterval: (minutes: number) => void;
  setCustomInstructions: (instructions: string) => void;
  setChatWidth: (width: "sm" | "md" | "lg" | "full") => void;
  setChatFontSize: (size: number) => void;
  setThemeMode: (mode: "light" | "dark") => void;
  setColorTheme: (theme: string) => void;
  setPredefinedPrompts: (prompts: PredefinedPrompt[]) => void;
  addPredefinedPrompt: (prompt: PredefinedPrompt) => void;
  updatePredefinedPrompt: (prompt: PredefinedPrompt) => void;
  deletePredefinedPrompt: (id: string) => void;
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
  const storedChatFontSize = Number(localStorage.getItem("chatFontSize") ?? "16");
  const storedThemeMode = (localStorage.getItem("themeMode") as "light" | "dark" | null) ?? "dark";
  const storedColorTheme = localStorage.getItem("colorTheme") ?? "default";
  const storedLlmSuggestionEnabled = localStorage.getItem("llmSuggestionEnabled") === "true";
  const storedLlmModelSelected =
    (localStorage.getItem("llmModelSelected") as "qwen-0.5b-chat" | "distilgpt2-q8" | null) ?? "qwen-0.5b-chat";
  const storedLlmModelDownloadStatus = JSON.parse(localStorage.getItem("llmModelDownloadStatus") ?? "{}") as Record<
    string,
    "not_downloaded" | "downloading" | "downloaded" | undefined
  >;

  return {
    openAiKey: storedOpenAiKey,
    deepSeekKey: storedDeepSeekKey,
    googleApiKey: storedGoogleApiKey,
    moonshotApiKey: storedMoonshotApiKey,
    userName: userName,
    backupInterval: storedBackupInterval,
    customInstructions: storedCustomInstructions,
    chatWidth: storedChatWidth,
    chatFontSize: storedChatFontSize,
    themeMode: storedThemeMode,
    colorTheme: storedColorTheme,
    predefinedPrompts: [],
    llmSuggestionEnabled: storedLlmSuggestionEnabled,
    llmModelSelected: storedLlmModelSelected,
    llmModelDownloadStatus: storedLlmModelDownloadStatus,
    clearAuth: (): void => {
      localStorage.removeItem("openAiKey");
      localStorage.removeItem("deepSeekKey");
      localStorage.removeItem("googleApiKey");
      localStorage.removeItem("moonshotApiKey");
      localStorage.removeItem("userName");
      localStorage.removeItem("customInstructions");
      localStorage.removeItem("chatWidth");
      localStorage.removeItem("chatFontSize");
      void athenaDb.predefinedPrompts.clear();
      set({
        openAiKey: "",
        deepSeekKey: "",
        googleApiKey: "",
        moonshotApiKey: "",
        userName: undefined,
        customInstructions: "",
        chatWidth: "lg",
        chatFontSize: 16,
        themeMode: "dark",
        colorTheme: "default",
        predefinedPrompts: [],
        llmSuggestionEnabled: false,
        llmModelSelected: "qwen-0.5b-chat",
        llmModelDownloadStatus: {},
      });
    },
    setLlmSuggestionEnabled: (enabled: boolean): void => {
      localStorage.setItem("llmSuggestionEnabled", String(enabled));
      set({ llmSuggestionEnabled: enabled });
    },
    setLlmModelSelected: (model: "qwen-0.5b-chat" | "distilgpt2-q8"): void => {
      localStorage.setItem("llmModelSelected", model);
      set({ llmModelSelected: model });
    },
    setLlmModelDownloadStatus: (modelId: string, status: "not_downloaded" | "downloading" | "downloaded"): void => {
      set((state) => {
        const newStatus = { ...state.llmModelDownloadStatus, [modelId]: status };
        localStorage.setItem("llmModelDownloadStatus", JSON.stringify(newStatus));
        return { llmModelDownloadStatus: newStatus };
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
    setChatFontSize: (size: number): void => {
      localStorage.setItem("chatFontSize", String(size));
      set({ chatFontSize: size });
    },
    setThemeMode: (mode: "light" | "dark"): void => {
      localStorage.setItem("themeMode", mode);
      set({ themeMode: mode });
    },
    setColorTheme: (theme: string): void => {
      localStorage.setItem("colorTheme", theme);
      set({ colorTheme: theme });
    },
    setPredefinedPrompts: (predefinedPrompts: PredefinedPrompt[]): void => {
      set({ predefinedPrompts });
    },
    addPredefinedPrompt: (prompt: PredefinedPrompt): void => {
      set((state) => ({ predefinedPrompts: [...state.predefinedPrompts, prompt] }));
      void athenaDb.predefinedPrompts.add(prompt);
    },
    updatePredefinedPrompt: (prompt: PredefinedPrompt): void => {
      set((state) => ({
        predefinedPrompts: state.predefinedPrompts.map((p) => (p.id === prompt.id ? prompt : p)),
      }));
      void athenaDb.predefinedPrompts.put(prompt);
    },
    deletePredefinedPrompt: (id: string): void => {
      set((state) => ({
        predefinedPrompts: state.predefinedPrompts.filter((p) => p.id !== id),
      }));
      void athenaDb.predefinedPrompts.delete(id);
    },
  };
});

// Load predefined prompts from DB on init
void athenaDb.predefinedPrompts.toArray().then((prompts) => {
  useAuthStore.getState().setPredefinedPrompts(prompts);
});

export const useLogout = (): (() => void) => {
  const navigate = useNavigate();

  return (): void => {
    useAuthStore.getState().clearAuth();
    void navigate("/settings", { replace: true });
  };
};
