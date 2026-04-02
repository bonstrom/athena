import { pipeline, env, type TextGenerationPipeline, type TextGenerationSingle } from '@xenova/transformers';

interface TransformersEnv {
  allowLocalModels: boolean;
  useBrowserCache: boolean;
  backends?: {
    onnx?: {
      logLevel?: string;
      wasm?: { proxy?: boolean; numThreads?: number };
    };
  };
}

// --- 1. STRICT ENVIRONMENT CONFIG ---
const typedEnv = env as unknown as TransformersEnv;
typedEnv.allowLocalModels = false;
typedEnv.useBrowserCache = true;

// This is the most critical fix for RangeErrors in Workers
if (typedEnv.backends?.onnx) {
  typedEnv.backends.onnx.logLevel = 'fatal';
  // Disable the internal ORT proxy to prevent nested worker memory issues
  if (typedEnv.backends.onnx.wasm) {
    typedEnv.backends.onnx.wasm.proxy = false;
    typedEnv.backends.onnx.wasm.numThreads = 1;
  }
}

// Simple logging filter
const originalLog = console.log;
console.log = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && (args[0].includes('Removing initializer') || args[0].includes('CleanUnused'))) return;
  originalLog(...args);
};

let generator: TextGenerationPipeline | null = null;
let cancelled = false;

interface SuggestionRequest {
  text: string;
  context?: string;
}

interface ProgressData {
  status: string;
  progress?: number;
  loaded?: number;
  total?: number;
  modelId?: string;
  file?: string;
}

async function loadModel(modelId: string, quantized: boolean): Promise<void> {
  try {
    self.postMessage({ type: 'status', status: 'loading', modelId });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    generator = (await (pipeline as any)('text-generation', modelId, {
      quantized,
      progress_callback: (progress: ProgressData) => {
        if (progress.status === 'progress') {
          self.postMessage({
            type: 'progress',
            modelId,
            progress: progress.progress ?? 0,
            loaded: progress.loaded ?? 0,
            total: progress.total ?? 0,
          });
        }
      },
    })) as TextGenerationPipeline;

    self.postMessage({ type: 'status', status: 'ready', modelId });
  } catch (error) {
    console.error('Failed to load model:', error);
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
}

function unloadModel(modelId?: string): void {
  generator = null;
  cancelled = true;
  pendingRequest = null;
  self.postMessage({ type: 'status', status: 'unloaded', modelId });
}

let isGenerating = false;
let pendingRequest: SuggestionRequest | null = null;

async function generateSuggestion(text: string, context?: string): Promise<void> {
  if (!generator) return;

  if (isGenerating) {
    pendingRequest = { text, context };
    return;
  }

  isGenerating = true;
  let currentRequest: SuggestionRequest | null = { text, context };

  try {
    while (currentRequest !== null) {
      const trimmed = currentRequest.text.trim();

      if (trimmed) {
        const trimmedContext = currentRequest.context?.trim();
        const prompt = trimmedContext ? `[context] ${trimmedContext}\n${trimmed}` : trimmed;

        // Explicitly truncate characters to stay safe (approx 2 tokens per char worst case)
        const safeText = prompt.length > 512 ? prompt.slice(-512) : prompt;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const output = await (generator as unknown as (input: string, options: Record<string, unknown>) => Promise<TextGenerationSingle[]>)(
          safeText,
          {
            max_new_tokens: 2,
            do_sample: false,
            use_cache: false,
            return_full_text: false,
            // CRITICAL: Force the tokenizer to handle bounds checking
            truncation: true,
            padding: true,
          },
        );

        if (cancelled) {
          cancelled = false;
        } else if (!pendingRequest) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const rawSuggestion = output[0]?.generated_text;
          const suggestion = typeof rawSuggestion === 'string' ? rawSuggestion : '';
          self.postMessage({ type: 'suggestion', suggestion });
        }
      } else {
        self.postMessage({ type: 'suggestion', suggestion: '' });
      }

      // Move to next in queue
      currentRequest = pendingRequest;
      pendingRequest = null;
    }
  } catch (error) {
    console.error('Inference failed:', error);
    self.postMessage({ type: 'error', error: (error as Error).message });
  } finally {
    isGenerating = false;
  }
}

interface WorkerMessage {
  type: string;
  modelId?: string;
  quantized?: boolean;
  text?: string;
  context?: string;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>): Promise<void> => {
  const { type, modelId, quantized, text, context } = e.data;
  if (type === 'load' && modelId) {
    await loadModel(modelId, !!quantized);
  } else if (type === 'unload') {
    unloadModel(modelId);
  } else if (type === 'cancel') {
    cancelled = true;
    pendingRequest = null;
  } else if (type === 'generate' && text !== undefined) {
    cancelled = false;
    await generateSuggestion(text, context);
  }
};
