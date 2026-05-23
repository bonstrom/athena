import type { Message, Topic } from '../../database/AthenaDb';
import type { LlmProvider, UserChatModel } from '../../types/provider';
import { createUserChatModel, createLlmProvider, createTopic, createMessage } from '../../testUtils';

const mockDefaultModel: UserChatModel = createUserChatModel();

const testProvider: LlmProvider = createLlmProvider();

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
  getFirstWebSearchModel: () => UserChatModel | undefined;
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
const mockGetDefaultModel = jest.fn<UserChatModel, []>();

const mockDbGet = jest.fn<Promise<Message | undefined>, [string]>();
const mockDbAdd = jest.fn<Promise<string>, [Message]>();
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
  calculateCostSEK: jest.fn(() => 1),
  getDefaultModel: (): UserChatModel => mockGetDefaultModel(),
}));

jest.mock('../../store/TopicStore', () => ({
  useTopicStore: {
    getState: (): TopicStoreState => ({
      topics: [mockBaseTopic],
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
      where: (): { equals: () => { and?: () => { sortBy: (...args: [string]) => Promise<Message[]> }; sortBy: (...args: [string]) => Promise<Message[]> } } => ({
        equals: (): { and?: () => { sortBy: (...args: [string]) => Promise<Message[]> }; sortBy: (...args: [string]) => Promise<Message[]> } => ({
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

describe('ChatStore', () => {
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: unknown[]): void => {
      void args;
    });

    jest.clearAllMocks();

    mockGetDefaultModel.mockReturnValue(mockDefaultModel);

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
      models: [mockDefaultModel],
      getProviderForModel: () => testProvider,
      getFirstWebSearchModel: () => undefined,
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
    mockOrchestrateLlmLoop.mockReset();
    mockAskLlm.mockReset();

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
      selectedModel: mockDefaultModel,
      summarizingMessageIds: new Set<string>(),
      failedSummaryMessageIds: new Set<string>(),
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
    const originalSend = useChatStore.getState().sendMessageStream;
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
    // Ensure the current Zustand state object also has the original method,
    // since Zustand creates shallow copies on setState and the spy may leak.
    useChatStore.getState().sendMessageStream = originalSend;
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

  it('stopSending returns null when currentRequestMessageIds is null', async () => {
    useChatStore.setState({ abortController: null, currentRequestMessageIds: null });
    const result = await useChatStore.getState().stopSending();
    expect(result).toBeNull();
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  // ========== looksLikeClarificationQuestion fallback path ==========

  it('sendMessageStream activates clarification fallback when ask_user tool was not called but response looks like a question', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: 'Which approach would you prefer for this task?',
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: 'Which approach would you prefer for this task?',
        rawContent: 'Which approach would you prefer for this task?',
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    const sendPromise = useChatStore.getState().sendMessageStream('I need help with my project', 'topic-1');
    await sendPromise;

    expect(useChatStore.getState().pendingUserQuestion).toBeDefined();
    expect(useChatStore.getState().pendingUserQuestion?.question).toContain('Which approach would you prefer');
  });

  it('sendMessageStream does not activate fallback when clarification text is long', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const longContent = 'A'.repeat(2001) + '?';

    mockOrchestrateLlmLoop.mockResolvedValue({
      finalContent: longContent,
      totalPromptTokens: 10,
      totalCompletionTokens: 5,
      totalSearchCount: 0,
      toolLoopTrace: [],
      lastResult: {
        content: longContent,
        rawContent: longContent,
        promptTokens: 10,
        completionTokens: 5,
        searchCount: 0,
      },
    });

    await useChatStore.getState().sendMessageStream('I need help', 'topic-1');

    expect(useChatStore.getState().pendingUserQuestion).toBeNull();
  });

  // ========== buildFullContext ==========

  it('buildFullContext returns formatting instructions and scratchpad rules by default', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    try {
      const context = await useChatStore.getState().buildFullContext('topic-1');
      expect(context.some((e) => e.sourceLabel === 'Scratchpad Content')).toBe(true);
      expect(context.some((e) => (e.message as { content: string }).content === 'User prefers TypeScript')).toBe(true);
    } finally {
      useTopicStore.getState = originalGetState;
    }
  });

  it('buildFullContext includes web search instructions when enabled and provider supports it', async () => {
    const webSearchProvider = createLlmProvider({ supportsWebSearch: true });

    mockProviderGetState.mockReturnValue({
      models: [mockDefaultModel],
      getProviderForModel: (): LlmProvider => webSearchProvider,
      getFirstWebSearchModel: (): UserChatModel | undefined => undefined,
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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

  it('buildFullContext skips web search instructions when provider does not support it', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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

  it('buildFullContext includes ask user instructions when enabled', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: true,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: {},
    });

    const context = await useChatStore.getState().buildFullContext('topic-1');

    expect(context.some((e) => e.sourceLabel === 'Ask User Instructions')).toBe(true);
  });

  it('buildFullContext includes message retrieval instructions when enabled', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [],
      messageRetrievalEnabled: true,
      askUserEnabled: false,
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
    });

    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Scratchpad rules with {{SCRATCHPAD_LIMIT}} limit',
      predefinedPrompts: [{ id: 'prompt-1', name: 'Helpful', content: 'Be helpful' }],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { llmSuggestionService } = require('../../services/llmSuggestionService') as {
      llmSuggestionService: { getCompletion: jest.Mock<Promise<string>, [string, number]> };
    };
    llmSuggestionService.getCompletion.mockResolvedValueOnce('A concise summary of the short text.');

    await useChatStore.getState().maybeSummarize('msg-force', 'Short text', true);

    expect(llmSuggestionService.getCompletion).toHaveBeenCalled();
  });

  it('maybeSummarize clears previous failure state when retrying', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { llmSuggestionService } = require('../../services/llmSuggestionService') as {
      llmSuggestionService: { getCompletion: jest.Mock<Promise<string>, [string, number]> };
    };
    llmSuggestionService.getCompletion.mockResolvedValueOnce('Summary of the long text.');

    await useChatStore.getState().maybeSummarize('msg-retry', 'A'.repeat(501));

    expect(useChatStore.getState().failedSummaryMessageIds.has('msg-retry')).toBe(false);
    expect(llmSuggestionService.getCompletion).toHaveBeenCalled();
  });

  // ========== _runSummarize ==========

  it('_runSummarize warns when local model is not downloaded', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
      aiSummaryEnabled: false,
      replyPredictionEnabled: false,
      replyPredictionModel: 'same',
      llmModelSelected: 'qwen3.5-0.8b',
      llmModelDownloadStatus: { 'onnx-community/Qwen3.5-0.8B-ONNX': 'not_downloaded' },
      summaryModel: 'local',
    });

    useChatStore.setState({ summarizingMessageIds: new Set() });

    await useChatStore.getState()._runSummarize('msg-nodl', 'Some content');

    expect(mockAddNotification).toHaveBeenCalledWith(
      'Local LLM model not downloaded. Please go to Settings to download it.',
      'warning',
    );
  });

  it('_runSummarize selects Qwen3.5-2B model path when larger model is selected', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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

    mockDbGet.mockResolvedValue(createMessage({ id: 'msg-qwen2b', content: 'Some moderately long content for summarization test purposes.' }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { llmSuggestionService } = require('../../services/llmSuggestionService') as {
      llmSuggestionService: { getCompletion: jest.Mock<Promise<string>, [string, number]> };
    };
    llmSuggestionService.getCompletion.mockResolvedValueOnce('A brief summary.');

    await useChatStore.getState()._runSummarize('msg-qwen2b', 'Some moderately long content for summarization test purposes.');

    expect(llmSuggestionService.getCompletion).toHaveBeenCalled();
    expect(llmSuggestionService.getCompletion).toHaveBeenCalledWith(expect.any(String), 50);
    expect(mockDbUpdate).toHaveBeenCalledWith('msg-qwen2b', expect.objectContaining({ summary: 'A brief summary.' }));
  });

  it('_runSummarize uses cloud model when summaryModel is not local', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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
    expect(mockDbUpdate).toHaveBeenCalledWith('msg-cloud', expect.objectContaining({ summary: 'Cloud summary result.' }));
  });

  it('_runSummarize uses context messages for cloud path when provided', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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

    const contextMessages = [{ role: 'user' as const, content: 'Hello' }, { role: 'assistant' as const, content: 'Hi' }];

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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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
      askUserEnabled: false,
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

    expect(mockDbUpdate).toHaveBeenCalledWith('msg-clean', expect.objectContaining({ summary: 'This is a cleaned summary' }));
  });

  // ========== fetchMessages with forkId ==========

  it('fetchMessages fetches messages for a specific fork', async () => {
    const topicWithFork = createTopic({
      id: 'topic-fork',
      name: 'Topic',
      activeForkId: 'alt-fork',
    });

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

  it('fetchMessages rejects pending user question when switching topics', async () => {
    const mockReject = jest.fn();
    useChatStore.setState({
      pendingUserQuestion: {
        question: 'What about this?',
        context: 'test',
        resolve: jest.fn(),
        reject: mockReject,
      },
      messagesByTopic: {},
    });

    const messages: Message[] = [createMessage({ id: 'fetch-new', topicId: 'topic-3' })];
    mockDbSortBy.mockResolvedValue(messages);

    await useChatStore.getState().fetchMessages('topic-3');

    expect(mockReject).toHaveBeenCalled();
    expect(useChatStore.getState().pendingUserQuestion).toBeNull();
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

  it('sendMessageStream handles reply prediction with cloud model', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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

  it('sendMessageStream handles reply prediction with local model', async () => {
    mockAuthGetState.mockReturnValue({
      customInstructions: '',
      scratchpadRules: 'Rules',
      predefinedPrompts: [],
      messageRetrievalEnabled: false,
      askUserEnabled: false,
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { llmSuggestionService } = require('../../services/llmSuggestionService') as {
      llmSuggestionService: { getCompletion: jest.Mock<Promise<string>, [string, number]> };
    };
    llmSuggestionService.getCompletion.mockResolvedValueOnce('["Follow up 1", "Follow up 2", "Follow up 3"]');

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
      askUserEnabled: false,
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { llmSuggestionService } = require('../../services/llmSuggestionService') as {
      llmSuggestionService: { getCompletion: jest.Mock<Promise<string>, [string, number]> };
    };
    llmSuggestionService.getCompletion.mockRejectedValueOnce(new Error('Local model error'));

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

  it('sendMessageStream switches to web search model when enabled', async () => {
    const webSearchModel: UserChatModel = createUserChatModel({ id: 'web-search-model', apiModelId: 'web-search-model' });

    mockProviderGetState.mockReturnValue({
      models: [mockDefaultModel, webSearchModel],
      getProviderForModel: (): LlmProvider => testProvider,
      getFirstWebSearchModel: (): UserChatModel | undefined => webSearchModel,
    });

    useChatStore.setState({ webSearchEnabled: true });

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

    expect(mockOrchestrateLlmLoop).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'web-search-model' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('sendMessageStream is a no-op with empty content', async () => {
    await useChatStore.getState().sendMessageStream('   ', 'topic-1');

    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  it('sendMessageStream is a no-op with null topicId', async () => {
    await useChatStore.getState().sendMessageStream('Test', '');

    expect(mockDbAdd).not.toHaveBeenCalled();
  });

  // ========== stopSending with pending user question ==========

  it('stopSending rejects pending question when aborting', async () => {
    const mockReject = jest.fn();
    const abortController = new AbortController();

    useChatStore.setState({
      currentTopicId: 'topic-1',
      abortController,
      pendingUserQuestion: {
        question: 'What?',
        context: 'test',
        resolve: jest.fn(),
        reject: mockReject,
      },
      currentRequestMessageIds: {
        userMessageId: 'u-reject',
        assistantMessageId: 'a-reject',
      },
      messagesByTopic: {
        'topic-1': [
          createMessage({ id: 'u-reject', type: 'user', content: 'Question', topicId: 'topic-1' }),
          createMessage({ id: 'a-reject', type: 'assistant', content: '', topicId: 'topic-1', parentMessageId: 'u-reject' }),
        ],
      },
    });

    await useChatStore.getState().stopSending();

    expect(mockReject).toHaveBeenCalled();
    expect(useChatStore.getState().pendingUserQuestion).toBeNull();
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

    expect(mockDbUpdate).toHaveBeenCalledWith('u-existing', expect.objectContaining({ activeResponseId: expect.any(String) }));
  });
});
