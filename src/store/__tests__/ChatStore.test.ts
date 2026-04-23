import type { Message, Topic } from '../../database/AthenaDb';
import type { LlmProvider, UserChatModel } from '../../types/provider';

const testModel: UserChatModel = {
  id: 'test-model',
  label: 'Test Model',
  apiModelId: 'test-model',
  providerId: 'test-provider',
  input: 0,
  cachedInput: 0,
  output: 0,
  streaming: false,
  supportsTemperature: true,
  supportsTools: true,
  supportsVision: false,
  supportsFiles: false,
  contextWindow: 128000,
  forceTemperature: null,
  enforceAlternatingRoles: false,
  maxTokensOverride: null,
  isBuiltIn: false,
  enabled: true,
};

const testProvider: LlmProvider = {
  id: 'test-provider',
  name: 'Test Provider',
  baseUrl: 'https://example.com/v1/chat/completions',
  messageFormat: 'openai',
  apiKeyEncrypted: '',
  supportsWebSearch: false,
  requiresReasoningFallback: false,
  payloadOverridesJson: '',
  isBuiltIn: false,
};

interface TopicStoreState {
  topics: Topic[];
  getTopicContext: (topicId: string, excludeAfterId?: string, userQuery?: string) => Promise<Message[]>;
  updateTopicTimestamp: (topicId: string) => Promise<void>;
  generateTopicName: (topicId: string, userMessage: string) => Promise<void>;
  updateTopicScratchpad: (topicId: string, scratchpad: string) => Promise<void>;
}

interface ProviderStoreState {
  models: UserChatModel[];
  getProviderForModel: (model: UserChatModel) => LlmProvider;
}

interface AuthStoreState {
  customInstructions: string;
  scratchpadRules: string;
  predefinedPrompts: unknown[];
  messageRetrievalEnabled: boolean;
  askUserEnabled: boolean;
  aiSummaryEnabled: boolean;
  replyPredictionEnabled: boolean;
  replyPredictionModel: string;
  llmModelSelected: 'qwen3.5-0.8b' | 'qwen3.5-2b';
  llmModelDownloadStatus: Record<string, unknown>;
}

interface LlmLoopResult {
  finalContent: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalSearchCount: number;
  toolLoopTrace: unknown[];
  lastResult: {
    content: string;
    rawContent: string;
    promptTokens: number;
    completionTokens: number;
    searchCount: number;
  };
}

type AskLlmResult = unknown;

const mockGetTopicContext = jest.fn<Promise<Message[]>, [string, string | undefined, string | undefined]>();
const mockUpdateTopicTimestamp = jest.fn<Promise<void>, [string]>();
const mockGenerateTopicName = jest.fn<Promise<void>, [string, string]>();
const mockUpdateTopicScratchpad = jest.fn<Promise<void>, [string, string]>();
const mockOrchestrateLlmLoop = jest.fn<Promise<LlmLoopResult>, unknown[]>();
const mockAskLlm = jest.fn<Promise<AskLlmResult>, unknown[]>();
const mockAuthGetState = jest.fn<AuthStoreState, []>();
const mockProviderGetState = jest.fn<ProviderStoreState, []>();
const mockAddNotification = jest.fn();
const mockGenerateEmbedding = jest.fn<Promise<number[]>, [string]>();

const mockDbGet = jest.fn<Promise<Message | undefined>, [string]>();
const mockDbAdd = jest.fn<Promise<string>, [Message]>();
const mockDbBulkGet = jest.fn<Promise<(Message | undefined)[]>, [string[]]>();
const mockDbBulkAdd = jest.fn<Promise<unknown>, [Message[]]>();
const mockDbUpdate = jest.fn<Promise<number>, [string, Partial<Message>]>();
const mockDbDelete = jest.fn<Promise<void>, [string]>();
const mockDbBulkDelete = jest.fn<Promise<void>, [string[]]>();
const mockDbTransaction = jest.fn<Promise<void>, [string, unknown, () => Promise<void>]>();
const mockDbSortBy = jest.fn<Promise<Message[]>, [string]>();

const baseTopic: Topic = {
  id: 'topic-1',
  name: 'Topic',
  createdOn: '2024-01-01T00:00:00.000Z',
  updatedOn: '2024-01-01T00:00:00.000Z',
  isDeleted: false,
  activeForkId: 'main',
};

jest.mock('../../components/ModelSelector', () => ({
  calculateCostSEK: jest.fn(() => 1),
  getDefaultModel: jest.fn(() => testModel),
}));

jest.mock('../../store/TopicStore', () => ({
  useTopicStore: {
    getState: (): TopicStoreState => ({
      topics: [baseTopic],
      getTopicContext: (...args: [string, string | undefined, string | undefined]) => mockGetTopicContext(...args),
      updateTopicTimestamp: (...args: [string]) => mockUpdateTopicTimestamp(...args),
      generateTopicName: (...args: [string, string]) => mockGenerateTopicName(...args),
      updateTopicScratchpad: (...args: [string, string]) => mockUpdateTopicScratchpad(...args),
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
  orchestrateLlmLoop: (...args: unknown[]): Promise<LlmLoopResult> => mockOrchestrateLlmLoop(...args),
  askLlm: (...args: unknown[]): Promise<AskLlmResult> => mockAskLlm(...args),
  SCRATCHPAD_TOOL: { type: 'function', function: { name: 'update_scratchpad' } },
  READ_MESSAGES_TOOL: { type: 'function', function: { name: 'read_messages' } },
  LIST_MESSAGES_TOOL: { type: 'function', function: { name: 'list_messages' } },
  ASK_USER_TOOL: { type: 'function', function: { name: 'ask_user' } },
}));

jest.mock('../../services/mediaService', () => ({
  generateImage: jest.fn<Promise<string>, [string]>(),
  generateMusic: jest.fn<Promise<string>, [string]>(),
}));

jest.mock('../../services/llmSuggestionService', () => ({
  llmSuggestionService: {
    getCompletion: jest.fn<Promise<string>, [string]>(),
  },
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

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      get: (...args: [string]): Promise<Message | undefined> => mockDbGet(...args),
      add: (...args: [Message]): Promise<string> => mockDbAdd(...args),
      bulkGet: (...args: [string[]]): Promise<(Message | undefined)[]> => mockDbBulkGet(...args),
      bulkAdd: (...args: [Message[]]): Promise<unknown> => mockDbBulkAdd(...args),
      update: (...args: [string, Partial<Message>]): Promise<number> => mockDbUpdate(...args),
      delete: (...args: [string]): Promise<void> => mockDbDelete(...args),
      bulkDelete: (...args: [string[]]): Promise<void> => mockDbBulkDelete(...args),
      where: (): { equals: () => { and: () => { sortBy: (...args: [string]) => Promise<Message[]> } } } => ({
        equals: (): { and: () => { sortBy: (...args: [string]) => Promise<Message[]> } } => ({
          and: (): { sortBy: (...args: [string]) => Promise<Message[]> } => ({
            sortBy: (...args: [string]): Promise<Message[]> => mockDbSortBy(...args),
          }),
        }),
      }),
    },
    transaction: (mode: string, table: unknown, callback: () => Promise<void>): Promise<void> => mockDbTransaction(mode, table, callback),
  },
}));

import { useChatStore } from '../../store/ChatStore';

describe('ChatStore', () => {
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: unknown[]): void => {
      void args;
    });

    jest.clearAllMocks();

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
      askUserEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockProviderGetState.mockReturnValue({
      models: [testModel],
      getProviderForModel: () => testProvider,
    });

    mockGetTopicContext.mockResolvedValue([]);
    mockUpdateTopicTimestamp.mockResolvedValue();
    mockGenerateTopicName.mockResolvedValue();
    mockUpdateTopicScratchpad.mockResolvedValue();

    mockDbTransaction.mockImplementation(async (_mode: string, _table: unknown, callback: () => Promise<void>) => {
      await callback();
    });
    mockDbAdd.mockResolvedValue('ok');
    mockDbBulkGet.mockResolvedValue([]);
    mockDbBulkAdd.mockResolvedValue(undefined);
    mockDbUpdate.mockResolvedValue(1);
    mockDbDelete.mockResolvedValue();
    mockDbBulkDelete.mockResolvedValue();
    mockDbGet.mockResolvedValue(undefined);
    mockDbSortBy.mockResolvedValue([]);

    useChatStore.setState({
      messagesByTopic: {},
      currentTopicId: 'topic-1',
      sending: false,
      abortController: null,
      currentRequestMessageIds: null,
      pendingUserQuestion: null,
      pendingSuggestions: null,
      isSuggestionsLoading: false,
      imageGenerationEnabled: false,
      musicGenerationEnabled: false,
      webSearchEnabled: false,
      selectedModel: testModel,
    });
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
  });

  it('sendMessageStream persists a user and assistant message and finalizes assistant content', async () => {
    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Assistant final answer',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
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
    expect(mockDbDelete).toHaveBeenCalledWith('u-1');
    expect(mockDbDelete).toHaveBeenCalledWith('a-1');
    expect(useChatStore.getState().abortController).toBeNull();
    expect(useChatStore.getState().currentRequestMessageIds).toBeNull();
    expect(useChatStore.getState().messagesByTopic['topic-1']).toEqual([]);
  });

  it('ask_user flow sets pending question and resumes after resolvePendingQuestion', async () => {
    type ExecuteToolCallback = (toolName: string, argsJson: string) => Promise<string>;

    mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]) => {
      const executeTool = args[6] as ExecuteToolCallback | undefined;
      if (!executeTool) throw new Error('Expected execute tool callback');

      const answer = await executeTool('ask_user', JSON.stringify({ question: 'Could you clarify?', context: 'Need details.' }));

      return {
        finalContent: `Thanks for clarifying: ${answer}`,
        totalPromptTokens: 10,
        totalCompletionTokens: 5,
        totalSearchCount: 0,
        toolLoopTrace: [],
        lastResult: {
          content: `Thanks for clarifying: ${answer}`,
          rawContent: `Thanks for clarifying: ${answer}`,
          promptTokens: 10,
          completionTokens: 5,
          searchCount: 0,
        },
      };
    });

    const sendPromise = useChatStore.getState().sendMessageStream('I need help', 'topic-1');

    for (let i = 0; i < 20; i++) {
      if (useChatStore.getState().pendingUserQuestion) break;
      await Promise.resolve();
    }

    const pending = useChatStore.getState().pendingUserQuestion;
    expect(pending).toBeDefined();
    expect(pending?.question).toBe('Could you clarify?');

    useChatStore.getState().resolvePendingQuestion('Here are more details');
    await sendPromise;

    expect(useChatStore.getState().pendingUserQuestion).toBeNull();
    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.content).toBe('Thanks for clarifying: Here are more details');
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

    expect(mockDbAdd).toHaveBeenCalledWith(message);
    const messages = useChatStore.getState().messagesByTopic['topic-1'] ?? [];
    expect(messages).toContainEqual(message);
  });

  it('addMessage does not re-add an existing message', async () => {
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

    mockDbGet.mockResolvedValue(message);

    await useChatStore.getState().addMessage(message);

    expect(mockDbAdd).not.toHaveBeenCalled();
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

    useChatStore.getState().setSelectedModel(testModel);

    expect(localStorageMock.setItem).toHaveBeenCalledWith('athena_selected_model', testModel.id);
    expect(useChatStore.getState().selectedModel).toEqual(testModel);
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

  it('resolvePendingQuestion resolves pending user question and clears it', () => {
    const mockResolve = jest.fn();
    useChatStore.setState({
      pendingUserQuestion: {
        question: 'What is your name?',
        context: 'User context',
        resolve: mockResolve,
        reject: jest.fn(),
      },
    });

    useChatStore.getState().resolvePendingQuestion('My name is AI');

    expect(mockResolve).toHaveBeenCalledWith('My name is AI');
    expect(useChatStore.getState().pendingUserQuestion).toBeNull();
  });

  it('resolvePendingQuestion is a no-op when there is no pending question', () => {
    useChatStore.setState({ pendingUserQuestion: null });
    expect(() => useChatStore.getState().resolvePendingQuestion('Answer')).not.toThrow();
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
    expect(warnSpy).toHaveBeenCalledWith('Failed to generate embedding for message:', expect.any(Error));

    embeddingService.isReady = false;
    warnSpy.mockRestore();
  });

  it('ask_user pending question times out and clears pending state', async () => {
    jest.useFakeTimers();

    type ExecuteToolCallback = (toolName: string, argsJson: string) => Promise<string>;
    mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]) => {
      const executeTool = args[6] as ExecuteToolCallback | undefined;
      if (!executeTool) throw new Error('Expected execute tool callback');

      const answer = await executeTool('ask_user', JSON.stringify({ question: 'Could you clarify?', context: 'Need details.' }));
      return {
        finalContent: `Timed answer: ${answer}`,
        totalPromptTokens: 10,
        totalCompletionTokens: 5,
        totalSearchCount: 0,
        toolLoopTrace: [],
        lastResult: {
          content: `Timed answer: ${answer}`,
          rawContent: `Timed answer: ${answer}`,
          promptTokens: 10,
          completionTokens: 5,
          searchCount: 0,
        },
      };
    });

    const sendPromise = useChatStore.getState().sendMessageStream('I need help', 'topic-1');

    for (let i = 0; i < 20; i++) {
      if (useChatStore.getState().pendingUserQuestion) break;
      await Promise.resolve();
    }

    expect(useChatStore.getState().pendingUserQuestion).toBeDefined();

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    await sendPromise;

    expect(useChatStore.getState().pendingUserQuestion).toBeNull();
    const assistant = (useChatStore.getState().messagesByTopic['topic-1'] ?? []).find((m) => m.type === 'assistant');
    expect(assistant?.content).toContain('did not respond in time');

    jest.useRealTimers();
  });

  it('routes follow-up answer to current topic in fallback-style pending handler', async () => {
    const sendSpy = jest.spyOn(useChatStore.getState(), 'sendMessageStream').mockResolvedValue();
    const capturedTopicId = 'topic-1';

    useChatStore.setState({
      currentTopicId: 'topic-2',
      pendingUserQuestion: {
        question: 'Could you clarify?',
        context: 'Fallback: model asked inline instead of using ask_user tool.',
        resolve: (answer: string): void => {
          useChatStore.setState({ pendingUserQuestion: null });
          const resolvedTopicId = useChatStore.getState().currentTopicId ?? capturedTopicId;
          void useChatStore.getState().sendMessageStream(answer, resolvedTopicId);
        },
        reject: (): void => {
          useChatStore.setState({ pendingUserQuestion: null });
        },
      },
    });

    useChatStore.getState().resolvePendingQuestion('Use Node 20');
    await Promise.resolve();

    expect(sendSpy).toHaveBeenCalledWith('Use Node 20', 'topic-2');
    sendSpy.mockRestore();
  });
});
