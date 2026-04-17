type PipelineFactory = (task: string, modelId: string, options: Record<string, unknown>) => Promise<unknown>;

interface WorkerSelfLike {
  postMessage: jest.MockedFunction<(message: Record<string, unknown>) => void>;
  onmessage: ((event: MessageEvent<Record<string, unknown>>) => Promise<void>) | null;
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
          numThreads: 4,
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
    require('./llmWorker');
  });
}

describe('llmWorker', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('loads model and generates a suggestion on generate messages', async () => {
    const generated = jest.fn((input: string, options: Record<string, unknown>): Promise<{ generated_text: string }[]> => {
      void input;
      void options;
      return Promise.resolve([{ generated_text: 'suggested output' }]);
    });

    mockPipeline.mockResolvedValue(generated);

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

    await workerSelf.onmessage({ data: { type: 'load', modelId: 'model-1' } } as MessageEvent<Record<string, unknown>>);
    await workerSelf.onmessage({ data: { type: 'generate', text: 'hello there', context: 'ctx' } } as MessageEvent<Record<string, unknown>>);

    expect(mockPipeline).toHaveBeenCalledWith('text-generation', 'model-1', expect.objectContaining({ device: 'wasm', dtype: 'q8' }));

    const emittedTypes = workerSelf.postMessage.mock.calls.map(([msg]) => msg.type);
    expect(emittedTypes).toContain('status');
    expect(emittedTypes).toContain('suggestion');

    const suggestionMessage = workerSelf.postMessage.mock.calls.map(([msg]) => msg).find((msg) => msg.type === 'suggestion');

    expect(suggestionMessage).toBeDefined();
    expect(suggestionMessage?.suggestion).toBe('suggested output');
  });

  it('returns empty completion before load and emits unloaded status', async () => {
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

    await workerSelf.onmessage({ data: { type: 'complete', prompt: 'finish this', maxTokens: 10 } } as MessageEvent<Record<string, unknown>>);
    await workerSelf.onmessage({ data: { type: 'unload', modelId: 'model-1' } } as MessageEvent<Record<string, unknown>>);

    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'completion', text: '' });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({ type: 'status', status: 'unloaded', modelId: 'model-1' });
  });
});
