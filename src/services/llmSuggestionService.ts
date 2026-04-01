import { useAuthStore } from "../store/AuthStore";

export interface LlmProgress {
  modelId: string;
  progress: number;
  loaded: number;
  total: number;
}

class LlmSuggestionService {
  private worker: Worker | null = null;
  private currentSuggestionResolve: ((suggestion: string) => void) | null = null;
  private onProgressCallback: ((progress: LlmProgress) => void) | null = null;
  private onStatusCallback: ((status: string) => void) | null = null;
  private loadingModelId: string | null = null;
  private loadedModelId: string | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (this.worker) return;

    // CRA 5 supports this syntax
    this.worker = new Worker(new URL("./llmWorker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (e: MessageEvent): void => {
      const data = e.data as {
        type: string;
        suggestion?: string;
        progress?: number;
        loaded?: number;
        total?: number;
        modelId?: string;
        status?: string;
        error?: string;
      };
      const { type, suggestion, progress, loaded, total, modelId, status, error } = data;

      switch (type) {
        case "suggestion":
          if (this.currentSuggestionResolve) {
            this.currentSuggestionResolve(suggestion?.trim() ?? "");
            this.currentSuggestionResolve = null;
          }
          break;
        case "progress":
          if (this.onProgressCallback) {
            this.onProgressCallback({
              modelId: modelId ?? "",
              progress: progress ?? 0,
              loaded: loaded ?? 0,
              total: total ?? 0,
            });
          }
          break;
        case "status":
          if (this.onStatusCallback) {
            this.onStatusCallback(status ?? "");
          }
          if (status === "ready" && modelId) {
            this.loadingModelId = null;
            this.loadedModelId = modelId;
            useAuthStore.getState().setLlmModelDownloadStatus(modelId, "downloaded");
          }
          break;
        case "error":
          console.error("LLM Worker Error:", error);
          this.loadingModelId = null;
          if (this.currentSuggestionResolve) {
            this.currentSuggestionResolve("");
            this.currentSuggestionResolve = null;
          }
          break;
      }
    };
  }

  public setOnProgress(callback: (progress: LlmProgress) => void): void {
    this.onProgressCallback = callback;
  }

  public setOnStatus(callback: (status: string) => void): void {
    this.onStatusCallback = callback;
  }

  public loadModel(modelId: string, quantized = true, silent = false): void {
    if (this.loadingModelId === modelId || this.loadedModelId === modelId) return;
    this.loadingModelId = modelId;
    console.log("LLM: Auto-loading model into memory:", modelId);

    this.initWorker();
    if (!silent) {
      useAuthStore.getState().setLlmModelDownloadStatus(modelId, "downloading");
    }
    this.worker?.postMessage({ type: "load", modelId, quantized });
  }

  public async getSuggestion(text: string): Promise<string> {
    if (!this.worker) return "";

    return new Promise((resolve) => {
      // Cancel previous if any
      if (this.currentSuggestionResolve) {
        this.currentSuggestionResolve("");
      }
      this.currentSuggestionResolve = resolve;
      this.worker?.postMessage({ type: "generate", text });
    });
  }
}

export const llmSuggestionService = new LlmSuggestionService();
