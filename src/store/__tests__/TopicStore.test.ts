import { RAG_CONTENT_LIMIT, RAG_MAX_CHARS, RAG_MIN_SCORE, SCRATCHPAD_LIMIT } from '../../constants';
import type { Message, Topic } from '../../database/AthenaDb';
import { DEFAULT_MODELS } from '../../types/provider';
import { encode } from 'gpt-tokenizer';
import { askLlm } from '../../services/llmService';
import { getDefaultTopicNameModel } from '../../components/ModelSelector';

let mockDbMessages: Message[] = [];
let lastBulkAddedMessages: Message[] = [];

const mockSearchSimilarMessages = jest.fn<Promise<{ message: Message; score: number }[]>, [string, Message[], number]>();
const mockAuthGetState = jest.fn();
const mockHasAnyApiKey = jest.fn<boolean, []>();
const mockAddNotification = jest.fn((title: string, message?: string): undefined => {
  void title;
  void message;
  return undefined;
});
const mockTopicsToArray = jest.fn<Promise<Topic[]>, []>();
const mockTopicsAdd = jest.fn<Promise<void>, [Topic]>();
const mockTopicsDelete = jest.fn<Promise<void>, [string]>();
const mockDbBulkAdd = jest.fn<Promise<void>, [Message[]]>();
const mockMessagesDelete = jest.fn<Promise<number>, [Message[]]>();
const mockTopicsUpdate = jest.fn<Promise<number>, [string, Partial<Topic>]>();
const mockDbTransaction = jest.fn<Promise<void>, [string, unknown[], () => Promise<void>]>();

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
    getState: (): { addNotification: (title: string, message?: string) => void } => ({
      addNotification: (...args: [string, string?]): void => {
        mockAddNotification(...args);
      },
    }),
  },
}));

jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: {
    getState: (): { hasAnyApiKey: () => boolean } => ({ hasAnyApiKey: (): boolean => mockHasAnyApiKey() }),
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
    topics: {
      orderBy: (_field: string): { reverse: () => { toArray: (...args: []) => Promise<Topic[]> } } => ({
        reverse: (): { toArray: (...args: []) => Promise<Topic[]> } => ({
          toArray: (...args: []): Promise<Topic[]> => mockTopicsToArray(...args),
        }),
      }),
      add: (...args: [Topic]): Promise<void> => mockTopicsAdd(...args),
      delete: (...args: [string]): Promise<void> => mockTopicsDelete(...args),
      update: (...args: [string, Partial<Topic>]): Promise<number> => mockTopicsUpdate(...args),
    },
    messages: {
      where: (
        field: string,
      ): {
        equals: (topicId: string) => {
          and: (predicate: (message: Message) => boolean) => { toArray: () => Promise<Message[]>; delete: () => Promise<number> };
        };
      } => ({
        equals: (
          topicId: string,
        ): {
          toArray: () => Promise<Message[]>;
          and: (predicate: (message: Message) => boolean) => { toArray: () => Promise<Message[]>; delete: () => Promise<number> };
        } => ({
          toArray: (): Promise<Message[]> => {
            if (field !== 'topicId') {
              return Promise.resolve([]);
            }
            return Promise.resolve(mockDbMessages.filter((m) => m.topicId === topicId));
          },
          and: (predicate: (message: Message) => boolean): { toArray: () => Promise<Message[]>; delete: () => Promise<number> } => ({
            toArray: (): Promise<Message[]> => {
              if (field !== 'topicId') {
                return Promise.resolve([]);
              }
              return Promise.resolve(mockDbMessages.filter((m) => m.topicId === topicId).filter(predicate));
            },
            delete: (): Promise<number> => {
              if (field !== 'topicId') {
                return Promise.resolve(0);
              }
              const matching = mockDbMessages.filter((m) => m.topicId === topicId).filter(predicate);
              return mockMessagesDelete(matching);
            },
          }),
        }),
      }),
      bulkAdd: (...args: [Message[]]): Promise<void> => mockDbBulkAdd(...args),
    },
    transaction: (...args: [string, unknown[], () => Promise<void>]): Promise<void> => mockDbTransaction(...args),
  },
}));

import { embeddingService } from '../../services/embeddingService';
import { useTopicStore } from '../../store/TopicStore';

const mockEncode = encode as jest.MockedFunction<typeof encode>;
const mockAskLlm = askLlm as jest.MockedFunction<typeof askLlm>;
const mockGetDefaultTopicNameModel = getDefaultTopicNameModel as jest.MockedFunction<typeof getDefaultTopicNameModel>;

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
    topicId: 'topic-1',
    forkId: 'main',
    isDeleted: false,
    includeInContext: false,
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
    lastBulkAddedMessages = [];
    mockAddNotification.mockReset();
    mockTopicsToArray.mockReset();
    mockTopicsAdd.mockReset();
    mockTopicsDelete.mockReset();
    mockSearchSimilarMessages.mockReset();
    mockDbBulkAdd.mockReset();
    mockMessagesDelete.mockReset();
    mockTopicsUpdate.mockReset();
    mockDbTransaction.mockReset();
    mockHasAnyApiKey.mockReset();
    mockAskLlm.mockReset();
    mockGetDefaultTopicNameModel.mockReset();
    mockEncode.mockImplementation((text: string): number[] => new Array<number>(text.length).fill(0));

    mockDbBulkAdd.mockImplementation((messages: Message[]): Promise<void> => {
      lastBulkAddedMessages = messages;
      return Promise.resolve();
    });
    mockTopicsToArray.mockResolvedValue([]);
    mockTopicsAdd.mockResolvedValue();
    mockTopicsDelete.mockResolvedValue();
    mockMessagesDelete.mockResolvedValue(0);
    mockTopicsUpdate.mockResolvedValue(1);
    mockHasAnyApiKey.mockReturnValue(false);
    mockDbTransaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>): Promise<void> => {
      await callback();
    });

    const uuidSequence = ['uuid-default-1', 'uuid-default-2', 'uuid-default-3'];
    let uuidIndex = 0;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: jest.fn(() => uuidSequence[uuidIndex++] ?? `uuid-default-${uuidIndex}`),
      },
      configurable: true,
    });

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

  it('filters out RAG matches below the minimum similarity threshold', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 2 })] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 4,
      maxContextTokens: 10000,
      messageRetrievalEnabled: false,
      ragEnabled: true,
    });

    const u1 = makeMessage({
      id: 'u1',
      type: 'user',
      content: 'Low score question',
      created: '2024-01-01T00:00:00.000Z',
      embedding: [0.11],
    });
    const a1 = makeMessage({
      id: 'a1',
      type: 'assistant',
      content: 'Low score answer',
      created: '2024-01-01T00:01:00.000Z',
      parentMessageId: 'u1',
    });
    const u2 = makeMessage({
      id: 'u2',
      type: 'user',
      content: 'High score question',
      created: '2024-01-01T00:02:00.000Z',
      embedding: [0.22],
    });
    const a2 = makeMessage({
      id: 'a2',
      type: 'assistant',
      content: 'High score answer',
      created: '2024-01-01T00:03:00.000Z',
      parentMessageId: 'u2',
    });
    const u3 = makeMessage({ id: 'u3', type: 'user', content: 'Recent question', created: '2024-01-01T00:04:00.000Z' });
    const a3 = makeMessage({
      id: 'a3',
      type: 'assistant',
      content: 'Recent answer',
      created: '2024-01-01T00:05:00.000Z',
      parentMessageId: 'u3',
    });

    mockDbMessages = [u1, a1, u2, a2, u3, a3];
    Object.defineProperty(embeddingService, 'isReady', { value: true, configurable: true });
    mockSearchSimilarMessages.mockResolvedValue([
      { message: u1, score: RAG_MIN_SCORE - 0.01 },
      { message: u2, score: RAG_MIN_SCORE + 0.01 },
    ]);

    const context = await useTopicStore.getState().getTopicContext('topic-1', undefined, 'retrieve only relevant');

    expect(mockSearchSimilarMessages).toHaveBeenCalledTimes(1);
    expect(context[0].id).toBe('__rag_context__');
    expect(context[0].content).toContain('High score question');
    expect(context[0].content).toContain('High score answer');
    expect(context[0].content).not.toContain('Low score question');
    expect(context[0].content).not.toContain('Low score answer');
  });

  it('caps RAG injected content by max char budget across retrieved pairs', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 2 })] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 4,
      maxContextTokens: 10000,
      messageRetrievalEnabled: false,
      ragEnabled: true,
    });

    const olderPairs: Message[] = [];
    for (let i = 1; i <= 10; i++) {
      const idx = String(i).padStart(2, '0');
      const userId = `ru${idx}`;
      olderPairs.push(
        makeMessage({
          id: userId,
          type: 'user',
          content: `Retrieved question ${idx} ${'q'.repeat(220)}`,
          created: `2024-01-01T00:${idx}:00.000Z`,
          embedding: [i / 100],
        }),
        makeMessage({
          id: `ra${idx}`,
          type: 'assistant',
          content: `Retrieved answer ${idx} ${'a'.repeat(220)}`,
          created: `2024-01-01T00:${idx}:30.000Z`,
          parentMessageId: userId,
        }),
      );
    }
    const recentUser = makeMessage({ id: 'u-recent', type: 'user', content: 'Current question', created: '2024-01-01T00:59:00.000Z' });
    const recentAssistant = makeMessage({
      id: 'a-recent',
      type: 'assistant',
      content: 'Current answer',
      created: '2024-01-01T00:59:30.000Z',
      parentMessageId: 'u-recent',
    });
    mockDbMessages = [...olderPairs, recentUser, recentAssistant];

    Object.defineProperty(embeddingService, 'isReady', { value: true, configurable: true });
    const scored = olderPairs.filter((m) => m.type === 'user').map((m) => ({ message: m, score: RAG_MIN_SCORE + 0.2 }));
    mockSearchSimilarMessages.mockResolvedValue(scored);

    const context = await useTopicStore.getState().getTopicContext('topic-1', undefined, 'broad retrieval');
    const rag = context.find((m) => m.id === '__rag_context__');

    expect(rag).toBeDefined();
    expect(rag?.content).toContain('Retrieved question 01');
    expect(rag?.content).toContain('Retrieved answer 08');
    expect(rag?.content).not.toContain('Retrieved question 09');
    expect(rag?.content).not.toContain('Retrieved answer 10');
    expect(rag?.content.length).toBeLessThan(RAG_MAX_CHARS + 500);
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

  it('history directory shows only last 30 missing messages and includes a truncation note', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 2 })] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 2,
      maxContextTokens: 10000,
      messageRetrievalEnabled: true,
      ragEnabled: false,
    });

    const generated: Message[] = [];
    for (let i = 1; i <= 17; i++) {
      const idx = String(i).padStart(2, '0');
      const userId = `u${idx}`;
      const assistantId = `a${idx}`;
      generated.push(
        makeMessage({ id: userId, type: 'user', content: `Question ${i}`, created: `2024-01-01T00:${idx}:00.000Z` }),
        makeMessage({
          id: assistantId,
          type: 'assistant',
          content: `Answer ${i}`,
          created: `2024-01-01T00:${idx}:30.000Z`,
          parentMessageId: userId,
        }),
      );
    }
    mockDbMessages = generated;

    const context = await useTopicStore.getState().getTopicContext('topic-1');
    const directory = context.find((m) => m.id === '__history_directory__');

    expect(directory).toBeDefined();
    expect(directory?.content).toContain("(last 30/32; use 'list_messages' for full list)");
    expect(directory?.content).not.toContain('u01|U|');
    expect(directory?.content).not.toContain('a01|A|');
    expect(directory?.content).toContain('u02|U|');
    expect(directory?.content).toContain('a16|A|');
    expect(directory?.content).not.toContain('u17|U|');
    expect(directory?.content).not.toContain('a17|A|');
    expect(context.map((m) => m.id)).toEqual(['__history_directory__', 'u17', 'a17']);
  });

  it('getTopicContext respects window token budget beyond the always-kept last pair', async () => {
    useTopicStore.setState({ topics: [makeTopic({ maxContextMessages: 10 })] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 10,
      maxContextTokens: 20,
      messageRetrievalEnabled: false,
      ragEnabled: false,
    });

    mockDbMessages = [
      makeMessage({ id: 'u1', type: 'user', content: 'x'.repeat(90), created: '2024-01-01T00:00:00.000Z' }),
      makeMessage({ id: 'a1', type: 'assistant', content: 'x'.repeat(90), created: '2024-01-01T00:01:00.000Z', parentMessageId: 'u1' }),
      makeMessage({ id: 'u2', type: 'user', content: 'x'.repeat(90), created: '2024-01-01T00:02:00.000Z' }),
      makeMessage({ id: 'a2', type: 'assistant', content: 'x'.repeat(90), created: '2024-01-01T00:03:00.000Z', parentMessageId: 'u2' }),
      makeMessage({ id: 'u3', type: 'user', content: 'x'.repeat(90), created: '2024-01-01T00:04:00.000Z' }),
      makeMessage({ id: 'a3', type: 'assistant', content: 'x'.repeat(90), created: '2024-01-01T00:05:00.000Z', parentMessageId: 'u3' }),
    ];

    const context = await useTopicStore.getState().getTopicContext('topic-1');

    expect(context.map((m) => m.id)).toEqual(['u3', 'a3']);
  });

  it('forkTopic copies messages up to the selected message and remaps IDs/references', async () => {
    const uuidSequence = ['fork-1', 'copy-u1', 'copy-a1', 'copy-u2'];
    let uuidIndex = 0;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: jest.fn(() => uuidSequence[uuidIndex++] ?? `uuid-${uuidIndex}`),
      },
      configurable: true,
    });

    useTopicStore.setState({ topics: [makeTopic({ forks: [], activeForkId: 'main' })] });

    const u1 = makeMessage({ id: 'u1', type: 'user', content: 'Q1', created: '2024-01-01T00:00:00.000Z', activeResponseId: 'a1' });
    const a1 = makeMessage({ id: 'a1', type: 'assistant', content: 'A1', created: '2024-01-01T00:01:00.000Z', parentMessageId: 'u1' });
    const u2 = makeMessage({ id: 'u2', type: 'user', content: 'Q2', created: '2024-01-01T00:02:00.000Z' });
    const a2 = makeMessage({ id: 'a2', type: 'assistant', content: 'A2', created: '2024-01-01T00:03:00.000Z', parentMessageId: 'u2' });
    mockDbMessages = [u1, a1, u2, a2];

    await useTopicStore.getState().forkTopic('topic-1', 'u2');

    expect(mockDbBulkAdd).toHaveBeenCalledTimes(1);
    expect(lastBulkAddedMessages).toHaveLength(3);

    const copiedUser1 = lastBulkAddedMessages.find((m) => m.id === 'copy-u1');
    const copiedAssistant1 = lastBulkAddedMessages.find((m) => m.id === 'copy-a1');
    const copiedUser2 = lastBulkAddedMessages.find((m) => m.id === 'copy-u2');

    expect(copiedUser1).toBeDefined();
    expect(copiedAssistant1).toBeDefined();
    expect(copiedUser2).toBeDefined();

    expect(copiedUser1?.forkId).toBe('fork-1');
    expect(copiedUser1?.activeResponseId).toBe('copy-a1');
    expect(copiedAssistant1?.forkId).toBe('fork-1');
    expect(copiedAssistant1?.parentMessageId).toBe('copy-u1');
    expect(copiedUser2?.forkId).toBe('fork-1');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    const topicUpdateCall = mockTopicsUpdate.mock.calls[0] as [string, Partial<Topic>];
    const updatedTopicPatch = topicUpdateCall[1] as Partial<Topic> | undefined;
    expect(topicUpdateCall[0]).toBe('topic-1');
    expect(updatedTopicPatch?.activeForkId).toBe('fork-1');
    expect(updatedTopicPatch?.forks?.some((f) => f.id === 'main' && f.name === 'Main')).toBe(true);
    expect(updatedTopicPatch?.forks?.some((f) => f.id === 'fork-1' && f.name === 'Fork 1')).toBe(true);

    expect(useTopicStore.getState().topics.find((t) => t.id === 'topic-1')?.activeForkId).toBe('fork-1');
    expect(
      useTopicStore
        .getState()
        .topics.find((t) => t.id === 'topic-1')
        ?.forks?.some((f) => f.id === 'fork-1'),
    ).toBe(true);
  });

  it('forkTopic exits without writes when selected message is not found', async () => {
    useTopicStore.setState({ topics: [makeTopic({ forks: [], activeForkId: 'main' })] });
    mockDbMessages = [makeMessage({ id: 'u1', type: 'user', content: 'Q1', created: '2024-01-01T00:00:00.000Z' })];

    await useTopicStore.getState().forkTopic('topic-1', 'missing-message-id');

    expect(mockDbBulkAdd).not.toHaveBeenCalled();
    expect(mockTopicsUpdate).not.toHaveBeenCalled();
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });
});

describe('TopicStore actions', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
      void args;
    });
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: unknown[]): void => {
      void args;
    });

    mockAddNotification.mockReset();
    mockTopicsToArray.mockReset();
    mockTopicsAdd.mockReset();
    mockTopicsDelete.mockReset();
    mockTopicsUpdate.mockReset();
    mockMessagesDelete.mockReset();
    mockHasAnyApiKey.mockReset();
    mockAskLlm.mockReset();
    mockGetDefaultTopicNameModel.mockReset();
    mockEncode.mockImplementation((text: string): number[] => new Array<number>(text.length).fill(0));
    mockTopicsToArray.mockResolvedValue([]);
    mockTopicsAdd.mockResolvedValue();
    mockTopicsDelete.mockResolvedValue();
    mockTopicsUpdate.mockResolvedValue(1);
    mockMessagesDelete.mockResolvedValue(0);
    mockHasAnyApiKey.mockReturnValue(false);

    useTopicStore.setState({
      topics: [makeTopic()],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  it('loadTopics sets error and notifies when DB query fails', async () => {
    mockTopicsToArray.mockRejectedValueOnce(new Error('db down'));

    await useTopicStore.getState().loadTopics();

    expect(useTopicStore.getState().loading).toBe(false);
    expect(useTopicStore.getState().error).toBe('Failed to load topics');
    expect(mockAddNotification).toHaveBeenCalledWith('Failed to load topics', 'db down');
  });

  it('createTopic returns null and notifies when DB insert fails', async () => {
    mockTopicsAdd.mockRejectedValueOnce(new Error('insert failed'));

    const created = await useTopicStore.getState().createTopic();

    expect(created).toBeNull();
    expect(mockAddNotification).toHaveBeenCalledWith('Failed to create topic', 'insert failed');
  });

  it('renameTopic notifies when DB update fails', async () => {
    mockTopicsUpdate.mockRejectedValueOnce(new Error('update failed'));

    await useTopicStore.getState().renameTopic('topic-1', 'Renamed topic');

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to rename topic', 'update failed');
  });

  it('loadTopics populates topics and clears loading/error flags on success', async () => {
    const loadedTopics: Topic[] = [
      makeTopic({ id: 'newer', name: 'Newer', updatedOn: '2024-01-03T00:00:00.000Z' }),
      makeTopic({ id: 'older', name: 'Older', updatedOn: '2024-01-01T00:00:00.000Z' }),
    ];
    mockTopicsToArray.mockResolvedValueOnce(loadedTopics);

    useTopicStore.setState({ loading: false, error: 'previous error', topics: [] });

    await useTopicStore.getState().loadTopics();

    const state = useTopicStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.topics).toEqual(loadedTopics);
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('createTopic persists and prepends the new topic to state', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: jest.fn(() => 'new-topic-id'),
      },
      configurable: true,
    });

    const existingTopic = makeTopic({ id: 'existing', name: 'Existing', updatedOn: '2024-01-01T00:00:00.000Z' });
    useTopicStore.setState({ topics: [existingTopic] });

    const created = await useTopicStore.getState().createTopic();

    expect(created).not.toBeNull();
    expect(created?.id).toBe('new-topic-id');
    expect(created?.name).toBe('New Topic');
    expect(mockTopicsAdd).toHaveBeenCalledTimes(1);

    const topics = useTopicStore.getState().topics;
    expect(topics[0].id).toBe('new-topic-id');
    expect(topics[1].id).toBe('existing');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('renameTopic updates target name and sorts topics by updatedOn desc', async () => {
    const t1 = makeTopic({ id: 't1', name: 'First', updatedOn: '2024-01-01T00:00:00.000Z' });
    const t2 = makeTopic({ id: 't2', name: 'Second', updatedOn: '2024-01-02T00:00:00.000Z' });
    useTopicStore.setState({ topics: [t1, t2] });

    await useTopicStore.getState().renameTopic('t1', 'Renamed First');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ name: 'Renamed First' });

    const topics = useTopicStore.getState().topics;
    expect(topics[0].id).toBe('t1');
    expect(topics[0].name).toBe('Renamed First');
    expect(topics[1].id).toBe('t2');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('generateTopicName exits when topic is missing', async () => {
    await useTopicStore.getState().generateTopicName('missing-topic', 'hello world');

    expect(mockTopicsUpdate).not.toHaveBeenCalled();
    expect(mockAskLlm).not.toHaveBeenCalled();
  });

  it('generateTopicName bumps timestamp but skips rename for already named topic', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1', name: 'Existing Name', updatedOn: '2024-01-01T00:00:00.000Z' })] });

    await useTopicStore.getState().generateTopicName('t1', 'hello world');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(Object.prototype.hasOwnProperty.call(mockTopicsUpdate.mock.calls[0][1], 'updatedOn')).toBe(true);
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.name).toBe('Existing Name');
    expect(mockAskLlm).not.toHaveBeenCalled();
  });

  it('generateTopicName uses local fallback when no API key exists', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1', name: 'New Topic' })] });
    mockHasAnyApiKey.mockReturnValue(false);

    await useTopicStore.getState().generateTopicName('t1', 'alpha beta gamma delta epsilon zeta eta theta');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(2);
    expect(mockTopicsUpdate.mock.calls[1][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[1][1]).toMatchObject({ name: 'alpha beta gamma delta epsilon zeta' });
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.name).toBe('alpha beta gamma delta epsilon zeta');
    expect(mockAskLlm).not.toHaveBeenCalled();
  });

  it('generateTopicName uses LLM result when API key exists', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1', name: 'New Topic' })] });
    mockHasAnyApiKey.mockReturnValue(true);

    const model = DEFAULT_MODELS[0];
    mockGetDefaultTopicNameModel.mockReturnValue(model);
    mockAskLlm.mockResolvedValue({
      content: '"Short AI Title"',
      rawContent: '"Short AI Title"',
      promptTokens: 12,
      completionTokens: 3,
      searchCount: 0,
    });

    await useTopicStore.getState().generateTopicName('t1', 'How do I configure retries for this provider?');

    expect(mockGetDefaultTopicNameModel).toHaveBeenCalledTimes(1);
    expect(mockAskLlm).toHaveBeenCalledTimes(1);
    expect(mockAskLlm.mock.calls[0][0]).toBe(model);
    expect(mockAskLlm.mock.calls[0][1]).toBe(1);
    expect(mockTopicsUpdate).toHaveBeenCalledTimes(2);
    expect(mockTopicsUpdate.mock.calls[1][1]).toMatchObject({ name: 'Short AI Title' });
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.name).toBe('Short AI Title');
  });

  it('generateTopicName falls back to message preview when LLM call fails', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1', name: 'New Topic' })] });
    mockHasAnyApiKey.mockReturnValue(true);

    const model = DEFAULT_MODELS[0];
    mockGetDefaultTopicNameModel.mockReturnValue(model);
    mockAskLlm.mockRejectedValueOnce(new Error('llm offline'));

    await useTopicStore.getState().generateTopicName('t1', 'one two three four five six seven eight');

    expect(mockAskLlm).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate).toHaveBeenCalledTimes(2);
    expect(mockTopicsUpdate.mock.calls[1][1]).toMatchObject({ name: 'one two three four five six' });
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.name).toBe('one two three four five six');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('updateTopicScratchpad updates scratchpad and sorts by updatedOn desc', async () => {
    const t1 = makeTopic({ id: 't1', name: 'First', updatedOn: '2024-01-01T00:00:00.000Z' });
    const t2 = makeTopic({ id: 't2', name: 'Second', updatedOn: '2024-01-02T00:00:00.000Z' });
    useTopicStore.setState({ topics: [t1, t2] });

    await useTopicStore.getState().updateTopicScratchpad('t1', 'Use concise answers');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ scratchpad: 'Use concise answers' });

    const topics = useTopicStore.getState().topics;
    expect(topics[0].id).toBe('t1');
    expect(topics[0].scratchpad).toBe('Use concise answers');
    expect(topics[1].id).toBe('t2');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('updateTopicScratchpad notifies when DB update fails', async () => {
    mockTopicsUpdate.mockRejectedValueOnce(new Error('scratchpad update failed'));

    await useTopicStore.getState().updateTopicScratchpad('topic-1', 'new notes');

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to update scratchpad', 'scratchpad update failed');
  });

  it('updateTopicTimestamp updates timestamp and reorders topics', async () => {
    const t1 = makeTopic({ id: 't1', name: 'First', updatedOn: '2024-01-01T00:00:00.000Z' });
    const t2 = makeTopic({ id: 't2', name: 'Second', updatedOn: '2024-01-02T00:00:00.000Z' });
    useTopicStore.setState({ topics: [t1, t2] });

    await useTopicStore.getState().updateTopicTimestamp('t1');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({});
    expect(Object.prototype.hasOwnProperty.call(mockTopicsUpdate.mock.calls[0][1], 'updatedOn')).toBe(true);

    const topics = useTopicStore.getState().topics;
    expect(topics[0].id).toBe('t1');
    expect(topics[1].id).toBe('t2');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('updateTopicPromptSelection updates selected prompts', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1' }), makeTopic({ id: 't2' })] });

    await useTopicStore.getState().updateTopicPromptSelection('t1', ['p1', 'p2']);

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ selectedPromptIds: ['p1', 'p2'] });

    const updated = useTopicStore.getState().topics.find((t) => t.id === 't1');
    expect(updated?.selectedPromptIds).toEqual(['p1', 'p2']);
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('updateTopicPromptSelection notifies when DB update fails', async () => {
    mockTopicsUpdate.mockRejectedValueOnce(new Error('selection update failed'));

    await useTopicStore.getState().updateTopicPromptSelection('topic-1', ['p1']);

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to update selection', 'selection update failed');
  });

  it('switchFork updates active fork and state', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1', activeForkId: 'main' })] });

    await useTopicStore.getState().switchFork('t1', 'fork-2');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ activeForkId: 'fork-2' });
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.activeForkId).toBe('fork-2');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('switchFork notifies when DB update fails', async () => {
    mockTopicsUpdate.mockRejectedValueOnce(new Error('switch failed'));

    await useTopicStore.getState().switchFork('topic-1', 'fork-2');

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to switch tab', 'switch failed');
  });

  it('deleteFork removes non-active fork and deletes matching messages', async () => {
    const topic = makeTopic({
      id: 't1',
      activeForkId: 'main',
      forks: [
        { id: 'main', name: 'Main', createdOn: '2024-01-01T00:00:00.000Z' },
        { id: 'fork-2', name: 'Fork 2', createdOn: '2024-01-02T00:00:00.000Z' },
      ],
    });
    useTopicStore.setState({ topics: [topic] });

    mockDbMessages = [
      makeMessage({ id: 'm-main', topicId: 't1', type: 'user', content: 'main', created: '2024-01-01T00:00:00.000Z', forkId: 'main' }),
      makeMessage({ id: 'm-fork', topicId: 't1', type: 'user', content: 'fork', created: '2024-01-01T00:01:00.000Z', forkId: 'fork-2' }),
    ];
    mockMessagesDelete.mockResolvedValueOnce(1);

    await useTopicStore.getState().deleteFork('t1', 'fork-2');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ activeForkId: 'main' });
    expect(mockMessagesDelete).toHaveBeenCalledTimes(1);
    expect(mockMessagesDelete.mock.calls[0][0].map((m) => m.id)).toEqual(['m-fork']);

    const updated = useTopicStore.getState().topics.find((t) => t.id === 't1');
    expect(updated?.forks?.map((f) => f.id)).toEqual(['main']);
    expect(updated?.activeForkId).toBe('main');
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('deleteFork switches active fork when deleting current one', async () => {
    const topic = makeTopic({
      id: 't1',
      activeForkId: 'fork-2',
      forks: [
        { id: 'main', name: 'Main', createdOn: '2024-01-01T00:00:00.000Z' },
        { id: 'fork-2', name: 'Fork 2', createdOn: '2024-01-02T00:00:00.000Z' },
      ],
    });
    useTopicStore.setState({ topics: [topic] });

    await useTopicStore.getState().deleteFork('t1', 'fork-2');

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ activeForkId: 'main' });
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.activeForkId).toBe('main');
  });

  it('deleteFork notifies when DB update fails', async () => {
    useTopicStore.setState({
      topics: [
        makeTopic({
          id: 't1',
          activeForkId: 'main',
          forks: [
            { id: 'main', name: 'Main', createdOn: '2024-01-01T00:00:00.000Z' },
            { id: 'fork-2', name: 'Fork 2', createdOn: '2024-01-02T00:00:00.000Z' },
          ],
        }),
      ],
    });
    mockTopicsUpdate.mockRejectedValueOnce(new Error('delete failed'));

    await useTopicStore.getState().deleteFork('t1', 'fork-2');

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to delete branch', 'delete failed');
  });

  it('deleteTopic removes topic from store on success', async () => {
    useTopicStore.setState({
      topics: [makeTopic({ id: 't1', name: 'Topic 1' }), makeTopic({ id: 't2', name: 'Topic 2' })],
    });

    await useTopicStore.getState().deleteTopic('t1');

    expect(mockTopicsDelete).toHaveBeenCalledTimes(1);
    expect(mockTopicsDelete).toHaveBeenCalledWith('t1');
    expect(useTopicStore.getState().topics.map((t) => t.id)).toEqual(['t2']);
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('deleteTopic notifies when DB delete fails', async () => {
    mockTopicsDelete.mockRejectedValueOnce(new Error('topic delete failed'));

    await useTopicStore.getState().deleteTopic('topic-1');

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to delete topic', 'topic delete failed');
  });

  it('updateTopicMaxContextMessages persists and updates state', async () => {
    useTopicStore.setState({ topics: [makeTopic({ id: 't1', maxContextMessages: 8 }), makeTopic({ id: 't2', maxContextMessages: 12 })] });

    await useTopicStore.getState().updateTopicMaxContextMessages('t1', 24);

    expect(mockTopicsUpdate).toHaveBeenCalledTimes(1);
    expect(mockTopicsUpdate.mock.calls[0][0]).toBe('t1');
    expect(mockTopicsUpdate.mock.calls[0][1]).toMatchObject({ maxContextMessages: 24 });
    expect(useTopicStore.getState().topics.find((t) => t.id === 't1')?.maxContextMessages).toBe(24);
    expect(useTopicStore.getState().topics.find((t) => t.id === 't2')?.maxContextMessages).toBe(12);
    expect(mockAddNotification).not.toHaveBeenCalled();
  });

  it('updateTopicMaxContextMessages notifies when DB update fails', async () => {
    mockTopicsUpdate.mockRejectedValueOnce(new Error('context update failed'));

    await useTopicStore.getState().updateTopicMaxContextMessages('topic-1', 99);

    expect(mockAddNotification).toHaveBeenCalledWith('Failed to update context limit', 'context update failed');
  });

  it('getTopicTokenCount includes instructions, selected prompts, scratchpad, and mixed context token paths', async () => {
    useTopicStore.setState({
      topics: [makeTopic({ id: 'token-topic', scratchpad: 'remember this', selectedPromptIds: ['p1', 'p3'] })],
    });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 4,
      maxContextTokens: 10000,
      messageRetrievalEnabled: true,
      ragEnabled: false,
      customInstructions: 'Be concise',
      scratchpadRules: 'Limit is {{SCRATCHPAD_LIMIT}} chars',
      predefinedPrompts: [
        { id: 'p1', name: 'Prompt 1', content: 'Always cite sources' },
        { id: 'p2', name: 'Prompt 2', content: 'Unused prompt' },
        { id: 'p3', name: 'Prompt 3', content: 'Answer in bullets' },
      ],
    });

    const contextMessages: Message[] = [
      makeMessage({ id: 'ctx-1', topicId: 'token-topic', type: 'user', content: 'Question', created: '2024-01-01T00:00:00.000Z' }),
      makeMessage({
        id: 'ctx-2',
        topicId: 'token-topic',
        type: 'assistant',
        content: 'Answer',
        created: '2024-01-01T00:01:00.000Z',
        promptTokens: 5,
        completionTokens: 7,
      }),
    ];

    const getTopicContextSpy = jest.spyOn(useTopicStore.getState(), 'getTopicContext').mockResolvedValue(contextMessages);

    const total = await useTopicStore.getState().getTopicTokenCount('token-topic');

    const expected =
      `system: Be concise`.length +
      `system: Always cite sources`.length +
      `system: Answer in bullets`.length +
      `system: Limit is ${String(SCRATCHPAD_LIMIT)} chars`.length +
      `system: remember this`.length +
      `user: Question`.length +
      12;

    expect(total).toBe(expected);
    expect(getTopicContextSpy).toHaveBeenCalledWith('token-topic');
    getTopicContextSpy.mockRestore();
  });

  it('getTopicTokenCount uses empty scratchpad fallback when topic is missing', async () => {
    useTopicStore.setState({ topics: [] });
    mockAuthGetState.mockReturnValue({
      defaultMaxContextMessages: 4,
      maxContextTokens: 10000,
      messageRetrievalEnabled: true,
      ragEnabled: false,
      customInstructions: '   ',
      scratchpadRules: 'Rules {{SCRATCHPAD_LIMIT}}',
      predefinedPrompts: [],
    });

    const total = await useTopicStore.getState().getTopicTokenCount('missing-topic');

    const expected = `system: Rules ${String(SCRATCHPAD_LIMIT)}`.length + `system: (Empty)`.length;
    expect(total).toBe(expected);
  });

  it('getTopicTotalCost sums matching message costs', async () => {
    mockDbMessages = [
      makeMessage({ id: 'm1', topicId: 'cost-topic', type: 'user', content: 'one', created: '2024-01-01T00:00:00.000Z', totalCost: 1.25 }),
      makeMessage({ id: 'm2', topicId: 'cost-topic', type: 'assistant', content: 'two', created: '2024-01-01T00:01:00.000Z', totalCost: 2.75 }),
      makeMessage({ id: 'm3', topicId: 'other-topic', type: 'user', content: 'other', created: '2024-01-01T00:02:00.000Z', totalCost: 9.9 }),
      makeMessage({ id: 'm4', topicId: 'cost-topic', type: 'assistant', content: 'missing', created: '2024-01-01T00:03:00.000Z' }),
    ];

    const total = await useTopicStore.getState().getTopicTotalCost('cost-topic');

    expect(total).toBe(4);
  });

  it('getTopicTotalCost returns 0 when topic has no messages', async () => {
    mockDbMessages = [
      makeMessage({ id: 'm1', topicId: 'different-topic', type: 'user', content: 'x', created: '2024-01-01T00:00:00.000Z', totalCost: 3 }),
    ];

    const total = await useTopicStore.getState().getTopicTotalCost('missing-topic');

    expect(total).toBe(0);
  });
});
