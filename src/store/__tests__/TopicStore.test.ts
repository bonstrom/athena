import { RAG_CONTENT_LIMIT } from '../../constants';
import type { Message, Topic } from '../../database/AthenaDb';
import { encode } from 'gpt-tokenizer';

let mockDbMessages: Message[] = [];

const mockSearchSimilarMessages = jest.fn<Promise<{ message: Message; score: number }[]>, [string, Message[], number]>();
const mockAuthGetState = jest.fn();

jest.mock('gpt-tokenizer', () => ({
  encode: jest.fn((text: string): number[] => new Array<number>(text.length).fill(0)),
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: (): ReturnType<typeof mockAuthGetState> => mockAuthGetState(),
  },
}));

jest.mock('../../services/embeddingService', () => ({
  embeddingService: {
    isReady: false,
    searchSimilarMessages: (...args: [string, Message[], number]): ReturnType<typeof mockSearchSimilarMessages> => mockSearchSimilarMessages(...args),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: () => ({ addNotification: jest.fn() }),
  },
}));

jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: {
    getState: () => ({ hasAnyApiKey: () => false }),
  },
}));

jest.mock('../../services/llmService', () => ({
  askLlm: jest.fn(),
}));

jest.mock('../../components/ModelSelector', () => ({
  getDefaultTopicNameModel: jest.fn(),
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      where: (field: string) => ({
        equals: (topicId: string) => ({
          and: (predicate: (message: Message) => boolean) => ({
            toArray: async (): Promise<Message[]> => {
              if (field !== 'topicId') {
                return [];
              }
              return mockDbMessages.filter((m) => m.topicId === topicId).filter(predicate);
            },
          }),
        }),
      }),
    },
  },
}));

import { embeddingService } from '../../services/embeddingService';
import { useTopicStore } from '../../store/TopicStore';

const mockEncode = encode as jest.MockedFunction<typeof encode>;

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    name: 'Topic',
    createdOn: '2024-01-01T00:00:00.000Z',
    updatedOn: '2024-01-01T00:00:00.000Z',
    isDeleted: false,
    activeForkId: 'main',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> & { id: string; type: Message['type']; content: string; created: string }): Message {
  return {
    id: overrides.id,
    topicId: 'topic-1',
    forkId: 'main',
    type: overrides.type,
    content: overrides.content,
    isDeleted: false,
    includeInContext: false,
    created: overrides.created,
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    ...overrides,
  };
}

describe('TopicStore.getTopicContext', () => {
  beforeEach(() => {
    mockDbMessages = [];
    mockSearchSimilarMessages.mockReset();
    mockEncode.mockImplementation((text: string): number[] => new Array<number>(text.length).fill(0));

    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 4,
      maxContextTokens: 10000,
      messageRetrievalEnabled: true,
      ragEnabled: false,
    });

    useTopicStore.setState({ topics: [makeTopic()] });
    Object.defineProperty(embeddingService, 'isReady', { value: false, configurable: true });
  });

  it('includes RAG context when retrieval returns relevant older messages', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 2 })] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 4,
      maxContextTokens: 10000,
      messageRetrievalEnabled: true,
      ragEnabled: true,
    });

    const u1 = makeMessage({
      id: 'u1-message',
      type: 'user',
      content: 'Earlier user question',
      created: '2024-01-01T00:00:00.000Z',
      embedding: [0.1],
    });
    const a1 = makeMessage({
      id: 'a1-message',
      type: 'assistant',
      content: 'Earlier assistant answer',
      created: '2024-01-01T00:01:00.000Z',
      parentMessageId: 'u1-message',
    });
    const u2 = makeMessage({ id: 'u2-message', type: 'user', content: 'Recent question', created: '2024-01-01T00:02:00.000Z' });
    const a2 = makeMessage({
      id: 'a2-message',
      type: 'assistant',
      content: 'Recent answer',
      created: '2024-01-01T00:03:00.000Z',
      parentMessageId: 'u2-message',
    });

    mockDbMessages = [u1, a1, u2, a2];

    Object.defineProperty(embeddingService, 'isReady', { value: true, configurable: true });
    mockSearchSimilarMessages.mockResolvedValue([{ message: u1, score: 0.92 }]);

    const context = await useTopicStore.getState().getTopicContext('topic-1', undefined, 'What did we discuss earlier?');

    expect(context[0].id).toBe('__rag_context__');
    expect(context[0].content).toContain('Relevant context retrieved from earlier in this conversation');
    expect(context[0].content).toContain('[User]: Earlier user question');
    expect(context[0].content).toContain('[Assistant]: Earlier assistant answer');
  });

  it('always keeps at least the previous Q&A pair in context even with a low message cap', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 1 })] });

    const u1 = makeMessage({ id: 'u1', type: 'user', content: 'Question 1', created: '2024-01-01T00:00:00.000Z' });
    const a1 = makeMessage({ id: 'a1', type: 'assistant', content: 'Answer 1', created: '2024-01-01T00:01:00.000Z', parentMessageId: 'u1' });
    const u2 = makeMessage({ id: 'u2', type: 'user', content: 'Question 2', created: '2024-01-01T00:02:00.000Z' });
    const a2 = makeMessage({ id: 'a2', type: 'assistant', content: 'Answer 2', created: '2024-01-01T00:03:00.000Z', parentMessageId: 'u2' });

    mockDbMessages = [u1, a1, u2, a2];

    const context = await useTopicStore.getState().getTopicContext('topic-1');
    const ids = context.map((m) => m.id);

    expect(ids).toContain('u2');
    expect(ids).toContain('a2');
  });

  it('includes summary text when truncating older long messages', async () => {
    const longContent = 'L'.repeat(RAG_CONTENT_LIMIT + 40);

    const pinnedOld = makeMessage({
      id: 'old-user-message',
      type: 'user',
      content: longContent,
      summary: 'Key details from old message',
      includeInContext: true,
      created: '2024-01-01T00:00:00.000Z',
    });
    const recentUser = makeMessage({ id: 'recent-user', type: 'user', content: 'Recent user message', created: '2024-01-01T00:01:00.000Z' });
    const recentAssistant = makeMessage({
      id: 'recent-assistant',
      type: 'assistant',
      content: 'Recent assistant message',
      created: '2024-01-01T00:02:00.000Z',
      parentMessageId: 'recent-user',
    });

    mockDbMessages = [pinnedOld, recentUser, recentAssistant];

    const context = await useTopicStore.getState().getTopicContext('topic-1');
    const oldInContext = context.find((m) => m.id === 'old-user-message');

    expect(oldInContext).toBeDefined();
    expect(oldInContext?.content).toContain('[SUMMARY]: Key details from old message');
    expect(oldInContext?.content).toContain("[TRUNCATED: Use 'read_messages'");
  });

  it('excludes messages at and after excludeAfterId', async () => {
    const u1 = makeMessage({ id: 'u1', type: 'user', content: 'Question 1', created: '2024-01-01T00:00:00.000Z' });
    const a1 = makeMessage({ id: 'a1', type: 'assistant', content: 'Answer 1', created: '2024-01-01T00:01:00.000Z', parentMessageId: 'u1' });
    const u2 = makeMessage({ id: 'u2', type: 'user', content: 'Question 2', created: '2024-01-01T00:02:00.000Z' });
    const a2 = makeMessage({ id: 'a2', type: 'assistant', content: 'Answer 2', created: '2024-01-01T00:03:00.000Z', parentMessageId: 'u2' });
    const u3 = makeMessage({ id: 'u3', type: 'user', content: 'Question 3', created: '2024-01-01T00:04:00.000Z' });
    const a3 = makeMessage({ id: 'a3', type: 'assistant', content: 'Answer 3', created: '2024-01-01T00:05:00.000Z', parentMessageId: 'u3' });

    mockDbMessages = [u1, a1, u2, a2, u3, a3];

    const context = await useTopicStore.getState().getTopicContext('topic-1', 'u3');
    const ids = context.map((m) => m.id);

    expect(ids).toContain('u2');
    expect(ids).toContain('a2');
    expect(ids).not.toContain('u3');
    expect(ids).not.toContain('a3');
  });

  it('uses only the active assistant version for a user message', async () => {
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 10,
      maxContextTokens: 10000,
      messageRetrievalEnabled: false,
      ragEnabled: false,
    });

    const u1 = makeMessage({
      id: 'u1',
      type: 'user',
      content: 'Question with multiple assistant versions',
      created: '2024-01-01T00:00:00.000Z',
      activeResponseId: 'a1-v2',
    });
    const a1v1 = makeMessage({
      id: 'a1-v1',
      type: 'assistant',
      content: 'Old assistant response',
      created: '2024-01-01T00:01:00.000Z',
      parentMessageId: 'u1',
    });
    const a1v2 = makeMessage({
      id: 'a1-v2',
      type: 'assistant',
      content: 'Active assistant response',
      created: '2024-01-01T00:02:00.000Z',
      parentMessageId: 'u1',
    });

    mockDbMessages = [u1, a1v1, a1v2];

    const context = await useTopicStore.getState().getTopicContext('topic-1');
    const ids = context.map((m) => m.id);

    expect(ids).toContain('u1');
    expect(ids).toContain('a1-v2');
    expect(ids).not.toContain('a1-v1');
  });

  it('adds a history directory message when retrieval is enabled and older messages are outside context', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 2 })] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 2,
      maxContextTokens: 10000,
      messageRetrievalEnabled: true,
      ragEnabled: false,
    });

    const u1 = makeMessage({ id: 'u1', type: 'user', content: 'Question 1', created: '2024-01-01T00:00:00.000Z' });
    const a1 = makeMessage({ id: 'a1', type: 'assistant', content: 'Answer 1', created: '2024-01-01T00:01:00.000Z', parentMessageId: 'u1' });
    const u2 = makeMessage({ id: 'u2', type: 'user', content: 'Question 2', created: '2024-01-01T00:02:00.000Z' });
    const a2 = makeMessage({ id: 'a2', type: 'assistant', content: 'Answer 2', created: '2024-01-01T00:03:00.000Z', parentMessageId: 'u2' });
    const u3 = makeMessage({ id: 'u3', type: 'user', content: 'Question 3', created: '2024-01-01T00:04:00.000Z' });
    const a3 = makeMessage({ id: 'a3', type: 'assistant', content: 'Answer 3', created: '2024-01-01T00:05:00.000Z', parentMessageId: 'u3' });

    mockDbMessages = [u1, a1, u2, a2, u3, a3];

    const context = await useTopicStore.getState().getTopicContext('topic-1');
    const directory = context.find((m) => m.id === '__history_directory__');

    expect(directory).toBeDefined();
    expect(directory?.content).toContain('Historical messages outside context');
    expect(directory?.content).toContain('u1|U|');
    expect(directory?.content).toContain('a1|A|');
  });
});
