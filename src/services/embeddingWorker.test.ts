export {};
type PipelineFactory = (task: string, modelId: string, options: Record<string, unknown>) => Promise<unknown>;

type ExtractorFn = (
  text: string,
  options: Record<string, unknown>,
) => Promise<{ data?: Float32Array; last_hidden_state?: number[][]; attention_mask?: number[] }>;

interface WorkerSelfLike {
  postMessage: jest.MockedFunction<(message: Record<string, unknown>) => void>;
  onmessage: ((event: MessageEvent<{ type: string; id?: string; text?: string }>) => void) | null;
}

const mockPipeline = jest.fn<ReturnType<PipelineFactory>, Parameters<PipelineFactory>>();

jest.mock('@xenova/transformers', () => ({
  pipeline: (...args: Parameters<PipelineFactory>): ReturnType<PipelineFactory> => mockPipeline(...args),
  env: {
    allowLocalModels: true,
    useBrowserCache: false,
    backends: {
      onnx: {
        logLevel: 'info',
        wasm: {
          proxy: true,
          numThreads: 2,
        },
      },
    },
  },
}));

function loadWorkerWithSelf(selfLike: WorkerSelfLike): void {
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    writable: true,
    value: selfLike,
  });

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./embeddingWorker');
  });
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('embeddingWorker', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('loads model and emits loading and ready status', async () => {
    const extractor: ExtractorFn = (text: string, options: Record<string, unknown>): Promise<{ data: Float32Array }> => {
      void text;
      void options;
      return Promise.resolve({ data: new Float32Array([0.5, 0.5]) });
    };

    mockPipeline.mockResolvedValue(extractor);

    const workerSelf: WorkerSelfLike = {
      postMessage: jest.fn((message: Record<string, unknown>): void => {
        void message;
      }),
      onmessage: null,
    };

    loadWorkerWithSelf(workerSelf);

    if (!workerSelf.onmessage) {
      throw new Error('Expected worker onmessage handler to be defined');
    }

    workerSelf.onmessage({ data: { type: 'load' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);
    await flushAsync();

    expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2', expect.objectContaining({ quantized: true }));

    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'status', status: 'loading' });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'status', status: 'ready' });
  });

  it('returns error when embedding is requested before model load', () => {
    const workerSelf: WorkerSelfLike = {
      postMessage: jest.fn((message: Record<string, unknown>): void => {
        void message;
      }),
      onmessage: null,
    };

    loadWorkerWithSelf(workerSelf);

    if (!workerSelf.onmessage) {
      throw new Error('Expected worker onmessage handler to be defined');
    }

    workerSelf.onmessage({ data: { type: 'embed', id: 'req-1', text: 'hello' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);

    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'error', error: 'Model not loaded', id: 'req-1' });
  });

  it('embeds text using Float32Array output and emits embedding vector', async () => {
    const extractor: ExtractorFn = (text: string, options: Record<string, unknown>): Promise<{ data: Float32Array }> => {
      void text;
      void options;
      return Promise.resolve({ data: new Float32Array([1, 2, 3]) });
    };

    mockPipeline.mockResolvedValue(extractor);

    const workerSelf: WorkerSelfLike = {
      postMessage: jest.fn((message: Record<string, unknown>): void => {
        void message;
      }),
      onmessage: null,
    };

    loadWorkerWithSelf(workerSelf);

    if (!workerSelf.onmessage) {
      throw new Error('Expected worker onmessage handler to be defined');
    }

    workerSelf.onmessage({ data: { type: 'load' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);
    await flushAsync();

    workerSelf.onmessage({ data: { type: 'embed', id: 'req-2', text: 'hello world' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);
    await flushAsync();

    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'embedding', id: 'req-2', vector: [1, 2, 3] });
  });

  it('falls back to mean pool and normalization when no direct data exists', async () => {
    const extractor: ExtractorFn = (
      text: string,
      options: Record<string, unknown>,
    ): Promise<{ last_hidden_state: number[][]; attention_mask: number[] }> => {
      void text;
      void options;
      return Promise.resolve({
        last_hidden_state: [
          [1, 0],
          [0, 1],
        ],
        attention_mask: [1, 1],
      });
    };

    mockPipeline.mockResolvedValue(extractor);

    const workerSelf: WorkerSelfLike = {
      postMessage: jest.fn((message: Record<string, unknown>): void => {
        void message;
      }),
      onmessage: null,
    };

    loadWorkerWithSelf(workerSelf);

    if (!workerSelf.onmessage) {
      throw new Error('Expected worker onmessage handler to be defined');
    }

    workerSelf.onmessage({ data: { type: 'load' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);
    await flushAsync();

    workerSelf.onmessage({ data: { type: 'embed', id: 'req-3', text: 'fallback' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);
    await flushAsync();

    const embeddingMessage = workerSelf.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'embedding' && message.id === 'req-3');

    expect(embeddingMessage).toBeDefined();
    const vector = embeddingMessage?.vector as number[] | undefined;
    expect(vector).toBeDefined();
    if (!vector) {
      throw new Error('Expected vector in embedding message');
    }

    expect(vector[0]).toBeCloseTo(0.7071, 3);
    expect(vector[1]).toBeCloseTo(0.7071, 3);
  });

  it('handles unload message by emitting unloaded status', () => {
    const workerSelf: WorkerSelfLike = {
      postMessage: jest.fn((message: Record<string, unknown>): void => {
        void message;
      }),
      onmessage: null,
    };

    loadWorkerWithSelf(workerSelf);

    if (!workerSelf.onmessage) {
      throw new Error('Expected worker onmessage handler to be defined');
    }

    workerSelf.onmessage({ data: { type: 'unload' } } as unknown as MessageEvent<{ type: string; id?: string; text?: string }>);

    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'status', status: 'unloaded' });
  });
});
