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

const mockGetTopicContext = jest.fn<Promise<Message[]>, [string, string | undefined, string | undefined]>();
const mockUpdateTopicTimestamp = jest.fn<Promise<void>, [string]>();
const mockGenerateTopicName = jest.fn<Promise<void>, [string, string]>();
const mockUpdateTopicScratchpad = jest.fn<Promise<void>, [string, string]>();
const mockOrchestrateLlmLoop = jest.fn();
const mockAskLlm = jest.fn();
const mockAuthGetState = jest.fn();
const mockProviderGetState = jest.fn();
const mockAddNotification = jest.fn();
const mockGenerateEmbedding = jest.fn<Promise<number[]>, [string]>();

const mockDbGet = jest.fn<Promise<Message | undefined>, [string]>();
const mockDbAdd = jest.fn<Promise<string>, [Message]>();
const mockDbUpdate = jest.fn<Promise<number>, [string, Partial<Message>]>();
const mockDbDelete = jest.fn<Promise<void>, [string]>();
const mockDbTransaction = jest.fn<Promise<void>, [string, unknown, () => Promise<void>]>();

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
    getState: () => ({
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
    getState: () => mockProviderGetState(),
  },
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: () => mockAuthGetState(),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: () => ({ addNotification: mockAddNotification }),
  },
}));

jest.mock('../../services/llmService', () => ({
  orchestrateLlmLoop: (...args: unknown[]) => mockOrchestrateLlmLoop(...args),
  askLlm: (...args: unknown[]) => mockAskLlm(...args),
  SCRATCHPAD_TOOL: { type: 'function', function: { name: 'update_scratchpad' } },
  READ_MESSAGES_TOOL: { type: 'function', function: { name: 'read_messages' } },
  LIST_MESSAGES_TOOL: { type: 'function', function: { name: 'list_messages' } },
  ASK_USER_TOOL: { type: 'function', function: { name: 'ask_user' } },
}));

jest.mock('../../services/mediaService', () => ({
  generateImage: jest.fn(),
  generateMusic: jest.fn(),
}));

jest.mock('../../services/llmSuggestionService', () => ({
  llmSuggestionService: {
    getCompletion: jest.fn(),
  },
}));

jest.mock('../../services/embeddingService', () => ({
  embeddingService: {
    isReady: false,
    generateEmbedding: (...args: [string]) => mockGenerateEmbedding(...args),
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
      get: (...args: [string]) => mockDbGet(...args),
      add: (...args: [Message]) => mockDbAdd(...args),
      update: (...args: [string, Partial<Message>]) => mockDbUpdate(...args),
      delete: (...args: [string]) => mockDbDelete(...args),
    },
    transaction: (mode: string, table: unknown, callback: () => Promise<void>) => mockDbTransaction(mode, table, callback),
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
    mockDbUpdate.mockResolvedValue(1);
    mockDbDelete.mockResolvedValue();
    mockDbGet.mockResolvedValue(undefined);

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
});
