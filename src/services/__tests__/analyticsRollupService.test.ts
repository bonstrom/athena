import type { AnalyticsSnapshot, Message } from '../../database/AthenaDb';

const mockMessagesToArray = jest.fn<Promise<Message[]>, []>();
const mockWhereAboveOrEqual = jest.fn<{ toArray: () => Promise<Message[]> }, [string]>();
const mockWhereCreated = jest.fn<{ aboveOrEqual: (marker: string) => { toArray: () => Promise<Message[]> } }, [string]>();

const mockSnapshotGet = jest.fn<Promise<AnalyticsSnapshot | undefined>, [string]>();
const mockSnapshotPut = jest.fn<Promise<string>, [AnalyticsSnapshot]>();
const mockSnapshotToArray = jest.fn<Promise<AnalyticsSnapshot[]>, []>();

const mockMessagesSortBy = jest.fn().mockResolvedValue([]);

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      toArray: (): Promise<Message[]> => mockMessagesToArray(),
      where: (field: string) => {
        if (field === 'created') {
          return mockWhereCreated(field);
        }
        return {
          equals: () => ({
            and: () => ({ sortBy: mockMessagesSortBy }),
            sortBy: mockMessagesSortBy,
          }),
        };
      },
    },
    analyticsSnapshots: {
      get: (date: string): Promise<AnalyticsSnapshot | undefined> => mockSnapshotGet(date),
      put: (snap: AnalyticsSnapshot): Promise<string> => mockSnapshotPut(snap),
      toArray: (): Promise<AnalyticsSnapshot[]> => mockSnapshotToArray(),
      orderBy: (): { reverse: () => { limit: (n: number) => { toArray: () => Promise<AnalyticsSnapshot[]> } } } => ({
        reverse: () => ({
          limit: (n: number) => ({
            toArray: (): Promise<AnalyticsSnapshot[]> => mockSnapshotToArray(),
          }),
        }),
      }),
    },
  },
  AnalyticsSnapshot: {} as unknown,
}));

const mockModels: UserChatModel[] = [];
const mockProviders: LlmProvider[] = [];
const mockGetState = jest.fn<{ models: UserChatModel[]; providers: LlmProvider[] }, []>();

jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: {
    getState: () => mockGetState(),
  },
}));

import type { UserChatModel, LlmProvider } from '../../types/provider';
import { rollupAnalytics, resolveProviderName } from '../analyticsRollupService';

const localStorageBackup = { ...localStorage };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  Object.keys(localStorageBackup).forEach((k) => { try { localStorage.removeItem(k); } catch { /* noop */ } });
  mockMessagesToArray.mockResolvedValue([]);
  mockWhereAboveOrEqual.mockReturnValue({ toArray: (): Promise<Message[]> => mockMessagesToArray() });
  mockWhereCreated.mockReturnValue({ aboveOrEqual: (marker: string) => ({ toArray: (): Promise<Message[]> => mockMessagesToArray() }) });
  mockSnapshotGet.mockResolvedValue(undefined);
  mockSnapshotPut.mockResolvedValue('ok');
  mockSnapshotToArray.mockResolvedValue([]);
  mockGetState.mockReturnValue({ models: mockModels, providers: mockProviders });
});

function setRollupMarker(ts: string): void {
  localStorage.setItem('analyticsRollupMarker', ts);
}

function getRollupMarker(): string | null {
  return localStorage.getItem('analyticsRollupMarker');
}

function getRollupLastId(): string | null {
  return localStorage.getItem('analyticsRollupLastId');
}

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    topicId: 'topic-1',
    forkId: 'main',
    type: 'assistant',
    content: 'test',
    isDeleted: false,
    includeInContext: false,
    created: '2026-01-01T12:00:00.000Z',
    failed: false,
    promptTokens: 100,
    completionTokens: 50,
    totalCost: 0.01,
    ...overrides,
  };
}

describe('resolveProviderName', () => {
  it('returns provider name when model found', () => {
    mockModels.push({ id: 'm1', apiModelId: 'gpt-4', providerId: 'p1', label: 'GPT-4' } as UserChatModel);
    mockProviders.push({ id: 'p1', name: 'OpenAI' } as LlmProvider);
    mockGetState.mockReturnValue({ models: mockModels, providers: mockProviders });

    expect(resolveProviderName('gpt-4')).toBe('OpenAI');
  });

  it('returns unknown when model not found', () => {
    mockGetState.mockReturnValue({ models: [], providers: [] });
    expect(resolveProviderName('nonexistent')).toBe('unknown');
  });

  it('returns unknown when modelApiId is undefined', () => {
    expect(resolveProviderName(undefined)).toBe('unknown');
  });
});

describe('rollupAnalytics', () => {
  it('processes all messages on first run (no marker)', async () => {
    const msgs = [
      makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', promptTokens: 10, completionTokens: 5, totalCost: 0.001 }),
      makeMsg({ id: 'b', created: '2026-01-02T10:00:00.000Z', promptTokens: 20, completionTokens: 10, totalCost: 0.002 }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    expect(mockSnapshotPut).toHaveBeenCalledTimes(2);
    expect(getRollupMarker()).toBe('2026-01-02T10:00:00.000Z');
    expect(getRollupLastId()).toBe('b');
  });

  it('only processes messages after marker on subsequent runs', async () => {
    setRollupMarker('2026-01-01T10:00:00.000Z');
    localStorage.setItem('analyticsRollupLastId', 'a');

    const msgs = [
      makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z' }),
      makeMsg({ id: 'b', created: '2026-01-02T10:00:00.000Z' }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const snapshotCalls = mockSnapshotPut.mock.calls;
    expect(snapshotCalls.length).toBe(1);
    const snap = snapshotCalls[0][0];
    expect(snap.date).toBe('2026-01-02');
    expect(getRollupMarker()).toBe('2026-01-02T10:00:00.000Z');
    expect(getRollupLastId()).toBe('b');
  });

  it('correctly deduplicates messages at same timestamp as marker', async () => {
    setRollupMarker('2026-01-01T12:00:00.000Z');
    localStorage.setItem('analyticsRollupLastId', 'msg-dup');

    const msgs = [
      makeMsg({ id: 'msg-dup', created: '2026-01-01T12:00:00.000Z' }),
      makeMsg({ id: 'msg-new', created: '2026-01-01T12:00:00.000Z' }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const snapshotCalls = mockSnapshotPut.mock.calls;
    const count = snapshotCalls.length;
    expect(count).toBe(1);
    const snap = snapshotCalls[0][0];
    expect(snap.messageCount).toBe(1);
    expect(getRollupMarker()).toBe('2026-01-01T12:00:00.000Z');
    expect(getRollupLastId()).toBe('msg-new');
  });

  it('merges multiple calls for the same day', async () => {
    const existing: AnalyticsSnapshot = {
      date: '2026-01-01',
      messageCount: 3,
      failedCount: 1,
      promptTokens: 100,
      completionTokens: 50,
      cost: 0.10,
      latencySamples: [100, 200],
      providerStats: { OpenAI: { cost: 0.10, tokens: 150, messageCount: 3 } },
      toolStats: { scratchpad: { calls: 2, successCount: 2 } },
    };
    mockSnapshotGet.mockResolvedValue(existing);

    const msgs = [makeMsg({ id: 'c', created: '2026-01-01T14:00:00.000Z', promptTokens: 50, completionTokens: 25, totalCost: 0.05 })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const merged = mockSnapshotPut.mock.calls[0][0];
    expect(merged.messageCount).toBe(4);
    expect(merged.failedCount).toBe(1);
    expect(merged.promptTokens).toBe(150);
    expect(merged.completionTokens).toBe(75);
    expect(merged.cost).toBeCloseTo(0.15);
    expect(merged.latencySamples).toEqual([100, 200]);
    expect(merged.providerStats).toEqual({
      OpenAI: { cost: 0.10, tokens: 150, messageCount: 3 },
      unknown: { cost: 0.05, tokens: 75, messageCount: 1 },
    });
  });

  it('merges provider stats correctly for same provider', async () => {
    const existing: AnalyticsSnapshot = {
      date: '2026-01-01',
      messageCount: 1,
      failedCount: 0,
      promptTokens: 10,
      completionTokens: 5,
      cost: 0.01,
      latencySamples: [],
      providerStats: { OpenAI: { cost: 0.01, tokens: 15, messageCount: 1 } },
      toolStats: {},
    };
    mockSnapshotGet.mockResolvedValue(existing);

    mockModels.push({ id: 'm1', apiModelId: 'gpt-4', providerId: 'p1', label: 'GPT-4' } as UserChatModel);
    mockProviders.push({ id: 'p1', name: 'OpenAI' } as LlmProvider);
    mockGetState.mockReturnValue({ models: mockModels, providers: mockProviders });

    const msgs = [makeMsg({ id: 'c', created: '2026-01-01T14:00:00.000Z', model: 'gpt-4', promptTokens: 20, completionTokens: 10, totalCost: 0.02 })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const merged = mockSnapshotPut.mock.calls[0][0];
    expect(merged.providerStats).toEqual({ OpenAI: { cost: 0.03, tokens: 45, messageCount: 2 } });
  });

  it('caps latency samples at MAX_LATENCY_SAMPLES', async () => {
    const manySamples = Array.from({ length: 290 }, (_, i) => i + 1);
    const existing: AnalyticsSnapshot = {
      date: '2026-01-01',
      messageCount: 0,
      failedCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      latencySamples: manySamples,
      providerStats: {},
      toolStats: {},
    };
    mockSnapshotGet.mockResolvedValue(existing);

    const msgs = Array.from({ length: 20 }, (_, i) =>
      makeMsg({ id: `lat-${i}`, created: '2026-01-01T14:00:00.000Z', latencyMs: 500 + i })
    );
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const merged = mockSnapshotPut.mock.calls[0][0];
    expect(merged.latencySamples!.length).toBe(300);
  });

  it('accumulates failed count', async () => {
    const msgs = [
      makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', failed: true }),
      makeMsg({ id: 'b', created: '2026-01-01T11:00:00.000Z', failed: false }),
      makeMsg({ id: 'c', created: '2026-01-01T12:00:00.000Z', failed: true }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const snap = mockSnapshotPut.mock.calls[0][0];
    expect(snap.failedCount).toBe(2);
    expect(snap.messageCount).toBe(3);
  });

  it('skips rollup when no new messages', async () => {
    setRollupMarker('2026-01-03T00:00:00.000Z');
    localStorage.setItem('analyticsRollupLastId', 'last');
    mockMessagesToArray.mockResolvedValue([]);

    await rollupAnalytics();

    expect(mockSnapshotPut).not.toHaveBeenCalled();
  });

  it('extracts tool usage from rawResponse', async () => {
    const debugPayload = JSON.stringify({
      toolLoopTrace: [
        {
          iteration: 1,
          llmResponse: {},
          toolResults: [
            { toolCallId: 't1', toolName: 'update_scratchpad', result: 'Saved successfully' },
            { toolCallId: 't2', toolName: 'read_messages', result: 'Error: not found' },
          ],
        },
      ],
    });

    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', rawResponse: debugPayload })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const snap = mockSnapshotPut.mock.calls[0][0];
    expect(snap.toolStats).toEqual({
      update_scratchpad: { calls: 1, successCount: 1 },
      read_messages: { calls: 1, successCount: 0 },
    });
  });

  it('handles missing toolLoopTrace gracefully', async () => {
    const debugPayload = JSON.stringify({ usageDetails: { promptTokens: 10, completionTokens: 5 }, timestamp: 'x' });
    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', rawResponse: debugPayload })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const snap = mockSnapshotPut.mock.calls[0][0];
    expect(snap.toolStats).toEqual({});
  });

  it('handles invalid JSON in rawResponse gracefully', async () => {
    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', rawResponse: 'not-json' })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    const snap = mockSnapshotPut.mock.calls[0][0];
    expect(snap.toolStats).toEqual({});
  });

  it('tracks cost per day correctly', async () => {
    const msgs = [
      makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', totalCost: 0.05 }),
      makeMsg({ id: 'b', created: '2026-01-01T11:00:00.000Z', totalCost: 0.03 }),
      makeMsg({ id: 'c', created: '2026-01-02T10:00:00.000Z', totalCost: 0.10 }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    expect(mockSnapshotPut).toHaveBeenCalledTimes(2);
    const day1 = mockSnapshotPut.mock.calls[0][0];
    const day2 = mockSnapshotPut.mock.calls[1][0];
    expect(day1.date).toBe('2026-01-01');
    expect(day1.cost).toBeCloseTo(0.08);
    expect(day2.date).toBe('2026-01-02');
    expect(day2.cost).toBeCloseTo(0.10);
  });

  it('handles empty message list on first run', async () => {
    mockMessagesToArray.mockResolvedValue([]);

    await rollupAnalytics();

    expect(mockSnapshotPut).not.toHaveBeenCalled();
    expect(getRollupMarker()).toBeNull();
  });

  it('advances marker to latest message in batch', async () => {
    const msgs = [
      makeMsg({ id: 'a', created: '2026-01-01T08:00:00.000Z' }),
      makeMsg({ id: 'b', created: '2026-01-03T20:00:00.000Z' }),
      makeMsg({ id: 'c', created: '2026-01-02T12:00:00.000Z' }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    expect(getRollupMarker()).toBe('2026-01-03T20:00:00.000Z');
    expect(getRollupLastId()).toBe('b');
  });
});
