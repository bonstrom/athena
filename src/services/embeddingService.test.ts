import { EmbeddingService } from './embeddingService';
import { createEmbeddingWorker } from './embeddingWorkerFactory';
import { Message } from '../database/AthenaDb';

jest.mock('./embeddingWorkerFactory', () => ({
  createEmbeddingWorker: jest.fn(),
}));

type PostMessageHandler = (message: unknown) => void;
type TerminateHandler = () => void;

interface MockWorker extends Partial<Worker> {
  postMessage: jest.MockedFunction<PostMessageHandler>;
  terminate: jest.MockedFunction<TerminateHandler>;
  onmessage: ((event: MessageEvent<{ type: string; status?: string; id?: string; vector?: number[]; error?: string }>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

const mockCreateEmbeddingWorker = createEmbeddingWorker as jest.MockedFunction<typeof createEmbeddingWorker>;

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    topicId: 'topic-1',
    forkId: 'main',
    type: 'user',
    content: 'hello',
    isDeleted: false,
    includeInContext: true,
    created: '2026-04-20T00:00:00.000Z',
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    ...overrides,
  };
}

function emitWorkerMessage(worker: MockWorker, data: { type: string; status?: string; id?: string; vector?: number[]; error?: string }): void {
  worker.onmessage?.({ data } as MessageEvent<{ type: string; status?: string; id?: string; vector?: number[]; error?: string }>);
}

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let worker: MockWorker;

  beforeEach(() => {
    worker = {
      postMessage: jest.fn<ReturnType<PostMessageHandler>, Parameters<PostMessageHandler>>(),
      terminate: jest.fn<ReturnType<TerminateHandler>, Parameters<TerminateHandler>>(),
      onmessage: null,
      onerror: null,
    };
    mockCreateEmbeddingWorker.mockReturnValue(worker as Worker);
    service = new EmbeddingService();
  });

  it('loads the embedding model and marks the service as ready', async () => {
    const loadPromise = service.loadModel();

    expect(mockCreateEmbeddingWorker).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'load' });

    emitWorkerMessage(worker, { type: 'status', status: 'ready' });
    await expect(loadPromise).resolves.toBeUndefined();
    expect(service.isReady).toBe(true);
  });

  it('generates an embedding and truncates overly long input before posting to the worker', async () => {
    const loadPromise = service.loadModel();
    emitWorkerMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    const longText = 'a'.repeat(600);
    const embeddingPromise = service.generateEmbedding(longText);

    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'embed',
      id: '1',
      text: longText.slice(0, 512),
    });

    emitWorkerMessage(worker, { type: 'embedding', id: '1', vector: [0.25, 0.75] });

    await expect(embeddingPromise).resolves.toEqual([0.25, 0.75]);
  });

  it('returns the highest scoring embedded messages in descending order', async () => {
    const loadPromise = service.loadModel();
    emitWorkerMessage(worker, { type: 'status', status: 'ready' });
    await loadPromise;

    jest.spyOn(service, 'generateEmbedding').mockResolvedValue([1, 0]);

    const candidates: Message[] = [
      createMessage({ id: 'message-1', embedding: [0.4, 0.6] }),
      createMessage({ id: 'message-2', embedding: [0.9, 0.1] }),
      createMessage({ id: 'message-3', embedding: null }),
    ];

    const results = await service.searchSimilarMessages('query', candidates, 2);

    expect(results).toHaveLength(2);
    expect(results[0].message.id).toBe('message-2');
    expect(results[1].message.id).toBe('message-1');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});
