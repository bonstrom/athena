import { useAuthStore } from '../store/AuthStore';
import { createLlmWorker } from './llmWorkerFactory';

export interface LlmProgress {
  modelId: string;
  progress: number;
  loaded: number;
  total: number;
}

class LlmSuggestionService {
  private worker: Worker | null = null;
  private currentSuggestionResolve: ((suggestion: string) => void) | null = null;
  private currentSuggestionTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentCompletionResolve: ((text: string) => void) | null = null;
  private currentCompletionTimeout: ReturnType<typeof setTimeout> | null = null;
  private onProgressCallback: ((progress: LlmProgress) => void) | null = null;
  private onStatusCallback: ((status: string) => void) | null = null;
  private loadingModelId: string | null = null;
  private loadedModelId: string | null = null;

  private clearSuggestionTimeout(): void {
    if (this.currentSuggestionTimeout) {
      clearTimeout(this.currentSuggestionTimeout);
      this.currentSuggestionTimeout = null;
    }
  }

  private resolvePendingSuggestion(suggestion = ''): void {
    this.clearSuggestionTimeout();

    if (this.currentSuggestionResolve) {
      this.currentSuggestionResolve(suggestion);
      this.currentSuggestionResolve = null;
    }
  }

  private resolvePendingCompletion(text = ''): void {
    if (this.currentCompletionTimeout) {
      clearTimeout(this.currentCompletionTimeout);
      this.currentCompletionTimeout = null;
    }
    if (this.currentCompletionResolve) {
      this.currentCompletionResolve(text);
      this.currentCompletionResolve = null;
    }
  }

  private handleWorkerFailure(error: string): void {
    console.error('LLM Worker Failure:', error);
    this.loadingModelId = null;
    this.loadedModelId = null;
    this.resolvePendingSuggestion('');
    this.resolvePendingCompletion('');
    this.worker?.terminate();
    this.worker = null;
  }

  private async clearModelCache(modelId: string): Promise<void> {
    const cache = await caches.open('transformers-cache');
    const requests = await cache.keys();
    const encodedModelId = encodeURIComponent(modelId);

    await Promise.all(
      requests
        .filter((request) => request.url.includes(encodedModelId) || decodeURIComponent(request.url).includes(modelId))
        .map(async (request) => {
          await cache.delete(request);
        }),
    );
  }

  private initWorker(): void {
    if (this.worker) return;

    this.worker = createLlmWorker();

    this.worker.onerror = (event: ErrorEvent): void => {
      const message = event.message || 'Unknown worker error';
      this.handleWorkerFailure(message);
    };

    this.worker.onmessage = (e: MessageEvent): void => {
      const data = e.data as {
        type: string;
        suggestion?: string;
        text?: string;
        progress?: number;
        loaded?: number;
        total?: number;
        modelId?: string;
        status?: string;
        error?: string;
      };
      const { type, suggestion, text, progress, loaded, total, modelId, status, error } = data;

      switch (type) {
        case 'suggestion':
          this.resolvePendingSuggestion(suggestion?.trim() ?? '');
          break;
        case 'completion':
          this.resolvePendingCompletion(text ?? '');
          break;
        case 'progress':
          if (this.onProgressCallback) {
            this.onProgressCallback({
              modelId: modelId ?? '',
              progress: progress ?? 0,
              loaded: loaded ?? 0,
              total: total ?? 0,
            });
          }
          break;
        case 'status':
          if (this.onStatusCallback) {
            this.onStatusCallback(status ?? '');
          }
          if (status === 'ready' && modelId) {
            this.loadingModelId = null;
            this.loadedModelId = modelId;
            useAuthStore.getState().setLlmModelDownloadStatus(modelId, 'downloaded');
          } else if (status === 'unloaded') {
            if (!modelId || this.loadedModelId === modelId) {
              this.loadedModelId = null;
            }
            if (!modelId || this.loadingModelId === modelId) {
              this.loadingModelId = null;
            }
          }
          break;
        case 'error':
          console.error('LLM Worker Error:', error);
          this.loadingModelId = null;
          this.resolvePendingSuggestion('');
          this.resolvePendingCompletion('');
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

  public loadModel(modelId: string, _quantized = true, silent = false): void {
    if (this.loadingModelId === modelId || this.loadedModelId === modelId) return;
    this.loadingModelId = modelId;
    console.log('LLM: Auto-loading model into memory:', modelId);

    // Qwen3.5 ONNX models require WebGPU (block quantization not supported in WASM)
    const isQwen35 = modelId.includes('Qwen3.5');
    const device = isQwen35 ? 'webgpu' : 'wasm';
    const dtype: string | Record<string, string> = isQwen35 ? { embed_tokens: 'q4', decoder_model_merged: 'q4' } : 'q8';

    this.initWorker();
    if (!silent) {
      useAuthStore.getState().setLlmModelDownloadStatus(modelId, 'downloading');
    }
    this.worker?.postMessage({ type: 'load', modelId, device, dtype });
  }

  public cancelSuggestion(): void {
    this.resolvePendingSuggestion('');

    this.worker?.postMessage({ type: 'cancel' });
  }

  public async deleteModel(modelId: string): Promise<void> {
    this.cancelSuggestion();
    this.worker?.postMessage({ type: 'unload', modelId });

    await this.clearModelCache(modelId);

    if (this.loadedModelId === modelId) {
      this.loadedModelId = null;
    }
    if (this.loadingModelId === modelId) {
      this.loadingModelId = null;
    }

    useAuthStore.getState().setLlmModelDownloadStatus(modelId, 'not_downloaded');
  }

  public resetDownload(modelId: string): void {
    if (this.loadingModelId === modelId) {
      this.loadingModelId = null;
    }
    useAuthStore.getState().setLlmModelDownloadStatus(modelId, 'not_downloaded');
  }

  public async getSuggestion(text: string, context?: string): Promise<string> {
    this.initWorker();
    if (!this.worker) return '';

    this.cancelSuggestion();

    const suggestionPromise = new Promise<string>((resolve) => {
      this.currentSuggestionResolve = resolve;
      this.worker?.postMessage({ type: 'generate', text, context });
    });

    const timeoutPromise = new Promise<string>((resolve) => {
      this.currentSuggestionTimeout = setTimeout(() => {
        this.worker?.postMessage({ type: 'cancel' });
        this.resolvePendingSuggestion('');
        resolve('');
      }, 5000);
    });

    return Promise.race([suggestionPromise, timeoutPromise]);
  }

  public async getCompletion(prompt: string, maxTokens = 200): Promise<string> {
    const { llmModelSelected, llmModelDownloadStatus } = useAuthStore.getState();
    const modelId: string = llmModelSelected === 'qwen3.5-2b' ? 'onnx-community/Qwen3.5-2B-ONNX' : 'onnx-community/Qwen3.5-0.8B-ONNX';

    // Ensure model is loaded
    if (llmModelDownloadStatus[modelId] !== 'downloaded') return '';
    this.loadModel(modelId, true, true);

    // Wait for model to be ready if still loading
    if (this.loadedModelId !== modelId) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.loadedModelId === modelId) {
            clearInterval(interval);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 15000);
      });
    }

    this.initWorker();
    if (!this.worker) return '';

    // Cancel any pending completion
    this.resolvePendingCompletion('');

    return new Promise<string>((resolve) => {
      this.currentCompletionResolve = resolve;
      this.currentCompletionTimeout = setTimeout(() => {
        console.warn('LLM completion timed out after 120s');
        this.resolvePendingCompletion('');
      }, 120000);
      this.worker?.postMessage({ type: 'complete', prompt, maxTokens });
    });
  }
}

export const llmSuggestionService = new LlmSuggestionService();
