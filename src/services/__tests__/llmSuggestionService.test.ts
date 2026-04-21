export {};
type DownloadStatus = 'not_downloaded' | 'downloading' | 'downloaded' | undefined;

interface AuthStoreStateLike {
  llmModelSelected: 'qwen3.5-0.8b' | 'qwen3.5-2b';
  llmModelDownloadStatus: Record<string, DownloadStatus>;
  setLlmModelDownloadStatus: jest.MockedFunction<(modelId: string, status: 'not_downloaded' | 'downloading' | 'downloaded') => void>;
}

interface WorkerMessage {
  type: string;
  suggestion?: string;
  text?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  modelId?: string;
  status?: string;
  error?: string;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: jest.MockedFunction<(message: Record<string, unknown>) => void>;
  terminate: jest.MockedFunction<() => void>;
}

interface CacheRequestLike {
  url: string;
}

interface CacheLike {
  keys: jest.MockedFunction<() => Promise<CacheRequestLike[]>>;
  delete: jest.MockedFunction<(request: CacheRequestLike) => Promise<boolean>>;
}

const PRIMARY_MODEL_ID = 'onnx-community/Qwen3.5-2B-ONNX';
const SECONDARY_MODEL_ID = 'onnx-community/Qwen3.5-0.8B-ONNX';

let mockAuthState: AuthStoreStateLike;
let mockWorkers: WorkerLike[];
let mockCache: CacheLike;
let mockOpenCache: jest.MockedFunction<(name: string) => Promise<CacheLike>>;

function mockCreateWorkerLike(): WorkerLike {
  return {
    onmessage: null,
    onerror: null,
    postMessage: jest.fn((message: Record<string, unknown>): void => {
      void message;
    }),
    terminate: jest.fn((): void => undefined),
  };
}

jest.mock('../llmWorkerFactory', () => ({
  createLlmWorker: (): Worker => {
    const worker = mockCreateWorkerLike();
    mockWorkers.push(worker);
    return worker as unknown as Worker;
  },
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: (): AuthStoreStateLike => mockAuthState,
  },
}));

function createAuthStoreState(): AuthStoreStateLike {
  return {
    llmModelSelected: 'qwen3.5-0.8b',
    llmModelDownloadStatus: {},
    setLlmModelDownloadStatus: jest.fn((modelId: string, status: 'not_downloaded' | 'downloading' | 'downloaded'): void => {
      mockAuthState.llmModelDownloadStatus[modelId] = status;
    }),
  };
}

function installCacheMock(): void {
  mockCache = {
    keys: jest.fn((): Promise<CacheRequestLike[]> => Promise.resolve([])),
    delete: jest.fn((_request: CacheRequestLike): Promise<boolean> => Promise.resolve(true)),
  };

  mockOpenCache = jest.fn((_name: string): Promise<CacheLike> => Promise.resolve(mockCache));

  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    writable: true,
    value: {
      open: mockOpenCache,
    },
  });
}

function emitMessage(worker: WorkerLike, data: WorkerMessage): void {
  worker.onmessage?.({ data } as MessageEvent<WorkerMessage>);
}

function emitError(worker: WorkerLike, message: string): void {
  worker.onerror?.({ message } as ErrorEvent);
}

function loadServiceModule(): typeof import('../llmSuggestionService') {
  let loadedModule: typeof import('../llmSuggestionService') | undefined;

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loadedModule = require('../llmSuggestionService') as typeof import('../llmSuggestionService');
  });

  if (!loadedModule) {
    throw new Error('Expected llmSuggestionService module to load');
  }

  return loadedModule;
}

describe('llmSuggestionService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockAuthState = createAuthStoreState();
    mockWorkers = [];
    installCacheMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads a model, forwards progress, and marks the model as downloaded when ready', () => {
    const { llmSuggestionService } = loadServiceModule();
    const progressSpy = jest.fn((progress: { modelId: string; progress: number; loaded: number; total: number }): void => {
      void progress;
    });
    const statusSpy = jest.fn((status: string): void => {
      void status;
    });

    llmSuggestionService.setOnProgress(progressSpy);
    llmSuggestionService.setOnStatus(statusSpy);
    llmSuggestionService.loadModel(PRIMARY_MODEL_ID);

    expect(mockWorkers).toHaveLength(1);
    const worker = mockWorkers[0];

    expect(mockAuthState.setLlmModelDownloadStatus).toHaveBeenCalledWith(PRIMARY_MODEL_ID, 'downloading');
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'load',
      modelId: PRIMARY_MODEL_ID,
      device: 'webgpu',
      dtype: { embed_tokens: 'q4', decoder_model_merged: 'q4' },
    });

    emitMessage(worker, { type: 'progress', modelId: PRIMARY_MODEL_ID, progress: 0.5, loaded: 5, total: 10 });
    emitMessage(worker, { type: 'status', status: 'ready', modelId: PRIMARY_MODEL_ID });

    expect(progressSpy).toHaveBeenCalledWith({ modelId: PRIMARY_MODEL_ID, progress: 0.5, loaded: 5, total: 10 });
    expect(statusSpy).toHaveBeenCalledWith('ready');
    expect(mockAuthState.setLlmModelDownloadStatus).toHaveBeenLastCalledWith(PRIMARY_MODEL_ID, 'downloaded');

    llmSuggestionService.loadModel(PRIMARY_MODEL_ID);

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous suggestion request and resolves the latest trimmed suggestion', async () => {
    const { llmSuggestionService } = loadServiceModule();

    const firstSuggestion = llmSuggestionService.getSuggestion('first');
    expect(mockWorkers).toHaveLength(1);
    const worker = mockWorkers[0];

    const secondSuggestion = llmSuggestionService.getSuggestion('second', 'context');

    await expect(firstSuggestion).resolves.toBe('');

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'generate', text: 'first', context: undefined });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'generate', text: 'second', context: 'context' });

    emitMessage(worker, { type: 'suggestion', suggestion: '  trimmed result  ' });

    await expect(secondSuggestion).resolves.toBe('trimmed result');
  });

  it('resolves a pending suggestion and resets the worker when an error is raised', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    const { llmSuggestionService } = loadServiceModule();

    const pendingSuggestion = llmSuggestionService.getSuggestion('hello');
    expect(mockWorkers).toHaveLength(1);
    const firstWorker = mockWorkers[0];

    emitError(firstWorker, 'worker exploded');

    await expect(pendingSuggestion).resolves.toBe('');
    expect(consoleErrorSpy).toHaveBeenCalledWith('LLM Worker Failure:', 'worker exploded');
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    void llmSuggestionService.getSuggestion('next');

    expect(mockWorkers).toHaveLength(2);
    consoleErrorSpy.mockRestore();
  });

  it('deletes cached model assets, unloads the worker, and resets download status', async () => {
    const { llmSuggestionService } = loadServiceModule();
    const encodedModelId = encodeURIComponent(PRIMARY_MODEL_ID);

    mockCache.keys.mockResolvedValue([
      { url: `https://example.test/cache/${encodedModelId}` },
      { url: `https://example.test/cache/${PRIMARY_MODEL_ID}` },
      { url: 'https://example.test/cache/unrelated' },
    ]);

    llmSuggestionService.loadModel(PRIMARY_MODEL_ID);
    expect(mockWorkers).toHaveLength(1);
    const worker = mockWorkers[0];

    emitMessage(worker, { type: 'status', status: 'ready', modelId: PRIMARY_MODEL_ID });

    await llmSuggestionService.deleteModel(PRIMARY_MODEL_ID);

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'unload', modelId: PRIMARY_MODEL_ID });
    expect(mockOpenCache).toHaveBeenCalledWith('transformers-cache');
    expect(mockCache.delete).toHaveBeenCalledTimes(2);
    expect(mockAuthState.setLlmModelDownloadStatus).toHaveBeenLastCalledWith(PRIMARY_MODEL_ID, 'not_downloaded');
  });

  it('returns an empty completion when the selected model is not downloaded', async () => {
    const { llmSuggestionService } = loadServiceModule();

    await expect(llmSuggestionService.getCompletion('prompt')).resolves.toBe('');
    expect(mockWorkers).toHaveLength(0);
  });

  it('requests a completion from the ready worker and resolves with the returned text', async () => {
    mockAuthState.llmModelSelected = 'qwen3.5-2b';
    mockAuthState.llmModelDownloadStatus[PRIMARY_MODEL_ID] = 'downloaded';

    const { llmSuggestionService } = loadServiceModule();

    llmSuggestionService.loadModel(PRIMARY_MODEL_ID, true, true);
    expect(mockWorkers).toHaveLength(1);
    const worker = mockWorkers[0];

    emitMessage(worker, { type: 'status', status: 'ready', modelId: PRIMARY_MODEL_ID });

    const completionPromise = llmSuggestionService.getCompletion('finish this', 64);

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'complete', prompt: 'finish this', maxTokens: 64 });

    emitMessage(worker, { type: 'completion', text: 'completed text' });

    await expect(completionPromise).resolves.toBe('completed text');
  });

  it('resets an in-flight download back to not_downloaded', () => {
    const { llmSuggestionService } = loadServiceModule();

    llmSuggestionService.loadModel(SECONDARY_MODEL_ID);
    llmSuggestionService.resetDownload(SECONDARY_MODEL_ID);

    expect(mockAuthState.setLlmModelDownloadStatus).toHaveBeenLastCalledWith(SECONDARY_MODEL_ID, 'not_downloaded');
  });
});
