import type { Message, Topic } from '../../database/AthenaDb';
import type { LlmProvider, UserChatModel } from '../../types/provider';
import { createUserChatModel, createLlmProvider, createTopic, createMessage } from '../../testUtils';
import * as webSearchService from '../../services/webSearchService';
import { MESSAGE_RETRIEVAL_INSTRUCTIONS } from '../../constants';
import { useCuratorStore } from '../CuratorStore';
import { useTopicStore } from '../TopicStore';

const mockDefaultModel: UserChatModel = createUserChatModel();

const testProvider: LlmProvider = createLlmProvider();

interface TopicStoreState {
  topics: Topic[];
  getTopicContext: (topicId: string, excludeAfterId?: string, userQuery?: string) => Promise<Message[]>;
  updateTopicTimestamp: (topicId: string) => Promise<void>;
  generateTopicName: (topicId: string, userMessage: string) => Promise<void>;
  updateTopicScratchpad: (topicId: string, scratchpad: string) => Promise<void>;
  updateTopicModelId: (topicId: string, modelId: string) => Promise<void>;
}

interface ProviderStoreState {
  models: UserChatModel[];
  providers: LlmProvider[];
  getProviderForModel: (model: UserChatModel) => LlmProvider;
  hasWebSearchProvider: () => boolean;
}

interface AuthStoreState {
  customInstructions: string;
  scratchpadRules: string;
  predefinedPrompts: unknown[];
  messageRetrievalEnabled: boolean;
  aiSummaryEnabled: boolean;
  summaryModel?: string;
  replyPredictionEnabled: boolean;
  replyPredictionModel: string;
  llmModelSelected: 'qwen3.5-0.8b' | 'qwen3.5-2b';
  llmModelDownloadStatus: Record<string, unknown>;
}

interface LlmLoopResult {
  finalContent: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens?: number;
  totalCacheCreationTokens?: number;
  totalSearchCount: number;
  toolLoopTrace: unknown[];
  lastResult: {
    content: string;
    rawContent: string;
    promptTokens: number;
    completionTokens: number;
    searchCount: number;
    promptTokensDetails?: { cached_tokens?: number; cache_creation_tokens?: number };
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    completionTokensDetails?: { reasoning_tokens?: number };
  };
}

type AskLlmResult = unknown;
type LlmLoopArgs = Parameters<typeof import('../../services/llmService').orchestrateLlmLoop>;

const mockGetTopicContext = jest.fn<Promise<Message[]>, [string, string | undefined, string | undefined]>();
const mockUpdateTopicTimestamp = jest.fn<Promise<void>, [string]>();
const mockGenerateTopicName = jest.fn<Promise<void>, [string, string]>();
const mockUpdateTopicScratchpad = jest.fn<Promise<void>, [string, string]>();
const mockUpdateTopicModelId = jest.fn<Promise<void>, [string, string]>();
const mockOrchestrateLlmLoop = jest.fn<Promise<LlmLoopResult>, LlmLoopArgs>();
const mockAskLlm = jest.fn<Promise<AskLlmResult>, unknown[]>();
const mockAskLlmStream = jest.fn<Promise<AskLlmResult>, unknown[]>();
const mockAuthGetState = jest.fn<AuthStoreState, []>();
const mockProviderGetState = jest.fn<ProviderStoreState, []>();
const mockAddNotification = jest.fn();
const mockGenerateEmbedding = jest.fn<Promise<number[]>, [string]>();
const mockGetDefaultModel = jest.fn<UserChatModel, []>();
const mockGetAvailableModels = jest.fn<UserChatModel[], []>();

const mockDbGet = jest.fn<Promise<Message | undefined>, [string]>();
const mockDbAdd = jest.fn<Promise<string>, [Message]>();
const mockDbPut = jest.fn<Promise<string>, [Message]>();
const mockDbBulkGet = jest.fn<Promise<(Message | undefined)[]>, [string[]]>();
const mockDbBulkAdd = jest.fn<Promise<unknown>, [Message[]]>();
const mockDbUpdate = jest.fn<Promise<number>, [string, Partial<Message>]>();
const mockDbDelete = jest.fn<Promise<void>, [string]>();
const mockDbBulkDelete = jest.fn<Promise<void>, [string[]]>();
const mockDbTransaction = jest.fn<Promise<void>, [string, unknown, () => Promise<void>]>();
const mockDbSortBy = jest.fn<Promise<Message[]>, [string]>();

const mockBaseTopic: Topic = createTopic({
  id: 'topic-1',
  name: 'Topic',
  createdOn: '2024-01-01T00:00:00.000Z',
  updatedOn: '2024-01-01T00:00:00.000Z',
  activeForkId: 'main',
});

jest.mock('../../components/ModelSelector', () => ({
  calculateCostUSD: jest.fn(() => 1),
  getDefaultModel: (): UserChatModel => mockGetDefaultModel(),
  getAvailableModels: (): UserChatModel[] => mockGetAvailableModels(),
  getPeakMultiplier: jest.fn(() => 1),
}));

jest.mock('../../store/TopicStore', () => ({
  useTopicStore: {
    getState: (): TopicStoreState => ({
      topics: [mockBaseTopic],
      getTopicContext: (...args: [string, string | undefined, string | undefined]) => mockGetTopicContext(...args),
      updateTopicTimestamp: (...args: [string]) => mockUpdateTopicTimestamp(...args),
      generateTopicName: (...args: [string, string]) => mockGenerateTopicName(...args),
      updateTopicScratchpad: (...args: [string, string]) => mockUpdateTopicScratchpad(...args),
      updateTopicModelId: (...args: [string, string]) => mockUpdateTopicModelId(...args),
    }),
  },
}));

jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: {
    getState: (): ProviderStoreState => mockProviderGetState(),
  },
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: (): AuthStoreState => mockAuthGetState(),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: (): { addNotification: typeof mockAddNotification } => ({ addNotification: mockAddNotification }),
  },
}));

jest.mock('../../services/llmService', () => ({
  orchestrateLlmLoop: (...args: LlmLoopArgs): Promise<LlmLoopResult> => mockOrchestrateLlmLoop(...args),
  askLlm: (...args: unknown[]): Promise<AskLlmResult> => mockAskLlm(...args),
  askLlmStream: (...args: unknown[]): Promise<AskLlmResult> => mockAskLlmStream(...args),
  SCRATCHPAD_TOOL: { type: 'function', function: { name: 'update_scratchpad' } },
  READ_MESSAGES_TOOL: { type: 'function', function: { name: 'read_messages' } },
  LIST_MESSAGES_TOOL: { type: 'function', function: { name: 'list_messages' } },
  WEB_SEARCH_TOOL: { type: 'function', function: { name: 'web_search' } },
  FETCH_URL_TOOL: { type: 'function', function: { name: 'fetch_url' } },
}));

jest.mock('../../services/mediaService', () => ({
  generateImage: jest.fn<Promise<string>, [string]>(),
  generateMusic: jest.fn<Promise<string>, [string]>(),
}));

jest.mock('../../services/embeddingService', () => ({
  embeddingService: {
    isReady: false,
    generateEmbedding: (...args: [string]): Promise<number[]> => mockGenerateEmbedding(...args),
  },
}));

jest.mock('../../services/backupService', () => ({
  BackupService: {
    performAutoBackup: jest.fn((): Promise<'ok'> => Promise.resolve('ok')),
  },
}));

jest.mock('../../services/analyticsRollupService', () => ({
  rollupAnalytics: jest.fn((): Promise<void> => Promise.resolve()),
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      get: (...args: [string]): Promise<Message | undefined> => mockDbGet(...args),
      add: (...args: [Message]): Promise<string> => mockDbAdd(...args),
      put: (...args: [Message]): Promise<string> => mockDbPut(...args),
      bulkGet: (...args: [string[]]): Promise<(Message | undefined)[]> => mockDbBulkGet(...args),
      bulkAdd: (...args: [Message[]]): Promise<unknown> => mockDbBulkAdd(...args),
      update: (...args: [string, Partial<Message>]): Promise<number> => mockDbUpdate(...args),
      delete: (...args: [string]): Promise<void> => mockDbDelete(...args),
      bulkDelete: (...args: [string[]]): Promise<void> => mockDbBulkDelete(...args),
      where: (): {
        equals: () => {
          and?: () => { sortBy: (...args: [string]) => Promise<Message[]> };
          sortBy: (...args: [string]) => Promise<Message[]>;
        };
      } => ({
        equals: (): {
          and?: () => { sortBy: (...args: [string]) => Promise<Message[]> };
          sortBy: (...args: [string]) => Promise<Message[]>;
        } => ({
          and: (): { sortBy: (...args: [string]) => Promise<Message[]> } => ({
            sortBy: (...args: [string]): Promise<Message[]> => mockDbSortBy(...args),
          }),
          sortBy: (...args: [string]): Promise<Message[]> => mockDbSortBy(...args),
        }),
      }),
    },
    transaction: (mode: string, table: unknown, callback: () => Promise<void>): Promise<void> => mockDbTransaction(mode, table, callback),

  },
}));

import { useChatStore } from '../../store/ChatStore';
import { calculateCostUSD } from '../../components/ModelSelector';

function createDeferred<Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: (reason: Error) => void;
} {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ChatStore', () => {
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: unknown[]): void => {
      void args;
    });

    jest.clearAllMocks();

    mockGetDefaultModel.mockReturnValue(mockDefaultModel);
    mockGetAvailableModels.mockReturnValue([mockDefaultModel]);
    mockUpdateTopicModelId.mockResolvedValue();

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: jest.fn(() => `id-${Math.random().toString(36).slice(2)}`),
      },
      configurable: true,
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockProviderGetState.mockReturnValue({
      models: [mockDefaultModel],
      providers: [],
      getProviderForModel: () => testProvider,
      hasWebSearchProvider: () => false,
    });

    mockGetTopicContext.mockResolvedValue([]);
    mockUpdateTopicTimestamp.mockResolvedValue();
    mockGenerateTopicName.mockResolvedValue();
    mockUpdateTopicScratchpad.mockResolvedValue();

    mockDbTransaction.mockImplementation(async (_mode: string, _table: unknown, callback: () => Promise<void>) => {
      await callback();
    });
    mockDbAdd.mockResolvedValue('ok');
    mockDbPut.mockResolvedValue('ok');
    mockDbBulkGet.mockResolvedValue([]);
    mockDbBulkAdd.mockResolvedValue(undefined);
    mockDbUpdate.mockResolvedValue(1);
    mockDbDelete.mockResolvedValue();
    mockDbBulkDelete.mockResolvedValue();
    mockDbGet.mockResolvedValue(undefined);
    mockDbSortBy.mockResolvedValue([]);
    mockOrchestrateLlmLoop.mockReset();
    mockAskLlm.mockReset();
    mockAskLlmStream.mockReset();

    useChatStore.setState({
      messagesByTopic: {},
      currentTopicId: 'topic-1',
      sending: false,
      abortController: null,
      currentRequestMessageIds: null,
      pendingSuggestions: null,
      isSuggestionsLoading: false,
      imageGenerationEnabled: false,
      musicGenerationEnabled: false,
      webSearchEnabled: false,
      selectedModel: mockDefaultModel,
      summarizingMessageIds: new Set<string>(),
      failedSummaryMessageIds: new Set<string>(),
    });
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
  });

  it.each(['retry', 'context', 'continuation'] as const)(
    'STR-02 releases request ownership after %s setup fails',
    async (path) => {
      // These failure paths are expected to log; keep the test output clean.
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
        void args;
      });
      try {
        if (path === 'context') mockGetTopicContext.mockRejectedValueOnce(new Error('Context unavailable'));
        await useChatStore
          .getState()
          .sendMessageStream(
            'Hello',
            'topic-1',
            path === 'retry' ? 'missing' : undefined,
            undefined,
            path === 'continuation' ? 'missing' : undefined,
          )
          .catch((): undefined => undefined);
        expect(useChatStore.getState().sending).toBe(false);
        expect(useChatStore.getState().abortController).toBeNull();
        expect(useChatStore.getState().currentRequestMessageIds).toBeNull();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    },
  );

  it('STR-01 keeps a replacement request owned when the stopped request settles', async () => {
    const firstStarted = createDeferred<null>();
    const secondStarted = createDeferred<null>();
    const firstResult = createDeferred<LlmLoopResult>();
    const secondResult = createDeferred<LlmLoopResult>();
    mockOrchestrateLlmLoop
      .mockImplementationOnce((): Promise<LlmLoopResult> => {
        firstStarted.resolve(null);
        return firstResult.promise;
      })
      .mockImplementationOnce((): Promise<LlmLoopResult> => {
        secondStarted.resolve(null);
        return secondResult.promise;
      });
    const first = useChatStore.getState().sendMessageStream('First', 'topic-1');
    await firstStarted.promise;
    await useChatStore.getState().stopSending();
    const second = useChatStore.getState().sendMessageStream('Second', 'topic-1');
    await secondStarted.promise;
    const replacement = useChatStore.getState();
    firstResult.reject(new DOMException('Stopped', 'AbortError'));
    await first;
    const afterOldCleanup = useChatStore.getState();
    await useChatStore.getState().stopSending();
    secondResult.reject(new DOMException('Stopped', 'AbortError'));
    await second;
    expect(afterOldCleanup.sending).toBe(true);
    expect(afterOldCleanup.abortController).toBe(replacement.abortController);
    expect(afterOldCleanup.currentRequestMessageIds).toEqual(replacement.currentRequestMessageIds);
    expect(replacement.abortController?.signal.aborted).toBe(true);
  });

  it('STR-06 ignores a successful late result from a stopped continuation', async () => {
    const assistant = createMessage({ id: 'existing-answer', topicId: 'topic-1', type: 'assistant', content: 'Original answer' });
    mockDbGet.mockResolvedValueOnce(assistant);
    useChatStore.setState({ messagesByTopic: { 'topic-1': [assistant] } });
    const firstStarted = createDeferred<null>();
    const secondStarted = createDeferred<null>();
    const firstResult = createDeferred<LlmLoopResult>();
    const secondResult = createDeferred<LlmLoopResult>();
    mockOrchestrateLlmLoop
      .mockImplementationOnce((): Promise<LlmLoopResult> => {
        firstStarted.resolve(null);
        return firstResult.promise;
      })
      .mockImplementationOnce((): Promise<LlmLoopResult> => {
        secondStarted.resolve(null);
        return secondResult.promise;
      });
    const first = useChatStore.getState().sendMessageStream('Continue', 'topic-1', undefined, undefined, assistant.id);
    await firstStarted.promise;
    await useChatStore.getState().stopSending();
    const second = useChatStore.getState().sendMessageStream('Replacement', 'topic-1');
    await secondStarted.promise;
    const replacement = useChatStore.getState();
    const writesBeforeLateResult = mockDbUpdate.mock.calls.length;
    firstResult.resolve({
      finalContent: 'Canceled partial reply',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalCachedTokens: 0,
      totalCacheCreationTokens: 0,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: { content: 'Canceled partial reply', rawContent: '', promptTokens: 10, completionTokens: 5, searchCount: 0 },
    });
    await first;
    const afterLateResult = useChatStore.getState();

    await useChatStore.getState().stopSending();
    secondResult.reject(new DOMException('Stopped', 'AbortError'));
    await second;

    expect(mockDbUpdate.mock.calls).toHaveLength(writesBeforeLateResult);
    expect(afterLateResult.sending).toBe(true);
    expect(afterLateResult.abortController).toBe(replacement.abortController);
    expect(afterLateResult.currentRequestMessageIds).toEqual(replacement.currentRequestMessageIds);
    expect(afterLateResult.streaming).toEqual(replacement.streaming);
    expect(afterLateResult.messagesByTopic['topic-1']?.find(({ id }) => id === assistant.id)?.content).toBe('Original answer');
  });

  it('STR-06 does not publish a stopped request after its final transaction settles late', async () => {
    const finalCommitStarted = createDeferred<null>();
    const finalCommit = createDeferred<null>();
    let transactions = 0;
    mockDbTransaction.mockImplementation(async (_mode, _table, callback): Promise<void> => {
      await callback();
      if (++transactions === 2) {
        finalCommitStarted.resolve(null);
        await finalCommit.promise;
      }
    });
    const secondStarted = createDeferred<null>();
    const secondResult = createDeferred<LlmLoopResult>();
    mockOrchestrateLlmLoop
      .mockResolvedValueOnce({
        finalContent: 'First reply',
        totalPromptTokens: 10,
        totalCompletionTokens: 5,
        totalCachedTokens: 0,
        totalCacheCreationTokens: 0,
        totalSearchCount: 0,
        toolLoopTrace: [],
        lastResult: { content: 'First reply', rawContent: '', promptTokens: 10, completionTokens: 5, searchCount: 0 },
      })
      .mockImplementationOnce((): Promise<LlmLoopResult> => {
        secondStarted.resolve(null);
        return secondResult.promise;
      });
    const first = useChatStore.getState().sendMessageStream('First', 'topic-1');
    await finalCommitStarted.promise;
    await useChatStore.getState().stopSending();
    const second = useChatStore.getState().sendMessageStream('Second', 'topic-1');
    await secondStarted.promise;
    const replacement = useChatStore.getState();
    finalCommit.resolve(null);
    await first;
    const afterLateCommit = useChatStore.getState();

    await useChatStore.getState().stopSending();
    secondResult.reject(new DOMException('Stopped', 'AbortError'));
    await second;

    expect(afterLateCommit.sending).toBe(true);
    expect(afterLateCommit.abortController).toBe(replacement.abortController);
    expect(afterLateCommit.streaming).toEqual(replacement.streaming);
    expect(mockGenerateTopicName).not.toHaveBeenCalled();
  });

  it('STR-01 ignores a stopped setup continuation after a replacement request starts', async () => {
    const firstContext = createDeferred<Message[]>();
    mockGetTopicContext.mockImplementationOnce((): Promise<Message[]> => firstContext.promise).mockResolvedValueOnce([]);
    const first = useChatStore.getState().sendMessageStream('First setup', 'topic-1');
    await Promise.resolve();
    await useChatStore.getState().stopSending();

    const secondStarted = createDeferred<null>();
    const secondResult = createDeferred<LlmLoopResult>();
    mockOrchestrateLlmLoop.mockImplementationOnce((): Promise<LlmLoopResult> => {
      secondStarted.resolve(null);
      return secondResult.promise;
    });
    const second = useChatStore.getState().sendMessageStream('Second setup', 'topic-1');
    await secondStarted.promise;
    const replacement = useChatStore.getState();

    firstContext.resolve([]);
    await first;

    const afterOldSetup = useChatStore.getState();
    expect(afterOldSetup.sending).toBe(true);
    expect(afterOldSetup.abortController).toBe(replacement.abortController);
    expect(afterOldSetup.currentRequestMessageIds).toEqual(replacement.currentRequestMessageIds);
    expect(afterOldSetup.streaming).toEqual(replacement.streaming);
    expect(mockDbAdd.mock.calls.every(([message]) => message.content !== 'First setup')).toBe(true);

    await useChatStore.getState().stopSending();
    secondResult.reject(new DOMException('Stopped', 'AbortError'));
    await second;
  });

  it('STR-05 clears the request topic cache when stopped after navigation', async () => {
    const pendingUser = createMessage({ id: 'pending-user', topicId: 'topic-1', content: 'Recover me' });
    const pendingAssistant = createMessage({ id: 'pending-assistant', topicId: 'topic-1', type: 'assistant' });
    const otherMessage = createMessage({ id: 'other', topicId: 'topic-2' });
    useChatStore.setState({
      currentTopicId: 'topic-2',
      abortController: new AbortController(),
      currentRequestMessageIds: { userMessageId: pendingUser.id, assistantMessageId: pendingAssistant.id },
      messagesByTopic: { 'topic-1': [pendingUser, pendingAssistant], 'topic-2': [otherMessage] },
    });
    await useChatStore.getState().stopSending();
    expect(mockDbBulkDelete).toHaveBeenCalledWith([pendingUser.id, pendingAssistant.id]);
    expect(useChatStore.getState().messagesByTopic['topic-1']).toEqual([]);
    expect(useChatStore.getState().messagesByTopic['topic-2']).toEqual([otherMessage]);
  });

  it('STR-01 does not clear a replacement request when the stopped deletion completes late', async () => {
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const pendingUser = createMessage({ id: 'a-user', topicId: 'topic-1' });
    const pendingAssistant = createMessage({ id: 'a-assistant', topicId: 'topic-1', type: 'assistant' });
    useChatStore.setState({
      sending: true,
      abortController: controllerA,
      currentRequestMessageIds: { userMessageId: pendingUser.id, assistantMessageId: pendingAssistant.id },
      currentRequestTopicId: 'topic-1',
      messagesByTopic: { 'topic-1': [pendingUser, pendingAssistant] },
    });
    const deletion = createDeferred<null>();
    mockDbBulkDelete.mockReturnValueOnce(deletion.promise);
    const stopping = useChatStore.getState().stopSending();

    // The stopped request finalizes while bulkDelete is still pending.
    useChatStore.setState({
      sending: false,
      abortController: null,
      currentRequestMessageIds: null,
      currentRequestTopicId: null,
      streaming: null,
    });
    const replacement = {
      sending: true,
      abortController: controllerB,
      currentRequestMessageIds: { userMessageId: 'b-user', assistantMessageId: 'b-assistant' },
      currentRequestTopicId: 'topic-2',
      streaming: { topicId: 'topic-2', assistantMessageId: 'b-assistant', content: 'B', reasoning: '' },
    };
    useChatStore.setState(replacement);

    deletion.resolve(null);
    await stopping;

    const afterLateDelete = useChatStore.getState();
    expect(afterLateDelete.sending).toBe(true);
    expect(afterLateDelete.abortController).toBe(controllerB);
    expect(afterLateDelete.currentRequestMessageIds).toEqual(replacement.currentRequestMessageIds);
    expect(afterLateDelete.streaming).toEqual(replacement.streaming);
    expect(afterLateDelete.messagesByTopic['topic-1']).toEqual([]);
  });

  it('sendMessageStream persists a user and assistant message and finalizes assistant content', async () => {
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Assistant final answer',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalCachedTokens: 0,
      totalCacheCreationTokens: 0,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Assistant final answer',
        rawContent: 'Assistant final answer',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('Hello there', 'topic-1');

    const topicMessages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    const userMessage = topicMessages.find((m) => m.type === 'user');
    const assistantMessage = topicMessages.find((m) => m.type === 'assistant');

    expect(userMessage).toBeDefined();
    expect(userMessage?.content).toBe('Hello there');
    expect(assistantMessage).toBeDefined();
    expect(assistantMessage?.content).toBe('Assistant final answer');
    expect(mockOrchestrateLlmLoop).toHaveBeenCalled();
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().abortController).toBeNull();
    expect(useChatStore.getState().currentRequestMessageIds).toBeNull();
  });

  it('assigns cost and cache usage to the assistant message, not the user message', async () => {
    jest.mocked(calculateCostUSD).mockReturnValue(1);
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Assistant final answer',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalCachedTokens: 60,
      totalCacheCreationTokens: 10,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Assistant final answer',
        rawContent: 'Assistant final answer',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
        promptTokensDetails: { cached_tokens: 60, cache_creation_tokens: 10 },
      },
    });

    await useChatStore.getState().sendMessageStream('Hello there', 'topic-1');

    const topicMessages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    const userMessage = topicMessages.find((m) => m.type === 'user');
    const assistantMessage = topicMessages.find((m) => m.type === 'assistant');

    expect(userMessage?.promptTokens).toBe(10);
    expect(userMessage?.totalCost).toBe(0);
    expect(userMessage?.cachedTokens).toBeUndefined();
    expect(userMessage?.cacheCreationTokens).toBeUndefined();

    expect(assistantMessage?.completionTokens).toBe(5);
    expect(assistantMessage?.totalCost).toBe(1);
    expect(assistantMessage?.cachedTokens).toBe(60);
    expect(assistantMessage?.cacheCreationTokens).toBe(10);
  });

  it('streams into transient state without mutating messagesByTopic, then commits', async () => {
    jest.mocked(calculateCostUSD).mockReturnValue(1);
    let onToken: ((chunk: string) => void) | undefined;
    let resolveLoop: ((r: LlmLoopResult) => void) | undefined;
    const loopPromise = new Promise<LlmLoopResult>((resolve) => {
      resolveLoop = resolve;
    });
    mockOrchestrateLlmLoop.mockImplementation(
      (
        _model: unknown,
        _temp: unknown,
        _messages: unknown,
        tokenCb?: (chunk: string) => void,
      ): Promise<LlmLoopResult> => {
        onToken = tokenCb;
        return loopPromise;
      },
    );

    const sendPromise = useChatStore.getState().sendMessageStream('Hello there', 'topic-1');

    // Allow the async setup to reach the LLM loop
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onToken).toBeDefined();

    const messagesBefore = useChatStore.getState().messagesByTopic['topic-1'];

    onToken?.('Hel');

    const streaming = useChatStore.getState().streaming;
    expect(streaming).not.toBeNull();
    expect(streaming?.content).toBe('Hel');
    expect(streaming?.activity).toBe('writing');
    // The historical message array must stay stable during streaming
    expect(useChatStore.getState().messagesByTopic['topic-1']).toBe(messagesBefore);

    resolveLoop?.({
      finalContent: 'Hello there',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalCachedTokens: 0,
      totalCacheCreationTokens: 0,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Hello there',
        rawContent: 'Hello there',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await sendPromise;

    expect(useChatStore.getState().streaming).toBeNull();
    const assistant = useChatStore.getState().messagesByTopic['topic-1']?.find((m) => m.type === 'assistant');
    expect(assistant?.content).toBe('Hello there');
  });

  it('reports real tool activity and returns to thinking when each tool finishes', async () => {
    const searchSpy = jest.spyOn(webSearchService, 'executeWebSearch').mockResolvedValue({
      text: 'Search results', resultCount: 1, billable: false,
    });
    const fetchSpy = jest.spyOn(webSearchService, 'executeFetch').mockResolvedValue({
      text: 'Page content', billable: false,
    });
    mockOrchestrateLlmLoop.mockImplementation(async (...args: LlmLoopArgs): Promise<LlmLoopResult> => {
      const execute = args[6];
      if (!execute) throw new Error('Expected tool execution callback');
      const searching = execute('web_search', '{"query":"test"}', 1);
      expect(useChatStore.getState().streaming?.activity).toBe('searching');
      await searching;
      expect(useChatStore.getState().streaming?.activity).toBe('thinking');
      const reading = execute('fetch_url', '{"url":"https://example.com"}', 1);
      expect(useChatStore.getState().streaming?.activity).toBe('reading');
      await reading;
      expect(useChatStore.getState().streaming?.activity).toBe('thinking');
      await execute('unknown_tool', '{}', 1);
      expect(useChatStore.getState().streaming?.activity).toBe('thinking');
      return {
        finalContent: 'Done', totalPromptTokens: 10, totalCompletionTokens: 5, totalSearchCount: 0,
        toolLoopTrace: [],
        lastResult: { content: 'Done', rawContent: 'Done', promptTokens: 10, completionTokens: 5, searchCount: 0 },
      };
    });
    try {
      await useChatStore.getState().sendMessageStream('Use tools', 'topic-1');
      expect(searchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(useChatStore.getState().streaming).toBeNull();
    } finally {
      searchSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it('sendMessageStream includes clarification and retrieval instructions at runtime', async () => {
    jest.mocked(calculateCostUSD).mockReturnValue(1);
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'ok',
      totalPromptTokens: 1,
      totalCompletionTokens: 1,
      totalCachedTokens: 0,
      totalCacheCreationTokens: 0,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: { content: 'ok', rawContent: 'ok', promptTokens: 1, completionTokens: 1, searchCount: 0 },
    });

    await useChatStore.getState().sendMessageStream('Hello', 'topic-1');

    const llmContext = mockOrchestrateLlmLoop.mock.calls[0][2] as { role: string; content: string | unknown[] }[];
    const contents = llmContext.map((m) => (typeof m.content === 'string' ? m.content : ''));
    expect(contents.some((c) => c.includes('clarifying question'))).toBe(true);
    expect(contents).toContain(MESSAGE_RETRIEVAL_INSTRUCTIONS);
  });

  it('isolates Curator outline requests from chat instructions and tools', async () => {
    const topicState = useTopicStore.getState();
    const topicSpy = jest.spyOn(useTopicStore, 'getState').mockReturnValue({
      ...topicState,
      topics: [createTopic({ id: 'topic-1', mode: 'curator', scratchpad: 'Private chat memory' })],
    });
    const ratingsSpy = jest.spyOn(useCuratorStore.getState(), 'getPastRatingsForContext').mockResolvedValue({
      ratingsContext: 'Prefers practical examples',
      completedCourseNames: 'Completed course',
    });
    mockAuthGetState.mockReturnValue({ ...mockAuthGetState(), customInstructions: 'Always answer in pirate prose' });
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: '{}', totalPromptTokens: 1, totalCompletionTokens: 1, totalSearchCount: 0, toolLoopTrace: [],
      lastResult: { content: '{}', rawContent: '{}', promptTokens: 1, completionTokens: 1, searchCount: 0 },
    });

    try {
      const context = await useChatStore.getState().buildFullContext('topic-1');
      expect(context.map((entry) => entry.sourceLabel)).toEqual(['Curator Instructions', 'Curator Context']);

      await useChatStore.getState().sendMessageStream('[CURATOR] Generate an outline', 'topic-1');

      const call = mockOrchestrateLlmLoop.mock.calls[0];
      expect(call[8]).toEqual([]);
      expect(call[10]?.includeCustomInstructions).toBe(false);
      expect(call[2].map((message) => message.content)).not.toContainEqual(expect.stringContaining('Private chat memory'));
    } finally {
      topicSpy.mockRestore();
      ratingsSpy.mockRestore();
    }
  });

  it('sends the completed answer only once in a contextual summary request', async () => {
    const target = 'Distinctive assistant answer about the Edinburgh inventory.';
    const originalSummarize = useChatStore.getState().maybeSummarize;
    const summarizeSpy = jest.spyOn(useChatStore.getState(), 'maybeSummarize').mockResolvedValue(undefined);
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: target, totalPromptTokens: 1, totalCompletionTokens: 1, totalSearchCount: 0, toolLoopTrace: [],
      lastResult: { content: target, rawContent: target, promptTokens: 1, completionTokens: 1, searchCount: 0 },
    });
    mockAskLlm.mockResolvedValue({ content: 'Discusses the Edinburgh inventory.', promptTokens: 1, completionTokens: 1 });

    try {
      await useChatStore.getState().sendMessageStream('Explain handedness', 'topic-1');
      const summaryCall = summarizeSpy.mock.calls.find((call) => call[1] === target);
      expect(summaryCall).toBeDefined();
      const precedingContext = summaryCall?.[3];
      expect(precedingContext).toBeDefined();
      expect(precedingContext).toContainEqual(expect.objectContaining({ content: 'Explain handedness' }));
      expect(precedingContext).not.toContainEqual(expect.objectContaining({ content: target }));

      await useChatStore.getState()._runSummarize('summary-target', target, precedingContext);
      const requestMessages = mockAskLlm.mock.calls[0][2];
      expect(JSON.stringify(requestMessages).split(target)).toHaveLength(2);
    } finally {
      summarizeSpy.mockRestore();
      useChatStore.setState({ maybeSummarize: originalSummarize });
    }
  });

  it('stopSending aborts, deletes pending user/assistant messages, and returns user content', async () => {
    const abortController = new AbortController();

    useChatStore.setState({
      currentTopicId: 'topic-1',
      abortController,
      currentRequestMessageIds: { userMessageId: 'u-1', assistantMessageId: 'a-1' },
      messagesByTopic: {
        'topic-1': [
          {
            id: 'u-1',
            topicId: 'topic-1',
            forkId: 'main',
            type: 'user',
            content: 'Pending question',
            created: '2024-01-01T00:00:00.000Z',
            isDeleted: false,
            includeInContext: false,
            failed: false,
            promptTokens: 0,
            completionTokens: 0,
            totalCost: 0,
          },
          {
            id: 'a-1',
            topicId: 'topic-1',
            forkId: 'main',
            type: 'assistant',
            content: '',
            created: '2024-01-01T00:00:01.000Z',
            isDeleted: false,
            includeInContext: false,
            failed: false,
            promptTokens: 0,
            completionTokens: 0,
            totalCost: 0,
            parentMessageId: 'u-1',
          },
        ],
      },
    });

    const returnedContent = await useChatStore.getState().stopSending();

    expect(returnedContent).toBe('Pending question');
    expect(mockDbBulkDelete).toHaveBeenCalledWith(['u-1', 'a-1']);
    expect(useChatStore.getState().abortController).toBeNull();
    expect(useChatStore.getState().currentRequestMessageIds).toBeNull();
    expect(useChatStore.getState().messagesByTopic['topic-1']).toEqual([]);
  });

  it('handles a clarifying question as an ordinary assistant reply', async () => {
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Could you clarify which framework you use?',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Could you clarify which framework you use?',
        rawContent: 'Could you clarify which framework you use?',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('I need help', 'topic-1');

    const messages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('user');
    expect(messages[1].type).toBe('assistant');
    expect(messages[1].content).toBe('Could you clarify which framework you use?');
    expect(messages[1].isClarification).toBeUndefined();
    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().streaming).toBeNull();
    expect(useChatStore.getState().currentRequestMessageIds).toBeNull();
  });

  it('does not offer an ask_user tool to the model', async () => {
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Sure.',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Sure.',
        rawContent: 'Sure.',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('Hello', 'topic-1');

    const tools = mockOrchestrateLlmLoop.mock.calls[0][8] as { function: { name: string } }[];
    expect(tools.map((tool) => tool.function.name)).not.toContain('ask_user');
  });

  it('continuation mode appends the answer and reply into the existing assistant message without new bubbles', async () => {
    const existingAssistant = createMessage({
      id: 'assistant-existing',
      type: 'assistant',
      content: 'Which framework do you use?',
    });

    useChatStore.setState({ messagesByTopic: { 'topic-1': [existingAssistant] } });
    mockDbGet.mockResolvedValue(existingAssistant);

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: "Let's set up Vite.",
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: "Let's set up Vite.",
        rawContent: "Let's set up Vite.",
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('React', 'topic-1', undefined, undefined, 'assistant-existing');

    const topicMessages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(topicMessages).toHaveLength(1);
    expect(topicMessages[0].id).toBe('assistant-existing');
    expect(topicMessages[0].type).toBe('assistant');
    expect(topicMessages[0].content).toBe(
      "Which framework do you use?\n\n**Your answer:** React\n\nLet's set up Vite.",
    );
    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  it('regenerateResponse retries using the preceding user message content and id', async () => {
    const userMessage: Message = {
      id: 'u-regen',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Original question',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };
    const assistantMessage: Message = {
      id: 'a-regen',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'assistant',
      content: 'Old answer',
      created: '2024-01-01T00:00:01.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      parentMessageId: 'u-regen',
    };

    useChatStore.setState({
      currentTopicId: 'topic-1',
      messagesByTopic: {
        'topic-1': [userMessage, assistantMessage],
      },
    });

    const sendSpy = jest.spyOn(useChatStore.getState(), 'sendMessageStream').mockResolvedValue();

    await useChatStore.getState().regenerateResponse('a-regen');

    expect(sendSpy).toHaveBeenCalledWith('Original question', 'topic-1', 'u-regen');
    sendSpy.mockRestore();
  });

  it('switchMessageVersion updates activeResponseId on the user message', async () => {
    const userMessage: Message = {
      id: 'u-switch',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Question with multiple answers',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    useChatStore.setState({
      currentTopicId: 'topic-1',
      messagesByTopic: {
        'topic-1': [userMessage],
      },
    });

    await useChatStore.getState().switchMessageVersion('u-switch', 'a-v2');

    expect(mockDbUpdate).toHaveBeenCalledWith('u-switch', { activeResponseId: 'a-v2' });
    const updatedUser = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'u-switch');
    expect(updatedUser?.activeResponseId).toBe('a-v2');
  });

  it('switchMessageVersion is a no-op when no current topic is selected', async () => {
    useChatStore.setState({ currentTopicId: null });

    await useChatStore.getState().switchMessageVersion('u-switch', 'a-v2');

    expect(mockDbUpdate).not.toHaveBeenCalledWith('u-switch', { activeResponseId: 'a-v2' });
  });

  // ========== NEW TEST COVERAGE: addMessage, addMessages, updateMessage, updateMessages ==========

  it('addMessage adds a single message to the store and database', async () => {
    const message: Message = {
      id: 'msg-1',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Test message',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    await useChatStore.getState().addMessage(message);

    expect(mockDbPut).toHaveBeenCalledWith(message);
    const messages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(messages).toContainEqual(message);
  });

  it('addMessage overwrites an existing message via put', async () => {
    const message: Message = {
      id: 'msg-dup',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Duplicate',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    mockDbPut.mockResolvedValue('ok');

    await useChatStore.getState().addMessage(message);

    expect(mockDbPut).toHaveBeenCalledWith(message);
  });

  it('addMessages adds multiple messages and deduplicates existing ones', async () => {
    const messages: Message[] = [
      {
        id: 'msg-a',
        topicId: 'topic-1',
        forkId: 'main',
        type: 'user',
        content: 'Message A',
        created: '2024-01-01T00:00:00.000Z',
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      },
      {
        id: 'msg-b',
        topicId: 'topic-1',
        forkId: 'main',
        type: 'assistant',
        content: 'Message B',
        created: '2024-01-01T00:00:01.000Z',
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      },
    ];

    mockDbBulkGet.mockResolvedValue([undefined, undefined]);
    mockDbBulkAdd.mockResolvedValue(undefined);

    await useChatStore.getState().addMessages(messages);

    expect(mockDbBulkAdd).toHaveBeenCalledWith(messages);
    const storedMessages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(storedMessages.length).toBeGreaterThanOrEqual(2);
  });

  it('addMessages is a no-op when the list is empty', async () => {
    await useChatStore.getState().addMessages([]);

    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  it('updateMessage updates a message in database and state', async () => {
    const existingMessage: Message = {
      id: 'msg-upd',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Old content',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    useChatStore.setState({
      messagesByTopic: {
        'topic-1': [existingMessage],
      },
    });

    const patch: Partial<Message> = { content: 'Updated content', failed: false };
    await useChatStore.getState().updateMessage('msg-upd', patch);

    expect(mockDbUpdate).toHaveBeenCalledWith('msg-upd', patch);
    const updated = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'msg-upd');
    expect(updated?.content).toBe('Updated content');
  });

  it('updateMessage handles database errors gracefully', async () => {
    mockDbUpdate.mockRejectedValue(new Error('Database error'));

    useChatStore.setState({
      messagesByTopic: {
        'topic-1': [
          {
            id: 'msg-err',
            topicId: 'topic-1',
            forkId: 'main',
            type: 'user',
            content: 'Test',
            created: '2024-01-01T00:00:00.000Z',
            isDeleted: false,
            includeInContext: false,
            failed: false,
            promptTokens: 0,
            completionTokens: 0,
            totalCost: 0,
          },
        ],
      },
    });

    await expect(useChatStore.getState().updateMessage('msg-err', { failed: true })).rejects.toThrow('Database error');
    expect(mockAddNotification).toHaveBeenCalledWith('Failed to update message', 'Database error');
  });

  it('updateMessages updates multiple messages in a batch', async () => {
    const messages: Message[] = [
      {
        id: 'batch-1',
        topicId: 'topic-1',
        forkId: 'main',
        type: 'user',
        content: 'Msg 1',
        created: '2024-01-01T00:00:00.000Z',
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      },
      {
        id: 'batch-2',
        topicId: 'topic-1',
        forkId: 'main',
        type: 'assistant',
        content: 'Msg 2',
        created: '2024-01-01T00:00:01.000Z',
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      },
    ];

    useChatStore.setState({
      messagesByTopic: { 'topic-1': messages },
    });

    const updates = [
      { id: 'batch-1', patch: { failed: false } },
      { id: 'batch-2', patch: { includeInContext: true } },
    ];

    await useChatStore.getState().updateMessages(updates);

    expect(mockDbUpdate).toHaveBeenCalledWith('batch-1', { failed: false });
    expect(mockDbUpdate).toHaveBeenCalledWith('batch-2', { includeInContext: true });

    const updated1 = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'batch-1');
    const updated2 = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'batch-2');
    expect(updated1?.failed).toBe(false);
    expect(updated2?.includeInContext).toBe(true);
  });

  it('updateMessages is a no-op when no current topic is selected', async () => {
    useChatStore.setState({ currentTopicId: null });

    const updates = [{ id: 'msg', patch: { failed: true } }];
    await useChatStore.getState().updateMessages(updates);

    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  // ========== editSvgInMessage ==========

  it('editSvgInMessage regenerates the SVG and updates the message in place', async () => {
    const originalSvg = '<svg><circle r="40" /></svg>';
    const messageContent = 'Here is a diagram:\n\n```svg\n<svg><circle r="40" /></svg>\n```\n\nThanks.';
    mockAskLlmStream.mockResolvedValue({ content: '```svg\n<svg><circle r="60" /></svg>\n```' });
    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-svg', content: messageContent }));

    await useChatStore.getState().editSvgInMessage('msg-svg', originalSvg, 'make the circle bigger');

    expect(mockAskLlmStream).toHaveBeenCalledTimes(1);
    const expectedContent = 'Here is a diagram:\n\n```svg\n<svg><circle r="60" /></svg>\n```\n\nThanks.';
    expect(mockDbUpdate).toHaveBeenCalledWith('msg-svg', { content: expectedContent });
  });

  it('editSvgInMessage strips leaked trailing content from the response', async () => {
    const originalSvg = '<svg><circle r="40" /></svg>';
    const messageContent = '```svg\n<svg><circle r="40" /></svg>\n```';
    mockAskLlmStream.mockResolvedValue({
      content: '```svg\n<svg><circle r="60" /></svg>\n<!-- leaked --> <g>...</g>\n```',
    });
    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-svg', content: messageContent }));

    await useChatStore.getState().editSvgInMessage('msg-svg', originalSvg, 'make it bigger');

    expect(mockDbUpdate).toHaveBeenCalledWith('msg-svg', { content: '```svg\n<svg><circle r="60" /></svg>\n```' });
  });

  it('editSvgInMessage throws when the model returns no valid SVG', async () => {
    mockAskLlmStream.mockResolvedValue({ content: 'I cannot do that.' });

    await expect(useChatStore.getState().editSvgInMessage('msg-svg', '<svg></svg>', 'change')).rejects.toThrow(
      'did not return a valid SVG',
    );
  });

  it('editSvgInMessage throws when the message is not found', async () => {
    mockAskLlmStream.mockResolvedValue({ content: '```svg\n<svg></svg>\n```' });
    mockDbGet.mockResolvedValue(undefined);

    await expect(useChatStore.getState().editSvgInMessage('missing', '<svg></svg>', 'change')).rejects.toThrow(
      'Message not found',
    );
  });

  it('updateMessageStateOnly updates state without persisting to database', () => {
    const message: Message = {
      id: 'state-msg',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'assistant',
      content: 'Original',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [message] },
    });

    useChatStore.getState().updateMessageStateOnly('state-msg', { content: 'Updated' });

    const updated = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'state-msg');
    expect(updated?.content).toBe('Updated');
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  // ========== deleteMessage and related functions ==========

  it('deleteMessage removes a user message and its associated assistant response', async () => {
    const userMsg: Message = {
      id: 'u-del',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'User query',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: true,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    const assistantMsg: Message = {
      id: 'a-del',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'assistant',
      content: 'Assistant answer',
      created: '2024-01-01T00:00:01.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      parentMessageId: 'u-del',
    };

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [userMsg, assistantMsg] },
    });

    await useChatStore.getState().deleteMessage('u-del');

    expect(mockDbBulkDelete).toHaveBeenCalledWith(['u-del', 'a-del']);

    const remaining = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(remaining).not.toContainEqual(userMsg);
    expect(remaining).not.toContainEqual(assistantMsg);
  });

  it('deleteMessage removes all assistant versions associated with a user message', async () => {
    const userMsg: Message = {
      id: 'u-del-many',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'User query with multiple assistant variants',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: true,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    const assistantMsgV1: Message = {
      id: 'a-del-v1',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'assistant',
      content: 'Assistant answer v1',
      created: '2024-01-01T00:00:01.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      parentMessageId: 'u-del-many',
    };

    const assistantMsgV2: Message = {
      id: 'a-del-v2',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'assistant',
      content: 'Assistant answer v2',
      created: '2024-01-01T00:00:02.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      parentMessageId: 'u-del-many',
    };

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [userMsg, assistantMsgV1, assistantMsgV2] },
    });

    await useChatStore.getState().deleteMessage('u-del-many');

    expect(mockDbBulkDelete).toHaveBeenCalledWith(['u-del-many', 'a-del-v1', 'a-del-v2']);
    const remaining = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(remaining.map((m) => m.id)).toEqual([]);
  });

  it('deleteMessage clears includeInContext on paired user when deleting assistant message', async () => {
    const userMsg: Message = {
      id: 'u-paired',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Question',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: true,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    const assistantMsg: Message = {
      id: 'a-paired',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'assistant',
      content: 'Answer',
      created: '2024-01-01T00:00:01.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      parentMessageId: 'u-paired',
    };

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [userMsg, assistantMsg] },
    });

    await useChatStore.getState().deleteMessage('a-paired');

    expect(mockDbUpdate).toHaveBeenCalledWith('u-paired', { includeInContext: false });
    const updated = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'u-paired');
    expect(updated?.includeInContext).toBe(false);
  });

  it('deleteMessage is a no-op when no current topic is set', async () => {
    useChatStore.setState({ currentTopicId: null });

    await useChatStore.getState().deleteMessage('msg-id');

    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  // ========== fetchMessages and topic switching ==========

  it('fetchMessages loads messages from database for a topic', async () => {
    const messages: Message[] = [
      {
        id: 'fetch-1',
        topicId: 'topic-1',
        forkId: 'main',
        type: 'user',
        content: 'First',
        created: '2024-01-01T00:00:00.000Z',
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      },
    ];

    mockDbSortBy.mockResolvedValue(messages);

    await useChatStore.getState().fetchMessages('topic-1');

    expect(useChatStore.getState().currentTopicId).toBe('topic-1');
    expect(useChatStore.getState().messagesByTopic['topic-1']).toEqual(messages);
  });

  it('updateMessageContext toggles the includeInContext flag', async () => {
    const message: Message = {
      id: 'ctx-msg',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Context message',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [message] },
    });

    await useChatStore.getState().updateMessageContext('ctx-msg', true);

    expect(mockDbUpdate).toHaveBeenCalledWith('ctx-msg', { includeInContext: true });
    const updated = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.id === 'ctx-msg');
    expect(updated?.includeInContext).toBe(true);
  });

  it('updateMessageContext is a no-op when no current topic is selected', async () => {
    useChatStore.setState({ currentTopicId: null });

    await useChatStore.getState().updateMessageContext('msg', true);

    expect(mockDbUpdate).toHaveBeenCalledWith('msg', { includeInContext: true });
  });

  // ========== State management and UI functions ==========

  it('increaseVisibleMessageCount increases the count by 10', () => {
    useChatStore.setState({ visibleMessageCount: 10 });
    useChatStore.getState().increaseVisibleMessageCount();

    expect(useChatStore.getState().visibleMessageCount).toBe(20);
  });

  it('toggleShowAllMessages switches the showAllMessages flag', () => {
    useChatStore.setState({ showAllMessages: false });
    useChatStore.getState().toggleShowAllMessages();
    expect(useChatStore.getState().showAllMessages).toBe(true);

    useChatStore.getState().toggleShowAllMessages();
    expect(useChatStore.getState().showAllMessages).toBe(false);
  });

  it('resetVisibleMessageCount resets to 10', () => {
    useChatStore.setState({ visibleMessageCount: 50 });
    useChatStore.getState().resetVisibleMessageCount();

    expect(useChatStore.getState().visibleMessageCount).toBe(10);
  });

  it('setInitialLoad updates the isInitialLoad flag', () => {
    useChatStore.setState({ isInitialLoad: true });
    useChatStore.getState().setInitialLoad(false);

    expect(useChatStore.getState().isInitialLoad).toBe(false);
  });

  it('setSelectedModel persists and updates the selected model', () => {
    const localStorageMock = { setItem: jest.fn() };
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

    useChatStore.getState().setSelectedModel(mockDefaultModel);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('athena_selected_model', mockDefaultModel.id);
    expect(useChatStore.getState().selectedModel).toEqual(mockDefaultModel);
  });

  it('setTemperature updates the temperature setting', () => {
    useChatStore.getState().setTemperature(0.5);
    expect(useChatStore.getState().temperature).toBe(0.5);

    useChatStore.getState().setTemperature(2.0);
    expect(useChatStore.getState().temperature).toBe(2.0);
  });

  it('clearSuggestions clears pending suggestions and loading state', () => {
    useChatStore.setState({
      pendingSuggestions: ['Suggestion 1', 'Suggestion 2'],
      isSuggestionsLoading: true,
    });

    useChatStore.getState().clearSuggestions();

    expect(useChatStore.getState().pendingSuggestions).toBeNull();
    expect(useChatStore.getState().isSuggestionsLoading).toBe(false);
  });

  it('setWebSearchEnabled, setImageGenerationEnabled, setMusicGenerationEnabled update feature flags', () => {
    useChatStore.getState().setWebSearchEnabled(true);
    expect(useChatStore.getState().webSearchEnabled).toBe(true);

    useChatStore.getState().setImageGenerationEnabled(true);
    expect(useChatStore.getState().imageGenerationEnabled).toBe(true);

    useChatStore.getState().setMusicGenerationEnabled(true);
    expect(useChatStore.getState().musicGenerationEnabled).toBe(true);

    useChatStore.getState().setWebSearchEnabled(false);
    useChatStore.getState().setImageGenerationEnabled(false);
    useChatStore.getState().setMusicGenerationEnabled(false);

    expect(useChatStore.getState().webSearchEnabled).toBe(false);
    expect(useChatStore.getState().imageGenerationEnabled).toBe(false);
    expect(useChatStore.getState().musicGenerationEnabled).toBe(false);
  });

  it('setSending updates sending state', () => {
    useChatStore.getState().setSending(true);
    expect(useChatStore.getState().sending).toBe(true);

    useChatStore.getState().setSending(false);
    expect(useChatStore.getState().sending).toBe(false);
  });

  it('addMessage continues even when embedding generation fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { embeddingService } = require('../../services/embeddingService') as {
      embeddingService: { isReady: boolean };
    };
    embeddingService.isReady = true;
    mockGenerateEmbedding.mockRejectedValueOnce(new Error('Embedding failed'));

    const message: Message = {
      id: 'msg-embedding-fail',
      topicId: 'topic-1',
      forkId: 'main',
      type: 'user',
      content: 'Trigger embedding',
      created: '2024-01-01T00:00:00.000Z',
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    await expect(useChatStore.getState().addMessage(message)).resolves.toBeUndefined();

    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith(
      '[ChatStore] Failed to generate embedding for message',
      'msg-embe',
      '— message will not appear in RAG results:',
      expect.any(Error),
    );

    embeddingService.isReady = false;
    warnSpy.mockRestore();
  });

  it('setHighlightedMessageId sets and clears highlighted message id', () => {
    useChatStore.setState({ highlightedMessageId: null });
    useChatStore.getState().setHighlightedMessageId('msg-highlight');
    expect(useChatStore.getState().highlightedMessageId).toBe('msg-highlight');
    useChatStore.getState().setHighlightedMessageId(null);
    expect(useChatStore.getState().highlightedMessageId).toBeNull();
  });

  it('initDefaults sets selectedModel to the default model', () => {
    useChatStore.getState().initDefaults();
    expect(mockGetDefaultModel).toHaveBeenCalled();
    expect(useChatStore.getState().selectedModel).toBe(mockDefaultModel);
  });

  it('clearSuggestions clears pending suggestions and loading flag', () => {
    useChatStore.setState({ pendingSuggestions: ['suggestion 1'], isSuggestionsLoading: true });
    useChatStore.getState().clearSuggestions();
    expect(useChatStore.getState().pendingSuggestions).toBeNull();
    expect(useChatStore.getState().isSuggestionsLoading).toBe(false);
  });

  it('preloadTopics returns early when all topics are already loaded', async () => {
    useChatStore.setState({ messagesByTopic: { 'topic-1': [], 'topic-2': [] } });
    await useChatStore.getState().preloadTopics(['topic-1', 'topic-2']);
    expect(mockDbSortBy).not.toHaveBeenCalled();
  });

  it('preloadTopics only fetches unloaded topics', async () => {
    useChatStore.setState({ messagesByTopic: { 'topic-1': [] } });
    mockDbSortBy.mockResolvedValue([createMessage({ id: 'msg-loaded', topicId: 'topic-2' })]);
    await useChatStore.getState().preloadTopics(['topic-1', 'topic-2']);
    expect(mockDbSortBy).toHaveBeenCalledTimes(1);
  });

  it('preloadTopics does nothing when given an empty array', async () => {
    await useChatStore.getState().preloadTopics([]);
    expect(mockDbSortBy).not.toHaveBeenCalled();
  });

  it('preloadTopics evicts least-recently-used topics when the cache exceeds its limit', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `preload-${i}`);
    mockDbSortBy.mockResolvedValue([]);

    await useChatStore.getState().preloadTopics(ids);

    const messagesByTopic = useChatStore.getState().messagesByTopic;
    expect(Object.keys(messagesByTopic).length).toBeLessThanOrEqual(20);
    expect(messagesByTopic['preload-0']).toBeUndefined();
    expect(messagesByTopic['preload-20']).toBeDefined();
  });

  it('stopSending returns null when currentRequestMessageIds is null', async () => {
    useChatStore.setState({ abortController: null, currentRequestMessageIds: null });
    const result = await useChatStore.getState().stopSending();
    expect(result).toBeNull();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  // ========== inline clarification questions ==========

  it('sendMessageStream preserves an inline question as ordinary assistant content', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const inlineAnswer =
      'Nice! That confirms mDNS is running. ## Why it works `nuclear.local` works because your NUC is running an mDNS responder. Want me to help you configure Avahi to broadcast a specific name?';

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: inlineAnswer,
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: inlineAnswer,
        rawContent: inlineAnswer,
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('I need help with my project', 'topic-1');

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.content).toBe(inlineAnswer);
    expect(useChatStore.getState().sending).toBe(false);
  });

  // ========== buildFullContext ==========

  it('CTX-03 previews the same historical image parts that runtime sends', async () => {
    const imageUrl = 'data:image/png;base64,dGVzdA==';
    const historical = createMessage({
      id: 'with-image',
      topicId: 'topic-1',
      content: 'Inspect this image',
      attachments: [{ id: 'image', name: 'test.png', type: 'image/png', size: 4, data: imageUrl }],
    });
    useChatStore.setState({ selectedModel: createUserChatModel({ supportsVision: true }) });
    mockGetTopicContext.mockResolvedValue([historical]);
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Answer',
      totalPromptTokens: 1,
      totalCompletionTokens: 1,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: { content: 'Answer', rawContent: 'Answer', promptTokens: 1, completionTokens: 1, searchCount: 0 },
    });
    const preview = await useChatStore.getState().buildFullContext('topic-1');
    await useChatStore.getState().sendMessageStream('Next question', 'topic-1');
    const expected = {
      role: 'user',
      content: [
        { type: 'text', text: historical.content },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    };
    expect(mockOrchestrateLlmLoop.mock.calls[0][2]).toEqual(expect.arrayContaining([expected]));
    expect(preview.find(({ messageId }) => messageId === historical.id)?.message).toEqual(expected);
  });

  it('buildFullContext returns formatting instructions and scratchpad rules by default', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.length).toBeGreaterThanOrEqual(2);
    expect(context.some((e) => e.sourceLabel === 'Formatting')).toBe(true);
    expect(context.some((e) => e.sourceLabel === 'Scratchpad Rules')).toBe(true);
  });

  it('buildFullContext includes custom instructions when set', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: 'Be concise and helpful.',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Custom Instructions')).toBe(true);
  });

  it('buildFullContext does not include custom instructions when empty', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '   ',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Custom Instructions')).toBe(false);
  });

  it('buildFullContext includes scratchpad content when topic has scratchpad', async () => {
    const topicWithScratchpad = createTopic({
      id: 'topic-1',
      name: 'Topic with scratchpad',
      scratchpad: 'User prefers TypeScript',
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTopicStore } = require('../../store/TopicStore') as {
      useTopicStore: { getState: () => TopicStoreState };
    };

    const originalGetState = useTopicStore.getState;
    useTopicStore.getState = (): TopicStoreState => ({
      topics: [topicWithScratchpad],
      getTopicContext: mockGetTopicContext,
      updateTopicTimestamp: mockUpdateTopicTimestamp,
      generateTopicName: mockGenerateTopicName,
      updateTopicScratchpad: mockUpdateTopicScratchpad,
      updateTopicModelId: mockUpdateTopicModelId,
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    try {
      const context = await useChatStore.getState().buildFullContext('topic-1');
      expect(context.some((e) => e.sourceLabel === 'Scratchpad Content')).toBe(true);
      expect(context.find((e) => e.sourceLabel === 'Scratchpad Content')?.message.content).toEqual(
        expect.stringContaining('User prefers TypeScript'),
      );
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('buildFullContext includes web search instructions when enabled and a search key is configured', async () => {
    const deepseekProvider = createLlmProvider({ id: 'builtin-deepseek', apiKeyEncrypted: 'deepseek-key' });

    mockProviderGetState.mockReturnValue({
      models: [mockDefaultModel],
      providers: [deepseekProvider],
      getProviderForModel: (): LlmProvider => deepseekProvider,
      hasWebSearchProvider: (): boolean => true,
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    useChatStore.setState({ webSearchEnabled: true });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Web Search Instructions')).toBe(true);
  });

  it('buildFullContext skips web search instructions when no search key is configured', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    useChatStore.setState({ webSearchEnabled: true });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Web Search Instructions')).toBe(false);
  });

  it('buildFullContext includes clarification guidance by default', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Clarification Guidance')).toBe(true);
  });

  it('buildFullContext includes message retrieval instructions when enabled', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Message Retrieval Instructions')).toBe(true);
  });

  it('buildFullContext includes predefined prompts when topic has selected prompts', async () => {
    const topicWithPrompts = createTopic({
      id: 'topic-1',
      name: 'Topic',
      selectedPromptIds: ['prompt-1'],
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTopicStore } = require('../../store/TopicStore') as {
      useTopicStore: { getState: () => TopicStoreState };
    };

    const originalGetState = useTopicStore.getState;
    useTopicStore.getState = (): TopicStoreState => ({
      topics: [topicWithPrompts],
      getTopicContext: mockGetTopicContext,
      updateTopicTimestamp: mockUpdateTopicTimestamp,
      generateTopicName: mockGenerateTopicName,
      updateTopicScratchpad: mockUpdateTopicScratchpad,
      updateTopicModelId: mockUpdateTopicModelId,
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [{ id: 'prompt-1', name: 'Helpful', content: 'Be helpful' }],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    try {
      const context = await useChatStore.getState().buildFullContext('topic-1');
      expect(context.some((e) => e.sourceLabel === 'Predefined Prompt: Helpful')).toBe(true);
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('buildFullContext includes conversation messages from topic context', async () => {
    mockGetTopicContext.mockResolvedValue([
      createMessage({ id: 'ctx-1', type: 'user', content: 'Hello', includeInContext: false }),
      createMessage({ id: 'ctx-2', type: 'assistant', content: 'Hi there', includeInContext: true }),
    ]);

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.isConversationMessage === true)).toBe(true);
    expect(context.some((e) => e.sourceLabel === 'Pinned Assistant Message')).toBe(true);
  });

  it('buildFullContext includes user message preview when provided', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1', 'Preview of user message');

    expect(context.some((e) => e.sourceLabel === 'Current User Message (Preview)')).toBe(true);
  });

  it('buildFullContext handles missing topic gracefully', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('nonexistent');

    expect(context.length).toBeGreaterThanOrEqual(2);
  });

  // ========== maybeSummarize ==========

  it('maybeSummarize returns early when aiSummaryEnabled is false and not forced', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    useChatStore.setState({ summarizingMessageIds: new Set<string>() });

    await useChatStore.getState().maybeSummarize('msg-1', 'Short content');
    // If we get here without error, the early return worked (no _runSummarize call)
  });

  it('maybeSummarize returns early when message is already being summarized', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: true,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    useChatStore.setState({ summarizingMessageIds: new Set(['msg-already']) });

    await useChatStore.getState().maybeSummarize('msg-already', 'A'.repeat(501));
    // Should skip because message is already in summarizingMessageIds
  });

  it('maybeSummarize proceeds when forced even with aiSummary disabled and short content', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloaded' },
      summaryModel: 'local',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set<string>(),
      failedSummaryMessageIds: new Set<string>(),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-force', content: 'Short text' }));
    mockAskLlm.mockResolvedValueOnce({
      content: 'A concise summary of the short text.',
      promptTokens: 10,
      completionTokens: 8,
    });

    await useChatStore.getState().maybeSummarize('msg-force', 'Short text', true);

    expect(mockDbUpdate).toHaveBeenCalledWith(
      'msg-force',
      expect.objectContaining({ summary: 'A concise summary of the short text.' }),
    );
  });

  it('maybeSummarize clears previous failure state when retrying', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: true,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: { 'onnx-community/Qwen3.5-0.8B-ONNX': 'downloaded' },
      summaryModel: 'local',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set<string>(),
      failedSummaryMessageIds: new Set(['msg-retry']),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-retry', content: 'A'.repeat(501) }));
    mockAskLlm.mockResolvedValueOnce({ content: 'Summary of the long text.', promptTokens: 10, completionTokens: 6 });

    await useChatStore.getState().maybeSummarize('msg-retry', 'A'.repeat(501));

    expect(useChatStore.getState().failedSummaryMessageIds.has('msg-retry')).toBe(false);
    expect(mockDbUpdate).toHaveBeenCalledWith(
      'msg-retry',
      expect.objectContaining({ summary: 'Summary of the long text.' }),
    );
  });

  // ========== _runSummarize ==========

  it('_runSummarize uses the API for a legacy local setting without a downloaded model', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: { 'onnx-community/Qwen3.5-0.8B-ONNX': 'not_downloaded' },
      summaryModel: 'local',
    });

    useChatStore.setState({ summarizingMessageIds: new Set() });
    mockAskLlm.mockResolvedValueOnce({ content: 'API summary.', promptTokens: 10, completionTokens: 3 });

    await useChatStore.getState()._runSummarize('msg-nodl', 'Some content');

    expect(mockAskLlm).toHaveBeenCalledWith(
      useChatStore.getState().selectedModel,
      0.3,
      expect.any(Array),
      undefined,
      undefined,
      {
        includeCustomInstructions: false,
      },
    );
    expect(mockDbUpdate).toHaveBeenCalledWith(
      'msg-nodl',
      expect.objectContaining({ summary: 'API summary.', summaryTokens: 13 }),
    );
  });

  it('_runSummarize ignores a previously downloaded local model', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-2b',
      llmModelDownloadStatus: { 'onnx-community/Qwen3.5-2B-ONNX': 'downloaded' },
      summaryModel: 'local',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockResolvedValue(
      createMessage({ id: 'msg-qwen2b', content: 'Some moderately long content for summarization test purposes.' }),
    );
    mockAskLlm.mockResolvedValueOnce({ content: 'A brief summary.', promptTokens: 10, completionTokens: 3 });

    await useChatStore.getState()._runSummarize('msg-qwen2b', 'Some moderately long content for summarization test purposes.');


    expect(mockDbUpdate).toHaveBeenCalledWith('msg-qwen2b', expect.objectContaining({ summary: 'A brief summary.' }));
  });

  it('_runSummarize uses cloud model when summaryModel is not local', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      summaryModel: 'cloud',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-cloud', content: 'Some content for cloud summarization.' }));
    mockAskLlm.mockResolvedValueOnce({ content: 'Cloud summary result.', promptTokens: 50 });

    await useChatStore.getState()._runSummarize('msg-cloud', 'Some content for cloud summarization.');

    expect(mockAskLlm).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalledWith(
      'msg-cloud',
      expect.objectContaining({ summary: 'Cloud summary result.' }),
    );
  });

  it('_runSummarize uses context messages for cloud path when provided', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      summaryModel: 'cloud',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-context', content: 'Some content.' }));
    mockAskLlm.mockResolvedValueOnce({ content: 'Summary with context.', promptTokens: 30 });

    const contextMessages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
    ];

    await useChatStore.getState()._runSummarize('msg-context', 'Some content.', contextMessages);

    expect(mockAskLlm).toHaveBeenCalled();
  });

  it('_runSummarize handles empty summary result', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      summaryModel: 'cloud',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-empty', content: 'Some content.' }));
    mockAskLlm.mockResolvedValueOnce({ content: '   ', promptTokens: 10 });

    await useChatStore.getState()._runSummarize('msg-empty', 'Some content.');

    expect(mockAddNotification).toHaveBeenCalledWith('AI returned an empty summary. Try again.', 'warning');
    expect(mockDbUpdate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('_runSummarize warns when generated summary is too short', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      summaryModel: 'cloud',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-short', content: 'Some content for summarization.' }));
    mockAskLlm.mockResolvedValueOnce({ content: 'A', promptTokens: 10 });

    await useChatStore.getState()._runSummarize('msg-short', 'Some content for summarization.');

    expect(mockAddNotification).toHaveBeenCalledWith('Generated summary was empty or too short.', 'warning');
  });

  it('_runSummarize handles errors gracefully and sets failure state', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      summaryModel: 'cloud',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockRejectedValueOnce(new Error('DB error'));

    await useChatStore.getState()._runSummarize('msg-error', 'Some content.');

    expect(useChatStore.getState().failedSummaryMessageIds.has('msg-error')).toBe(true);
    warnSpy.mockRestore();
  });

  it('_runSummarize cleans summary prefixes and quotes from the response', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
      summaryModel: 'cloud',
    });

    useChatStore.setState({
      summarizingMessageIds: new Set(),
      failedSummaryMessageIds: new Set(),
    });

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-clean', content: 'Some content for summarization test.' }));
    mockAskLlm.mockResolvedValueOnce({ content: 'Summary: "This is a cleaned summary"', promptTokens: 10 });

    await useChatStore.getState()._runSummarize('msg-clean', 'Some content for summarization test.');

    expect(mockDbUpdate).toHaveBeenCalledWith(
      'msg-clean',
      expect.objectContaining({ summary: 'This is a cleaned summary' }),
    );
  });

  // ========== fetchMessages with forkId ==========

  it('fetchMessages fetches messages for a specific fork', async () => {
    const topicWithFork = createTopic({
      id: 'topic-fork',
      name: 'Topic',
      activeForkId: 'alt-fork',
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTopicStore } = require('../../store/TopicStore') as {
      useTopicStore: { getState: () => TopicStoreState };
    };

    const originalGetState = useTopicStore.getState;
    useTopicStore.getState = (): TopicStoreState => ({
      topics: [topicWithFork],
      getTopicContext: mockGetTopicContext,
      updateTopicTimestamp: mockUpdateTopicTimestamp,
      generateTopicName: mockGenerateTopicName,
      updateTopicScratchpad: mockUpdateTopicScratchpad,
      updateTopicModelId: mockUpdateTopicModelId,
    });

    try {
      const messages: Message[] = [createMessage({ id: 'fork-msg', topicId: 'topic-fork', forkId: 'alt-fork' })];
      mockDbSortBy.mockResolvedValue(messages);

      await useChatStore.getState().fetchMessages('topic-fork', 'alt-fork');

      expect(useChatStore.getState().currentTopicId).toBe('topic-fork');
      expect(useChatStore.getState().messagesByTopic['topic-fork']).toEqual(messages);
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('fetchMessages switches topics without disturbing an in-flight response on the previous topic', async () => {
    useChatStore.setState({
      currentTopicId: 'topic-1',
      sending: true,
      streaming: { topicId: 'topic-1', assistantMessageId: 'a-stream', content: 'partial', reasoning: '' },
      messagesByTopic: {},
    });

    const messages: Message[] = [createMessage({ id: 'fetch-new', topicId: 'topic-3' })];
    mockDbSortBy.mockResolvedValue(messages);

    await useChatStore.getState().fetchMessages('topic-3');

    expect(useChatStore.getState().currentTopicId).toBe('topic-3');
    expect(useChatStore.getState().messagesByTopic['topic-3']).toEqual(messages);
    expect(useChatStore.getState().streaming?.topicId).toBe('topic-1');
  });

  it('fetchMessages uses cached data when topic is already loaded and no fork specified', async () => {
    useChatStore.setState({
      messagesByTopic: { 'topic-cached': [createMessage({ id: 'cached-msg', topicId: 'topic-cached' })] },
    });

    await useChatStore.getState().fetchMessages('topic-cached');

    expect(useChatStore.getState().currentTopicId).toBe('topic-cached');
    expect(mockDbSortBy).not.toHaveBeenCalled();
  });

  // ========== sendMessageStream additional paths ==========

  it('sendMessageStream handles image generation path', async () => {
    useChatStore.setState({ imageGenerationEnabled: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateImage } = require('../../services/mediaService') as {
      generateImage: jest.Mock<Promise<{ content: string; attachment: object; model: string }>, [string, AbortSignal]>;
    };
    generateImage.mockResolvedValueOnce({
      content: 'Generated image description',
      attachment: { type: 'image/png', data: 'base64data' },
      model: 'dall-e-3',
    });

    await useChatStore.getState().sendMessageStream('Generate an image of a cat', 'topic-1');

    expect(generateImage).toHaveBeenCalledWith('Generate an image of a cat', expect.any(AbortSignal));
    expect(useChatStore.getState().imageGenerationEnabled).toBe(false);

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.content).toBe('Generated image description');
  });

  it('sendMessageStream handles image generation failure', async () => {
    useChatStore.setState({ imageGenerationEnabled: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateImage } = require('../../services/mediaService') as {
      generateImage: jest.Mock<Promise<{ content: string; attachment: object; model: string }>, [string, AbortSignal]>;
    };
    const errSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    generateImage.mockRejectedValueOnce(new Error('Image generation API error'));

    await useChatStore.getState().sendMessageStream('Generate an image', 'topic-1');

    expect(generateImage).toHaveBeenCalled();

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.failed).toBe(true);

    errSpy.mockRestore();
  });

  it('sendMessageStream handles music generation path', async () => {
    useChatStore.setState({ musicGenerationEnabled: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateMusic } = require('../../services/mediaService') as {
      generateMusic: jest.Mock<Promise<{ content: string; attachment: object; model: string }>, [string, AbortSignal]>;
    };
    generateMusic.mockResolvedValueOnce({
      content: 'Generated music description',
      attachment: { type: 'audio/mp3', data: 'base64audiodata' },
      model: 'music-model',
    });

    await useChatStore.getState().sendMessageStream('Generate some music', 'topic-1');

    expect(generateMusic).toHaveBeenCalledWith('Generate some music', expect.any(AbortSignal));
    expect(useChatStore.getState().musicGenerationEnabled).toBe(false);

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.content).toBe('Generated music description');
  });

  it('sendMessageStream handles music generation failure', async () => {
    useChatStore.setState({ musicGenerationEnabled: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateMusic } = require('../../services/mediaService') as {
      generateMusic: jest.Mock<Promise<{ content: string; attachment: object; model: string }>, [string, AbortSignal]>;
    };
    const errSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    generateMusic.mockRejectedValueOnce(new Error('Music generation API error'));

    await useChatStore.getState().sendMessageStream('Generate music', 'topic-1');

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.failed).toBe(true);

    errSpy.mockRestore();
  });

  it('sendMessageStream handles LLM request failure', async () => {
    mockOrchestrateLlmLoop.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const errSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    await useChatStore.getState().sendMessageStream('Test message', 'topic-1');

    expect(mockAddNotification).toHaveBeenCalledWith('LLM request failed', 'API rate limit exceeded');

    const topicMessages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    const userMessage = topicMessages.find((m) => m.type === 'user');
    expect(userMessage?.failed).toBe(true);

    errSpy.mockRestore();
  });

  it('sendMessageStream handles AbortError during streaming', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockOrchestrateLlmLoop.mockRejectedValueOnce(abortError);

    await useChatStore.getState().sendMessageStream('Test message', 'topic-1');

    expect(useChatStore.getState().sending).toBe(false);
    expect(useChatStore.getState().abortController).toBeNull();
  });

  it('sendMessageStream handles AbortError during image generation', async () => {
    useChatStore.setState({ imageGenerationEnabled: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateImage } = require('../../services/mediaService') as {
      generateImage: jest.Mock<Promise<{ content: string; attachment: object; model: string }>, [string, AbortSignal]>;
    };
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    generateImage.mockRejectedValueOnce(abortError);

    await useChatStore.getState().sendMessageStream('Generate an image', 'topic-1');

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.failed).toBe(false);
    expect(useChatStore.getState().sending).toBe(false);
  });

  it('sendMessageStream handles AbortError during music generation', async () => {
    useChatStore.setState({ musicGenerationEnabled: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateMusic } = require('../../services/mediaService') as {
      generateMusic: jest.Mock<Promise<{ content: string; attachment: object; model: string }>, [string, AbortSignal]>;
    };
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    generateMusic.mockRejectedValueOnce(abortError);

    await useChatStore.getState().sendMessageStream('Generate music', 'topic-1');

    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.failed).toBe(false);
    expect(useChatStore.getState().sending).toBe(false);
  });

  it('sendMessageStream handles reply prediction with cloud model', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: true,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Here is the answer to your question.',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Here is the answer to your question.',
        rawContent: 'Here is the answer to your question.',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    mockAskLlm.mockResolvedValueOnce({
      content: '["What about TypeScript?", "Can you show an example?", "How does this compare?"]',
      promptTokens: 20,
    });

    const sendPromise = useChatStore.getState().sendMessageStream('Test message', 'topic-1');
    await sendPromise;

    // Wait for the fire-and-forget reply prediction to complete
    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(useChatStore.getState().pendingSuggestions).toEqual([
      'What about TypeScript?',
      'Can you show an example?',
      'How does this compare?',
    ]);
  });

  it('sendMessageStream uses the API for legacy local reply prediction', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: true,
      replyPredictionModel: 'local',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Here is the answer.',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Here is the answer.',
        rawContent: 'Here is the answer.',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    mockAskLlm.mockResolvedValueOnce({
      content: '["Follow up 1", "Follow up 2", "Follow up 3"]',
      promptTokens: 10,
      completionTokens: 20,
    });

    const sendPromise = useChatStore.getState().sendMessageStream('Test message', 'topic-1');
    await sendPromise;

    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(useChatStore.getState().pendingSuggestions).toEqual(['Follow up 1', 'Follow up 2', 'Follow up 3']);
  });

  it('sendMessageStream handles reply prediction failure gracefully', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: true,
      replyPredictionModel: 'local',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Here is the answer.',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Here is the answer.',
        rawContent: 'Here is the answer.',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    mockAskLlm.mockRejectedValueOnce(new Error('API model error'));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);

    const sendPromise = useChatStore.getState().sendMessageStream('Test message', 'topic-1');
    await sendPromise;

    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 50));

    expect(useChatStore.getState().isSuggestionsLoading).toBe(false);

    warnSpy.mockRestore();
  });

  // ========== deleteMessage error paths ==========

  it('deleteMessage handles DB delete error', async () => {
    const userMsg: Message = createMessage({
      id: 'u-db-err',
      topicId: 'topic-1',
      type: 'user',
      content: 'User query',
      includeInContext: false,
    });

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [userMsg] },
    });

    mockDbBulkDelete.mockRejectedValueOnce(new Error('DB delete failed'));

    await expect(useChatStore.getState().deleteMessage('u-db-err')).rejects.toThrow('DB delete failed');
  });

  // ========== regenerateResponse edge cases ==========

  it('regenerateResponse is a no-op when no current topic is set', async () => {
    useChatStore.setState({ currentTopicId: null });

    const sendSpy = jest.spyOn(useChatStore.getState(), 'sendMessageStream').mockResolvedValue();

    await useChatStore.getState().regenerateResponse('non-existent');

    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it('regenerateResponse is a no-op when assistant message not found', async () => {
    useChatStore.setState({
      currentTopicId: 'topic-1',
      messagesByTopic: { 'topic-1': [] },
    });

    const sendSpy = jest.spyOn(useChatStore.getState(), 'sendMessageStream').mockResolvedValue();

    await useChatStore.getState().regenerateResponse('non-existent');

    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it('regenerateResponse is a no-op when no preceding user message exists', async () => {
    const assistantOnly: Message = createMessage({
      id: 'a-alone',
      topicId: 'topic-1',
      type: 'assistant',
      content: 'Standalone',
    });

    useChatStore.setState({
      currentTopicId: 'topic-1',
      messagesByTopic: { 'topic-1': [assistantOnly] },
    });

    const sendSpy = jest.spyOn(useChatStore.getState(), 'sendMessageStream').mockResolvedValue();

    await useChatStore.getState().regenerateResponse('a-alone');

    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  // ========== sendMessageStream guard and web search routing ==========

  it('sendMessageStream is a no-op when already sending', async () => {
    useChatStore.setState({ sending: true });

    await useChatStore.getState().sendMessageStream('Test', 'topic-1');

    // Should return early without calling DB or LLM
    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  it('sendMessageStream keeps the selected model and registers search tools when enabled', async () => {
    const deepseekProvider = createLlmProvider({ id: 'builtin-deepseek', apiKeyEncrypted: 'deepseek-key' });

    mockProviderGetState.mockReturnValue({
      models: [mockDefaultModel],
      providers: [deepseekProvider],
      getProviderForModel: (): LlmProvider => deepseekProvider,
      hasWebSearchProvider: (): boolean => true,
    });

    useChatStore.setState({ webSearchEnabled: true, selectedModel: mockDefaultModel });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Searched web answer',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 2,
      toolLoopTrace: [],
      lastResult: {
        content: 'Searched web answer',
        rawContent: 'Searched web answer',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 2,
      },
    });

    await useChatStore.getState().sendMessageStream('What is the weather?', 'topic-1');

    const call = mockOrchestrateLlmLoop.mock.calls[0];
    expect(call[0]).toEqual(expect.objectContaining({ id: mockDefaultModel.id }));
    const tools = call[8] as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toEqual(expect.arrayContaining(['web_search', 'fetch_url']));
    expect(mockUpdateTopicModelId).toHaveBeenCalledWith('topic-1', mockDefaultModel.apiModelId);
  });

  it('sendMessageStream is a no-op with empty content', async () => {
    await useChatStore.getState().sendMessageStream('   ', 'topic-1');

    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  it('sendMessageStream is a no-op with null topicId', async () => {
    await useChatStore.getState().sendMessageStream('Test', '');

    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  // ========== sendMessageStream retry path ==========

  it('sendMessageStream retry reuses existing user message and updates activeResponseId', async () => {
    const existingUser: Message = createMessage({
      id: 'u-existing',
      topicId: 'topic-1',
      type: 'user',
      content: 'Existing question',
      failed: true,
    });

    useChatStore.setState({
      messagesByTopic: { 'topic-1': [existingUser] },
    });

    mockDbGet.mockResolvedValue(existingUser);

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Retry answer',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Retry answer',
        rawContent: 'Retry answer',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('Existing question', 'topic-1', 'u-existing');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(mockDbUpdate).toHaveBeenCalledWith('u-existing', expect.objectContaining({ activeResponseId: expect.any(String) }));
  });

  it('fetchMessages restores model from topic.modelId when switching topics', async () => {
    const savedModel: UserChatModel = createUserChatModel({
      id: 'some-uuid-123',
      apiModelId: 'api-saved-model',
      label: 'Saved Model',
    });
    const otherModel: UserChatModel = createUserChatModel({
      id: 'other-uuid',
      apiModelId: 'other-api',
      label: 'Other',
    });
    mockGetAvailableModels.mockReturnValue([otherModel, mockDefaultModel, savedModel]);

    const topicWithModel: Topic = createTopic({
      id: 'topic-saved',
      name: 'Topic with model',
      modelId: 'api-saved-model',
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTopicStore } = require('../../store/TopicStore') as {
      useTopicStore: { getState: () => TopicStoreState };
    };
    const originalGetState = useTopicStore.getState;
    useTopicStore.getState = (): TopicStoreState => ({
      topics: [topicWithModel],
      getTopicContext: mockGetTopicContext,
      updateTopicTimestamp: mockUpdateTopicTimestamp,
      generateTopicName: mockGenerateTopicName,
      updateTopicScratchpad: mockUpdateTopicScratchpad,
      updateTopicModelId: mockUpdateTopicModelId,
    });

    try {
      await useChatStore.getState().fetchMessages('topic-saved');

      expect(useChatStore.getState().selectedModel).toEqual(savedModel);
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('fetchMessages does not change model when topic has no modelId', async () => {
    const defaultModel: UserChatModel = createUserChatModel({ id: 'default-model' });
    useChatStore.setState({ selectedModel: defaultModel });

    const topicWithoutModel: Topic = createTopic({ id: 'topic-no-model', name: 'Topic without model' });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTopicStore } = require('../../store/TopicStore') as {
      useTopicStore: { getState: () => TopicStoreState };
    };
    const originalGetState = useTopicStore.getState;
    useTopicStore.getState = (): TopicStoreState => ({
      topics: [topicWithoutModel],
      getTopicContext: mockGetTopicContext,
      updateTopicTimestamp: mockUpdateTopicTimestamp,
      generateTopicName: mockGenerateTopicName,
      updateTopicScratchpad: mockUpdateTopicScratchpad,
      updateTopicModelId: mockUpdateTopicModelId,
    });

    try {
      await useChatStore.getState().fetchMessages('topic-no-model');

      expect(useChatStore.getState().selectedModel).toEqual(defaultModel);
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('fetchMessages does not change model when saved modelId is unavailable', async () => {
    const defaultModel: UserChatModel = createUserChatModel({ id: 'default-model' });
    useChatStore.setState({ selectedModel: defaultModel });
    mockGetAvailableModels.mockReturnValue([mockDefaultModel]);

    const topicWithStaleModel: Topic = createTopic({
      id: 'topic-stale',
      name: 'Topic with stale model',
      modelId: 'non-existent-model',
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useTopicStore } = require('../../store/TopicStore') as {
      useTopicStore: { getState: () => TopicStoreState };
    };
    const originalGetState = useTopicStore.getState;
    useTopicStore.getState = (): TopicStoreState => ({
      topics: [topicWithStaleModel],
      getTopicContext: mockGetTopicContext,
      updateTopicTimestamp: mockUpdateTopicTimestamp,
      generateTopicName: mockGenerateTopicName,
      updateTopicScratchpad: mockUpdateTopicScratchpad,
      updateTopicModelId: mockUpdateTopicModelId,
    });

    try {
      await useChatStore.getState().fetchMessages('topic-stale');

      expect(useChatStore.getState().selectedModel).toEqual(defaultModel);
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('sendMessageStream persists effective model to the topic', async () => {
    const effectiveModel: UserChatModel = createUserChatModel({
      id: 'uuid-effective',
      apiModelId: 'api-effective-model',
      label: 'Effective',
    });
    mockGetAvailableModels.mockReturnValue([mockDefaultModel, effectiveModel]);

    useChatStore.setState({ selectedModel: effectiveModel });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Response with model',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Response with model',
        rawContent: 'Response with model',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('Test message', 'topic-1');

    expect(mockUpdateTopicModelId).toHaveBeenCalledWith('topic-1', 'api-effective-model');
  });

  it('sendMessageStream persists the selected model when web search is enabled', async () => {
    const deepseekProvider = createLlmProvider({ id: 'builtin-deepseek', apiKeyEncrypted: 'deepseek-key' });
    mockGetAvailableModels.mockReturnValue([mockDefaultModel]);

    mockProviderGetState.mockReturnValue({
      models: [mockDefaultModel],
      providers: [deepseekProvider],
      getProviderForModel: (): LlmProvider => deepseekProvider,
      hasWebSearchProvider: (): boolean => true,
    });

    useChatStore.setState({ webSearchEnabled: true, selectedModel: mockDefaultModel });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Web search response',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 2,
      toolLoopTrace: [],
      lastResult: {
        content: 'Web search response',
        rawContent: 'Web search response',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 2,
      },
    });

    await useChatStore.getState().sendMessageStream('Search query', 'topic-1');

    expect(mockUpdateTopicModelId).toHaveBeenCalledWith('topic-1', mockDefaultModel.apiModelId);
  });
});
