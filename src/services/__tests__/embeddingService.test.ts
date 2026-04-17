import type { Message } from '../../database/AthenaDb';

type WorkerOutbound = { type: 'load' } | { type: 'embed'; id: string; text: string } | { type: 'unload' };

type WorkerInbound =
  | { type: 'status'; status?: string }
  | { type: 'embedding'; id?: string; vector?: number[] }
  | { type: 'error'; id?: string; error?: string };

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerInbound>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage: jest.MockedFunction<(message: WorkerOutbound) => undefined>;
  terminate: jest.MockedFunction<() => undefined>;
}

const mockCreateEmbeddingWorker = jest.fn<Worker, []>();

jest.mock('../embeddingWorkerFactory', () => ({
  createEmbeddingWorker: (...args: []): Worker => mockCreateEmbeddingWorker(...args),
}));

import { EmbeddingService } from '../embeddingService';

function createWorkerLike(): WorkerLike {
  return {
    onmessage: null,
    onerror: null,
    postMessage: jest.fn((message: WorkerOutbound): undefined => {
      void message;
      return undefined;
    }),
    terminate: jest.fn((): undefined => undefined),
  };
}

function emitMessage(worker: WorkerLike, data: WorkerInbound): void {
  worker.onmessage?.({ data } as MessageEvent<WorkerInbound>);
}

function makeMessage(id: string, content: string, embedding?: number[] | null): Message {
  return {
    id,
    topicId: 'topic-1',
    forkId: 'main',
    type: 'user',
    content,
    isDeleted: false,
    includeInContext: false,
    created: '2024-01-01T00:00:00.000Z',
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    embedding,
  };
}

describe('EmbeddingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads model and becomes ready on ready status', async () => {
    const service = new EmbeddingService();
    const worker = createWorkerLike();
    mockCreateEmbeddingWorker.mockReturnValue(worker as unknown as Worker);

    const loadPromise = service.loadModel();

    expect(mockCreateEmbeddingWorker).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'load' });

    emitMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    expect(service.isReady).toBe(true);
  });

  it('reuses the same loading promise for concurrent loadModel calls', async () => {
    const service = new EmbeddingService();
    const worker = createWorkerLike();
    mockCreateEmbeddingWorker.mockReturnValue(worker as unknown as Worker);

    const p1 = service.loadModel();
    const p2 = service.loadModel();

    expect(mockCreateEmbeddingWorker).toHaveBeenCalledTimes(1);

    emitMessage(worker, { type: 'status', status: 'ready' });
    await Promise.all([p1, p2]);

    expect(service.isReady).toBe(true);
  });

  it('generateEmbedding throws when model is not ready', async () => {
    const service = new EmbeddingService();

    await expect(service.generateEmbedding('hello')).rejects.toThrow('Embedding model not ready');
  });

  it('generateEmbedding sends truncated text and resolves vector', async () => {
    const service = new EmbeddingService();
    const worker = createWorkerLike();
    mockCreateEmbeddingWorker.mockReturnValue(worker as unknown as Worker);

    const loadPromise = service.loadModel();
    emitMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    const input = 'x'.repeat(600);
    const embeddingPromise = service.generateEmbedding(input);

    const embedCommand = worker.postMessage.mock.calls
      .map((c) => c[0])
      .find((msg): msg is Extract<WorkerOutbound, { type: 'embed' }> => msg.type === 'embed');

    expect(embedCommand).toBeDefined();
    expect(embedCommand?.text.length).toBe(512);

    if (!embedCommand) {
      throw new Error('Expected embed command');
    }

    emitMessage(worker, { type: 'embedding', id: embedCommand.id, vector: [0.25, 0.75] });
    await expect(embeddingPromise).resolves.toEqual([0.25, 0.75]);
  });

  it('propagates worker error for a pending embedding request', async () => {
    const service = new EmbeddingService();
    const worker = createWorkerLike();
    mockCreateEmbeddingWorker.mockReturnValue(worker as unknown as Worker);

    const loadPromise = service.loadModel();
    emitMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    const embeddingPromise = service.generateEmbedding('hello');

    const embedCommand = worker.postMessage.mock.calls
      .map((c) => c[0])
      .find((msg): msg is Extract<WorkerOutbound, { type: 'embed' }> => msg.type === 'embed');

    if (!embedCommand) {
      throw new Error('Expected embed command');
    }

    emitMessage(worker, { type: 'error', id: embedCommand.id, error: 'worker failed' });

    await expect(embeddingPromise).rejects.toThrow('worker failed');
  });

  it('unload posts unload command, terminates worker, and resets readiness', async () => {
    const service = new EmbeddingService();
    const worker = createWorkerLike();
    mockCreateEmbeddingWorker.mockReturnValue(worker as unknown as Worker);

    const loadPromise = service.loadModel();
    emitMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    service.unload();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'unload' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(service.isReady).toBe(false);
  });

  it('searchSimilarMessages filters invalid embeddings and sorts by similarity', async () => {
    const service = new EmbeddingService();
    const worker = createWorkerLike();
    mockCreateEmbeddingWorker.mockReturnValue(worker as unknown as Worker);

    const loadPromise = service.loadModel();
    emitMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    const generateSpy = jest.spyOn(service, 'generateEmbedding').mockResolvedValue([1, 0]);

    const candidates: Message[] = [
      makeMessage('m1', 'A', [0.9, 0.1]),
      makeMessage('m2', 'B', [0.1, 0.9]),
      makeMessage('m3', 'C', []),
      makeMessage('m4', 'D', null),
    ];

    const result = await service.searchSimilarMessages('query', candidates, 2);

    expect(generateSpy).toHaveBeenCalledWith('query');
    expect(result).toHaveLength(2);
    expect(result[0].message.id).toBe('m1');
    expect(result[1].message.id).toBe('m2');

    generateSpy.mockRestore();
  });
});
