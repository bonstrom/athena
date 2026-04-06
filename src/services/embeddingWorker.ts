import { pipeline, env } from '@xenova/transformers';

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

const typedEnv = env as unknown as TransformersEnv;
typedEnv.allowLocalModels = false;
typedEnv.useBrowserCache = true;

if (typedEnv.backends?.onnx) {
  typedEnv.backends.onnx.logLevel = 'fatal';
  if (typedEnv.backends.onnx.wasm) {
    typedEnv.backends.onnx.wasm.proxy = false;
    typedEnv.backends.onnx.wasm.numThreads = 1;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

async function loadModel(): Promise<void> {
  try {
    self.postMessage({ type: 'status', status: 'loading' });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    extractor = await (pipeline as any)('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });

    self.postMessage({ type: 'status', status: 'ready' });
  } catch (error) {
    console.error('Failed to load embedding model:', error);
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
}

function meanPool(embeddings: number[][], attentionMask: number[]): number[] {
  const seqLen = embeddings.length;
  const dim = embeddings[0].length;
  const result = new Array<number>(dim).fill(0);
  let maskSum = 0;

  for (let i = 0; i < seqLen; i++) {
    const mask = attentionMask[i] ?? 1;
    maskSum += mask;
    for (let j = 0; j < dim; j++) {
      result[j] += embeddings[i][j] * mask;
    }
  }

  if (maskSum > 0) {
    for (let j = 0; j < dim; j++) {
      result[j] /= maskSum;
    }
  }

  return result;
}

function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

async function embedText(id: string, text: string): Promise<void> {
  if (!extractor) {
    self.postMessage({ type: 'error', error: 'Model not loaded', id });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const output = await extractor(text, { pooling: 'mean', normalize: true });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const rawData = output?.data as Float32Array | undefined;
    let vector: number[];

    if (rawData instanceof Float32Array) {
      vector = Array.from(rawData);
    } else {
      // Fallback: manual mean pool from last_hidden_state
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const hidden = output?.last_hidden_state as number[][] | undefined;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const mask = (output?.attention_mask as number[] | undefined) ?? [];
      if (hidden) {
        vector = l2Normalize(meanPool(hidden, mask));
      } else {
        throw new Error('Unexpected output shape from embedding model');
      }
    }

    self.postMessage({ type: 'embedding', id, vector });
  } catch (error) {
    console.error('Embedding failed:', error);
    self.postMessage({ type: 'error', error: (error as Error).message, id });
  }
}

self.onmessage = (event: MessageEvent<{ type: string; id?: string; text?: string }>): void => {
  const { type, id, text } = event.data;

  if (type === 'load') {
    void loadModel();
  } else if (type === 'embed' && id !== undefined && text !== undefined) {
    void embedText(id, text);
  } else if (type === 'unload') {
    extractor = null;
    self.postMessage({ type: 'status', status: 'unloaded' });
  }
};
