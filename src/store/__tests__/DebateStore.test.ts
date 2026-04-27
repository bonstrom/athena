import type { Message, Topic } from '../../database/AthenaDb';

// ---- shared mutable state for DB ----
const mockMessages: Message[] = [];

// ---- mock fns ----
const mockMessagesAdd = jest.fn<Promise<string>, [Message]>().mockResolvedValue('id');
const mockMessagesUpdate = jest.fn<Promise<number>, [string, Partial<Message>]>().mockResolvedValue(1);
const mockMessagesDelete = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
const mockTopicsUpdate = jest.fn<Promise<number>, [string, Partial<Topic>]>().mockResolvedValue(1);
const mockAskLlmStream = jest.fn();
const mockGetAvailableModels = jest.fn();
const mockGetDefaultModel = jest.fn();
const mockCalculateCostSEK = jest.fn<number, unknown[]>().mockReturnValue(0.5);
const mockAddNotification = jest.fn<void, [string, string?]>();
const mockTopicStoreSetState = jest.fn();
const mockGenerateTopicName = jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined);
const mockChatStoreSetState = jest.fn();

// ---- mocks ----
jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      add: (msg: Message): Promise<string> => mockMessagesAdd(msg),
      update: (id: string, patch: Partial<Message>): Promise<number> => mockMessagesUpdate(id, patch),
      delete: (id: string): Promise<void> => mockMessagesDelete(id),
      where: (_field: string) => ({
        equals: (topicId: string) => ({
          and: (pred: (m: Message) => boolean) => ({
            sortBy: (_sortField: string): Promise<Message[]> => Promise.resolve(mockMessages.filter((m) => m.topicId === topicId).filter(pred)),
          }),
        }),
      }),
    },
    topics: {
      update: (id: string, patch: Partial<Topic>): Promise<number> => mockTopicsUpdate(id, patch),
    },
  },
}));

jest.mock('../../services/llmService', () => ({
  askLlmStream: (...args: unknown[]): unknown => mockAskLlmStream(...args),
}));

jest.mock('../../components/ModelSelector', () => ({
  getAvailableModels: (): unknown => mockGetAvailableModels(),
  getDefaultModel: (): unknown => mockGetDefaultModel(),
  calculateCostSEK: (...args: unknown[]): number => mockCalculateCostSEK(...args),
}));

jest.mock('../../store/TopicStore', () => ({
  useTopicStore: {
    getState: (): {
      topics: Topic[];
      generateTopicName: (topicId: string, question: string) => Promise<void>;
    } => ({
      topics: [{ id: 'topic-1', name: 'New Debate' } as Topic],
      generateTopicName: (...args: [string, string]): Promise<void> => mockGenerateTopicName(...args),
    }),
    setState: (...args: unknown[]): void => {
      mockTopicStoreSetState(...args);
    },
  },
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: (): { customInstructions: string } => ({ customInstructions: '' }),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: (): { addNotification: (title: string, message?: string) => void } => ({
      addNotification: (...args: [string, string?]): void => {
        mockAddNotification(...args);
      },
    }),
  },
}));

jest.mock('../../store/ChatStore', () => ({
  useChatStore: {
    setState: (...args: unknown[]): void => {
      mockChatStoreSetState(...args);
    },
  },
}));

// ---- helpers ----
function makeStreamResult(content: string): {
  content: string;
  promptTokens: number;
  completionTokens: number;
  promptTokensDetails: undefined;
  reasoning: undefined;
} {
  return { content, promptTokens: 10, completionTokens: 5, promptTokensDetails: undefined, reasoning: undefined };
}

const modelA = { id: 'model-a', apiModelId: 'api-a', label: 'Model A' };
const modelB = { id: 'model-b', apiModelId: 'api-b', label: 'Model B' };

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: `msg-${Math.random()}`,
    topicId: 'topic-1',
    forkId: 'main',
    type: 'assistant',
    content: 'text',
    created: '2024-01-01T00:00:00.000Z',
    isDeleted: false,
    includeInContext: false,
    failed: false,
    promptTokens: 10,
    completionTokens: 5,
    totalCost: 0.5,
    ...overrides,
  };
}

// ---- import store after mocks ----
import { useDebateStore } from '../DebateStore';

// ---- setup ----
function resetStore(): void {
  useDebateStore.setState({
    debateModelA: null,
    debateModelB: null,
    debateSending: false,
    currentPhase: 'idle',
    abortController: null,
    streamingContentA: '',
    streamingContentB: '',
    streamingConsensus: '',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMessages.splice(0, mockMessages.length);
  mockMessagesAdd.mockResolvedValue('id');
  mockMessagesUpdate.mockResolvedValue(1);
  mockMessagesDelete.mockResolvedValue(undefined);
  mockTopicsUpdate.mockResolvedValue(1);
  mockCalculateCostSEK.mockReturnValue(0.5);
  resetStore();

  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: jest
        .fn<`${string}-${string}-${string}-${string}-${string}`, []>()
        .mockReturnValueOnce('uuid-user-00000-000000000000')
        .mockReturnValueOnce('uuid-ans-a-0000-000000000000')
        .mockReturnValueOnce('uuid-ans-b-0000-000000000000')
        .mockReturnValueOnce('uuid-rev-a-0000-000000000000')
        .mockReturnValueOnce('uuid-rev-b-0000-000000000000')
        .mockReturnValueOnce('uuid-fin-a-0000-000000000000')
        .mockReturnValueOnce('uuid-fin-b-0000-000000000000')
        .mockReturnValueOnce('uuid-cons-00000-000000000000')
        .mockImplementation(() => 'uuid-fallback-0000-000000000000'),
    },
    configurable: true,
  });
});

// ---- tests ----

describe('DebateStore – initDebateModels', () => {
  it('sets both models from available models and topic ids', () => {
    mockGetAvailableModels.mockReturnValue([modelA, modelB]);
    mockGetDefaultModel.mockReturnValue(modelA);

    useDebateStore.getState().initDebateModels('topic-1');

    // topic has no stored model ids → falls back to default for both
    const state = useDebateStore.getState();
    expect(state.debateModelA).toEqual(modelA);
    expect(state.debateModelB).toEqual(modelA);
  });

  it('does nothing if no available models', () => {
    mockGetAvailableModels.mockReturnValue([]);

    useDebateStore.getState().initDebateModels('topic-1');

    expect(useDebateStore.getState().debateModelA).toBeNull();
  });
});

describe('DebateStore – setDebateModelA / setDebateModelB', () => {
  it('updates debateModelA in store and persists to DB', () => {
    useDebateStore.getState().setDebateModelA(modelA, 'topic-1');

    expect(useDebateStore.getState().debateModelA).toEqual(modelA);
    expect(mockTopicsUpdate).toHaveBeenCalledWith('topic-1', { debateModelAId: 'model-a' });
  });

  it('updates debateModelB in store and persists to DB', () => {
    useDebateStore.getState().setDebateModelB(modelB, 'topic-1');

    expect(useDebateStore.getState().debateModelB).toEqual(modelB);
    expect(mockTopicsUpdate).toHaveBeenCalledWith('topic-1', { debateModelBId: 'model-b' });
  });
});

describe('DebateStore – sendDebateRound guards', () => {
  it('does nothing when already sending', async () => {
    useDebateStore.setState({ debateSending: true, debateModelA: modelA, debateModelB: modelB });

    await useDebateStore.getState().sendDebateRound('question', 'topic-1');

    expect(mockMessagesAdd).not.toHaveBeenCalled();
    expect(mockAskLlmStream).not.toHaveBeenCalled();
  });

  it('does nothing when models are not set', async () => {
    await useDebateStore.getState().sendDebateRound('question', 'topic-1');

    expect(mockMessagesAdd).not.toHaveBeenCalled();
    expect(mockAskLlmStream).not.toHaveBeenCalled();
  });
});

describe('DebateStore – sendDebateRound happy path', () => {
  beforeEach(() => {
    useDebateStore.setState({ debateModelA: modelA, debateModelB: modelB });
    // Return distinct content per call so review/final prompts are built correctly
    mockAskLlmStream
      .mockResolvedValueOnce(makeStreamResult('answer-a'))
      .mockResolvedValueOnce(makeStreamResult('answer-b'))
      .mockResolvedValueOnce(makeStreamResult('review-a'))
      .mockResolvedValueOnce(makeStreamResult('review-b'))
      .mockResolvedValueOnce(makeStreamResult('final-a'))
      .mockResolvedValueOnce(makeStreamResult('final-b'))
      .mockResolvedValueOnce(makeStreamResult('consensus'));
    // Seed mockMessages so the consensus query finds something
    mockMessagesAdd.mockImplementation(async (msg: Message): Promise<string> => {
      mockMessages.push(msg);
      return msg.id;
    });
  });

  it('runs all 4 phases and ends in idle state', async () => {
    await useDebateStore.getState().sendDebateRound('What is AI?', 'topic-1');

    expect(useDebateStore.getState().debateSending).toBe(false);
    expect(useDebateStore.getState().currentPhase).toBe('idle');
    expect(useDebateStore.getState().streamingContentA).toBe('');
    expect(useDebateStore.getState().streamingContentB).toBe('');
    expect(useDebateStore.getState().streamingConsensus).toBe('');
  });

  it('calls askLlmStream 7 times (3 paired phases + 1 consensus)', async () => {
    await useDebateStore.getState().sendDebateRound('What is AI?', 'topic-1');

    // 2 per phase × 3 phases = 6, plus 1 consensus = 7
    expect(mockAskLlmStream).toHaveBeenCalledTimes(7);
  });

  it('persists user message and 6 assistant placeholders (+ 1 consensus)', async () => {
    await useDebateStore.getState().sendDebateRound('What is AI?', 'topic-1');

    // 1 user + 2 answer + 2 review + 2 final + 1 consensus = 8
    expect(mockMessagesAdd).toHaveBeenCalledTimes(8);

    const calls = mockMessagesAdd.mock.calls.map((c) => c[0]);
    expect(calls[0].type).toBe('user');
    expect(calls[0].content).toBe('What is AI?');
    expect(calls[1].debatePhase).toBe('answer');
    expect(calls[1].debateSide).toBe('left');
    expect(calls[2].debatePhase).toBe('answer');
    expect(calls[2].debateSide).toBe('right');
    expect(calls[7].debatePhase).toBe('consensus');
  });

  it('updates all assistant messages with final content', async () => {
    await useDebateStore.getState().sendDebateRound('What is AI?', 'topic-1');

    // 2 per phase × 3 phases = 6, plus 1 consensus = 7
    expect(mockMessagesUpdate).toHaveBeenCalledTimes(7);
  });

  it('calls generateTopicName when topic name is "New Debate"', async () => {
    await useDebateStore.getState().sendDebateRound('What is AI?', 'topic-1');

    expect(mockGenerateTopicName).toHaveBeenCalledWith('topic-1', 'What is AI?');
  });
});

describe('DebateStore – sendDebateRound error handling', () => {
  it('shows a notification and returns to idle on LLM failure', async () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});
    useDebateStore.setState({ debateModelA: modelA, debateModelB: modelB });
    mockAskLlmStream.mockRejectedValue(new Error('network error'));

    await useDebateStore.getState().sendDebateRound('question', 'topic-1');

    expect(mockAddNotification).toHaveBeenCalledWith('Debate failed', 'network error');
    expect(useDebateStore.getState().debateSending).toBe(false);
    expect(useDebateStore.getState().currentPhase).toBe('idle');
  });
});

describe('DebateStore – stopDebate', () => {
  it('resets all state and clears streaming content', () => {
    const controller = new AbortController();
    useDebateStore.setState({
      debateSending: true,
      currentPhase: 'answer',
      abortController: controller,
      streamingContentA: 'partial...',
      streamingContentB: 'partial...',
      streamingConsensus: 'partial...',
    });

    useDebateStore.getState().stopDebate();

    const state = useDebateStore.getState();
    expect(state.debateSending).toBe(false);
    expect(state.currentPhase).toBe('idle');
    expect(state.abortController).toBeNull();
    expect(state.streamingContentA).toBe('');
    expect(state.streamingContentB).toBe('');
    expect(state.streamingConsensus).toBe('');
  });
});

describe('DebateStore – continueDebate', () => {
  it('does nothing when already sending', async () => {
    useDebateStore.setState({ debateSending: true, debateModelA: modelA, debateModelB: modelB });

    await useDebateStore.getState().continueDebate('topic-1');

    expect(mockAskLlmStream).not.toHaveBeenCalled();
  });

  it('does nothing when no user messages exist', async () => {
    useDebateStore.setState({ debateModelA: modelA, debateModelB: modelB });
    // mockMessages is empty

    await useDebateStore.getState().continueDebate('topic-1');

    expect(mockAskLlmStream).not.toHaveBeenCalled();
  });

  it('does nothing when all phases are already complete', async () => {
    useDebateStore.setState({ debateModelA: modelA, debateModelB: modelB });

    mockMessages.push(makeMessage({ id: 'user-1', type: 'user', content: 'question' }));
    mockMessages.push(makeMessage({ id: 'ans-l', debatePhase: 'answer', debateSide: 'left', content: 'answer A' }));
    mockMessages.push(makeMessage({ id: 'ans-r', debatePhase: 'answer', debateSide: 'right', content: 'answer B' }));
    mockMessages.push(makeMessage({ id: 'rev-l', debatePhase: 'review', debateSide: 'left', content: 'review A' }));
    mockMessages.push(makeMessage({ id: 'rev-r', debatePhase: 'review', debateSide: 'right', content: 'review B' }));
    mockMessages.push(makeMessage({ id: 'fin-l', debatePhase: 'final', debateSide: 'left', content: 'final A' }));
    mockMessages.push(makeMessage({ id: 'fin-r', debatePhase: 'final', debateSide: 'right', content: 'final B' }));
    mockMessages.push(makeMessage({ id: 'cons', debatePhase: 'consensus', content: 'consensus text' }));

    await useDebateStore.getState().continueDebate('topic-1');

    expect(mockAskLlmStream).not.toHaveBeenCalled();
  });

  it('resumes from final phase when answer and review are done but final/consensus are missing', async () => {
    useDebateStore.setState({ debateModelA: modelA, debateModelB: modelB });

    mockMessages.push(makeMessage({ id: 'user-1', type: 'user', content: 'question' }));
    mockMessages.push(makeMessage({ id: 'ans-l', debatePhase: 'answer', debateSide: 'left', content: 'answer A' }));
    mockMessages.push(makeMessage({ id: 'ans-r', debatePhase: 'answer', debateSide: 'right', content: 'answer B' }));
    mockMessages.push(makeMessage({ id: 'rev-l', debatePhase: 'review', debateSide: 'left', content: 'review A' }));
    mockMessages.push(makeMessage({ id: 'rev-r', debatePhase: 'review', debateSide: 'right', content: 'review B' }));
    // final and consensus are missing

    mockMessagesAdd.mockImplementation(async (msg: Message): Promise<string> => {
      mockMessages.push(msg);
      return msg.id;
    });
    mockAskLlmStream
      .mockResolvedValueOnce(makeStreamResult('final-a'))
      .mockResolvedValueOnce(makeStreamResult('final-b'))
      .mockResolvedValueOnce(makeStreamResult('consensus'));

    await useDebateStore.getState().continueDebate('topic-1');

    // 3 calls: final A, final B, consensus
    expect(mockAskLlmStream).toHaveBeenCalledTimes(3);
    expect(useDebateStore.getState().debateSending).toBe(false);
    expect(useDebateStore.getState().currentPhase).toBe('idle');
  });

  it('deletes stale empty placeholders before resuming', async () => {
    useDebateStore.setState({ debateModelA: modelA, debateModelB: modelB });

    const staleA = makeMessage({ id: 'stale-a', debatePhase: 'final', debateSide: 'left', content: '' });
    const staleB = makeMessage({ id: 'stale-b', debatePhase: 'final', debateSide: 'right', content: '' });
    mockMessages.push(makeMessage({ id: 'user-1', type: 'user', content: 'question' }));
    mockMessages.push(makeMessage({ id: 'ans-l', debatePhase: 'answer', debateSide: 'left', content: 'answer A' }));
    mockMessages.push(makeMessage({ id: 'ans-r', debatePhase: 'answer', debateSide: 'right', content: 'answer B' }));
    mockMessages.push(makeMessage({ id: 'rev-l', debatePhase: 'review', debateSide: 'left', content: 'review A' }));
    mockMessages.push(makeMessage({ id: 'rev-r', debatePhase: 'review', debateSide: 'right', content: 'review B' }));
    mockMessages.push(staleA);
    mockMessages.push(staleB);

    mockMessagesAdd.mockImplementation(async (msg: Message): Promise<string> => {
      mockMessages.push(msg);
      return msg.id;
    });
    mockAskLlmStream
      .mockResolvedValueOnce(makeStreamResult('final-a'))
      .mockResolvedValueOnce(makeStreamResult('final-b'))
      .mockResolvedValueOnce(makeStreamResult('consensus'));

    await useDebateStore.getState().continueDebate('topic-1');

    expect(mockMessagesDelete).toHaveBeenCalledWith('stale-a');
    expect(mockMessagesDelete).toHaveBeenCalledWith('stale-b');
  });
});
