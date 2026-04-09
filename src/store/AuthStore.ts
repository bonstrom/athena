import { create } from "zustand";
import { useNavigate } from "react-router-dom";
import { SecurityUtils } from "../utils/security";
import { PredefinedPrompt, athenaDb } from "../database/AthenaDb";
import { DEFAULT_SCRATCHPAD_RULES } from "../constants";

interface AuthState {
  openAiKey: string;
  deepSeekKey: string;
  googleApiKey: string;
  moonshotApiKey: string;
  userName: string;
  backupInterval: number;
  customInstructions: string;
  scratchpadRules: string;
  chatWidth: "sm" | "md" | "lg" | "xl" | "full";
  chatFontSize: number;
  themeMode: "light" | "dark";
  colorTheme: string;
  predefinedPrompts: PredefinedPrompt[];
  llmSuggestionEnabled: boolean;
  replyPredictionEnabled: boolean;
  replyPredictionModel: string;
  llmModelSelected: "qwen3.5-0.8b" | "qwen3.5-2b";
  llmModelDownloadStatus: Record<string, "not_downloaded" | "downloading" | "downloaded" | undefined>;
  topicPreloadCount: number;
  messageTruncateChars: number;
  ragEnabled: boolean;
  maxContextTokens: number;
  messageRetrievalEnabled: boolean;
  defaultMaxContextMessages: number;
  setDefaultMaxContextMessages: (count: number) => void;
  setRagEnabled: (enabled: boolean) => void;
  setMaxContextTokens: (tokens: number) => void;
  setMessageRetrievalEnabled: (enabled: boolean) => void;
  setLlmSuggestionEnabled: (enabled: boolean) => void;
  setReplyPredictionEnabled: (enabled: boolean) => void;
  setReplyPredictionModel: (model: string) => void;
  setLlmModelSelected: (model: "qwen3.5-0.8b" | "qwen3.5-2b") => void;
  setLlmModelDownloadStatus: (modelId: string, status: "not_downloaded" | "downloading" | "downloaded") => void;
  setTopicPreloadCount: (count: number) => void;
  setMessageTruncateChars: (chars: number) => void;
  clearAuth: () => void;
  setOpenAiKey: (key: string) => void;
  setDeepSeekKey: (key: string) => void;
  setGoogleApiKey: (key: string) => void;
  setMoonshotApiKey: (key: string) => void;
  setUserName: (name: string) => void;
  setBackupInterval: (minutes: number) => void;
  setCustomInstructions: (instructions: string) => void;
  setScratchpadRules: (rules: string) => void;
  setChatWidth: (width: "sm" | "md" | "lg" | "xl" | "full") => void;
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const storedScratchpadRules = localStorage.getItem("scratchpadRules") ?? DEFAULT_SCRATCHPAD_RULES;
  const storedChatWidth = (localStorage.getItem("chatWidth") as "sm" | "md" | "lg" | "full" | null) ?? "lg";
  const storedChatFontSize = Number(localStorage.getItem("chatFontSize") ?? "16");
  const storedThemeMode = (localStorage.getItem("themeMode") as "light" | "dark" | null) ?? "dark";
  const storedColorTheme = localStorage.getItem("colorTheme") ?? "default";
  const storedLlmSuggestionEnabled = localStorage.getItem("llmSuggestionEnabled") === "true";
  const storedReplyPredictionEnabled = localStorage.getItem("replyPredictionEnabled") === "true";
  const storedReplyPredictionModel = localStorage.getItem("replyPredictionModel") ?? "same";
  const storedLlmModelSelected =
    (localStorage.getItem("llmModelSelected") as "qwen3.5-0.8b" | "qwen3.5-2b" | null) ?? "qwen3.5-0.8b";
  const storedLlmModelDownloadStatus = JSON.parse(localStorage.getItem("llmModelDownloadStatus") ?? "{}") as Record<
    string,
    "not_downloaded" | "downloading" | "downloaded" | undefined
  >;
  const storedTopicPreloadCount = Number(localStorage.getItem("topicPreloadCount") ?? "5");
  const storedMessageTruncateChars = Number(localStorage.getItem("messageTruncateChars") ?? "500");
  const storedRagEnabled = localStorage.getItem("ragEnabled") !== "false"; // default true
  const storedMaxContextTokens = Number(localStorage.getItem("maxContextTokens") ?? "16000");
  const storedMessageRetrievalEnabled = localStorage.getItem("messageRetrievalEnabled") !== "false"; // default true
  const storedDefaultMaxContextMessages = Number(localStorage.getItem("defaultMaxContextMessages") ?? "10");

  return {
    openAiKey: storedOpenAiKey,
    deepSeekKey: storedDeepSeekKey,
    googleApiKey: storedGoogleApiKey,
    moonshotApiKey: storedMoonshotApiKey,
    userName: userName,
    backupInterval: storedBackupInterval,
    customInstructions: storedCustomInstructions,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    scratchpadRules: storedScratchpadRules,
    chatWidth: storedChatWidth,
    chatFontSize: storedChatFontSize,
    themeMode: storedThemeMode,
    colorTheme: storedColorTheme,
    predefinedPrompts: [],
    llmSuggestionEnabled: storedLlmSuggestionEnabled,
    replyPredictionEnabled: storedReplyPredictionEnabled,
    replyPredictionModel: storedReplyPredictionModel,
    llmModelSelected: storedLlmModelSelected,
    llmModelDownloadStatus: storedLlmModelDownloadStatus,
    topicPreloadCount: storedTopicPreloadCount,
    messageTruncateChars: storedMessageTruncateChars,
    ragEnabled: storedRagEnabled,
    maxContextTokens: storedMaxContextTokens,
    messageRetrievalEnabled: storedMessageRetrievalEnabled,
    defaultMaxContextMessages: storedDefaultMaxContextMessages,
    clearAuth: (): void => {
      localStorage.removeItem("openAiKey");
      localStorage.removeItem("deepSeekKey");
      localStorage.removeItem("googleApiKey");
      localStorage.removeItem("moonshotApiKey");
      localStorage.removeItem("userName");
      localStorage.removeItem("customInstructions");
      localStorage.removeItem("chatWidth");
      localStorage.removeItem("chatFontSize");
      localStorage.removeItem("messageRetrievalEnabled");
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
        replyPredictionEnabled: false,
        replyPredictionModel: "same",
        llmModelSelected: "qwen3.5-0.8b",
        llmModelDownloadStatus: {},
        messageRetrievalEnabled: true,
        defaultMaxContextMessages: 10,
      });
    },
    setDefaultMaxContextMessages: (count: number): void => {
      localStorage.setItem("defaultMaxContextMessages", String(count));
      set({ defaultMaxContextMessages: count });
    },
    setLlmSuggestionEnabled: (enabled: boolean): void => {
      localStorage.setItem("llmSuggestionEnabled", String(enabled));
      set({ llmSuggestionEnabled: enabled });
    },
    setReplyPredictionEnabled: (enabled: boolean): void => {
      localStorage.setItem("replyPredictionEnabled", String(enabled));
      set({ replyPredictionEnabled: enabled });
    },
    setReplyPredictionModel: (model: string): void => {
      localStorage.setItem("replyPredictionModel", model);
      set({ replyPredictionModel: model });
    },
    setLlmModelSelected: (model: "qwen3.5-0.8b" | "qwen3.5-2b"): void => {
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
    setTopicPreloadCount: (count: number): void => {
      localStorage.setItem("topicPreloadCount", String(count));
      set({ topicPreloadCount: count });
    },
    setMessageTruncateChars: (chars: number): void => {
      localStorage.setItem("messageTruncateChars", String(chars));
      set({ messageTruncateChars: chars });
    },
    setRagEnabled: (enabled: boolean): void => {
      localStorage.setItem("ragEnabled", String(enabled));
      set({ ragEnabled: enabled });
    },
    setMaxContextTokens: (tokens: number): void => {
      localStorage.setItem("maxContextTokens", String(tokens));
      set({ maxContextTokens: tokens });
    },
    setMessageRetrievalEnabled: (enabled: boolean): void => {
      localStorage.setItem("messageRetrievalEnabled", String(enabled));
      set({ messageRetrievalEnabled: enabled });
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
    setScratchpadRules: (rules: string): void => {
      localStorage.setItem("scratchpadRules", rules);
      set({ scratchpadRules: rules });
    },
    setChatWidth: (width: "sm" | "md" | "lg" | "xl" | "full"): void => {
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
