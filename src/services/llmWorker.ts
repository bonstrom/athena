import { pipeline, env, type TextGenerationPipeline, type TextGenerationSingle } from "@xenova/transformers";

// --- 1. STRICT ENVIRONMENT CONFIG ---
env.allowLocalModels = false;
env.useBrowserCache = true;

// This is the most critical fix for RangeErrors in Workers
if (env.backends && env.backends.onnx) {
  env.backends.onnx.logLevel = "fatal";
  // Disable the internal ORT proxy to prevent nested worker memory issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (env.backends.onnx.wasm as any).proxy = false;
  env.backends.onnx.wasm.numThreads = 1;
}

// Simple logging filter
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === "string" && (args[0].includes("Removing initializer") || args[0].includes("CleanUnused")))
    return;
  originalLog(...args);
};

let generator: TextGenerationPipeline | null = null;

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
    self.postMessage({ type: "status", status: "loading", modelId });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    generator = await pipeline("text-generation", modelId, {
      quantized,
      progress_callback: (progress: ProgressData) => {
        if (progress.status === "progress") {
          self.postMessage({
            type: "progress",
            modelId,
            progress: progress.progress ?? 0,
            loaded: progress.loaded ?? 0,
            total: progress.total ?? 0,
          });
        }
      },
    } as any);

    self.postMessage({ type: "status", status: "ready", modelId });
  } catch (error) {
    console.error("Failed to load model:", error);
    self.postMessage({ type: "error", error: (error as Error).message });
  }
}

let isGenerating = false;
let pendingText: string | null = null;

async function generateSuggestion(text: string): Promise<void> {
  if (!generator) return;

  if (isGenerating) {
    pendingText = text;
    return;
  }

  isGenerating = true;
  let currentText: string | null = text;

  try {
    while (currentText !== null) {
      const trimmed = currentText.trim();

      if (trimmed) {
        // Explicitly truncate characters to stay safe (approx 2 tokens per char worst case)
        const safeText = trimmed.length > 512 ? trimmed.slice(-512) : trimmed;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const output = (await generator(safeText, {
          max_new_tokens: 2,
          do_sample: false,
          use_cache: false,
          return_full_text: false,
          // CRITICAL: Force the tokenizer to handle bounds checking
          truncation: true,
          padding: true,
        } as any)) as TextGenerationSingle[];

        if (!pendingText) {
          const rawSuggestion = output[0]?.generated_text;
          const suggestion = typeof rawSuggestion === "string" ? rawSuggestion : "";
          self.postMessage({ type: "suggestion", suggestion });
        }
      } else {
        self.postMessage({ type: "suggestion", suggestion: "" });
      }

      // Move to next in queue
      currentText = pendingText;
      pendingText = null;
    }
  } catch (error) {
    console.error("Inference failed:", error);
    self.postMessage({ type: "error", error: (error as Error).message });
  } finally {
    isGenerating = false;
  }
}

interface WorkerMessage {
  type: string;
  modelId?: string;
  quantized?: boolean;
  text?: string;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, modelId, quantized, text } = e.data;
  if (type === "load" && modelId) {
    await loadModel(modelId, !!quantized);
  } else if (type === "generate" && text !== undefined) {
    await generateSuggestion(text);
  }
};
