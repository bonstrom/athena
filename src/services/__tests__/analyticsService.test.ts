import type { AnalyticsSnapshot } from '../../database/AthenaDb';

let mockSnapshots: AnalyticsSnapshot[] = [];
const mockSnapshotToArray = jest.fn<Promise<AnalyticsSnapshot[]>, []>();
const mockSnapshotGet = jest.fn<Promise<AnalyticsSnapshot | undefined>, [string]>();
const mockMessagesToArray = jest.fn<Promise<Message[]>, []>();
const mockReverseLimitToArray = jest.fn<Promise<AnalyticsSnapshot[]>, []>();

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: {
    getState: (): Record<string, unknown> => ({
      deviceId: 'test-device',
      messageRetrievalEnabled: false,
      askUserEnabled: false,
      aiSummaryEnabled: false,
      summaryModel: 'test',
      replyPredictionEnabled: false,
      llmSuggestionEnabled: false,
      ragEnabled: false,
      ttsEnabled: false,
      maxContextTokens: 128000,
      defaultMaxContextMessages: 20,
    }),
  },
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      toArray: (): Promise<Message[]> => mockMessagesToArray(),
    },
    topics: {
      toArray: (): Promise<unknown[]> => Promise.resolve([]),
    },
    analyticsSnapshots: {
      toArray: (): Promise<AnalyticsSnapshot[]> => mockSnapshotToArray(),
      get: (date: string): Promise<AnalyticsSnapshot | undefined> => mockSnapshotGet(date),
      reverse: () => ({
        sortBy: (): Promise<AnalyticsSnapshot[]> => mockSnapshotToArray(),
      }),
      orderBy: (): { reverse: () => { limit: (n: number) => { toArray: () => Promise<AnalyticsSnapshot[]> } } } => ({
        reverse: () => ({
          limit: (_n: number) => ({
            toArray: (): Promise<AnalyticsSnapshot[]> => mockReverseLimitToArray(),
          }),
        }),
      }),
    },
  },
}));

const mockModels: UserChatModel[] = [];
const mockProviders: LlmProvider[] = [];

jest.mock('../../services/analyticsRollupService', () => ({
  resolveProviderName: (modelApiId: string | undefined): string => {
    if (!modelApiId) return 'unknown';
    const model = mockModels.find((m) => m.apiModelId === modelApiId);
    if (!model) return 'unknown';
    const provider = mockProviders.find((p) => p.id === model.providerId);
    return provider?.name ?? 'unknown';
  },
}));

import type { Message } from '../../database/AthenaDb';
import type { UserChatModel, LlmProvider } from '../../types/provider';
import {
  computeTrends,
  computeLatencyPercentiles,
  computeProviderBreakdown,
  computeToolUsageBreakdown,
  importAnalytics,
  exportAnalytics,
} from '../analyticsService';

beforeEach(() => {
  jest.clearAllMocks();
  mockSnapshots = [];
  mockSnapshotToArray.mockImplementation((): Promise<AnalyticsSnapshot[]> => Promise.resolve([...mockSnapshots]));
  mockReverseLimitToArray.mockImplementation((): Promise<AnalyticsSnapshot[]> => Promise.resolve([...mockSnapshots].reverse()));
  mockSnapshotGet.mockImplementation((date: string): Promise<AnalyticsSnapshot | undefined> =>
    Promise.resolve(mockSnapshots.find((s) => s.date === date))
  );
  mockMessagesToArray.mockResolvedValue([]);
  mockModels.length = 0;
  mockProviders.length = 0;
});

function makeSnapshot(overrides: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return {
    date: '2026-01-01',
    messageCount: 10,
    failedCount: 1,
    promptTokens: 1000,
    completionTokens: 500,
    cost: 0.50,
    latencySamples: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
    providerStats: {},
    toolStats: {},
    ...overrides,
  };
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

describe('computeTrends', () => {
  it('returns trend rows from snapshots', async () => {
    mockSnapshots = [
      makeSnapshot({ date: '2026-01-01', messageCount: 5, cost: 0.25, promptTokens: 500, completionTokens: 250, failedCount: 1, latencySamples: [100, 200] }),
      makeSnapshot({ date: '2026-01-02', messageCount: 10, cost: 0.50, promptTokens: 1000, completionTokens: 500, failedCount: 0, latencySamples: [150, 250, 350] }),
    ];

    const trends = await computeTrends(7);

    expect(trends).toHaveLength(2);
    expect(trends[0].date).toBe('2026-01-01');
    expect(trends[0].messageCount).toBe(5);
    expect(trends[0].cost).toBe(0.25);
    expect(trends[0].tokens).toBe(750);
    expect(trends[0].failPercent).toBe(20);
    expect(trends[1].date).toBe('2026-01-02');
    expect(trends[1].messageCount).toBe(10);
    expect(trends[1].failPercent).toBe(0);
  });

  it('returns empty array when no snapshots', async () => {
    mockSnapshots = [];
    const trends = await computeTrends(7);
    expect(trends).toEqual([]);
  });

  it('computes p50 and p95 from latency samples', async () => {
    mockSnapshots = [
      makeSnapshot({
        date: '2026-01-01',
        latencySamples: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      }),
    ];

    const trends = await computeTrends(7);
    expect(trends[0].p50Latency).toBe(50);
    expect(trends[0].p95Latency).toBe(90);
  });

  it('returns null percentiles when no samples', async () => {
    mockSnapshots = [makeSnapshot({ date: '2026-01-01', latencySamples: [] })];
    const trends = await computeTrends(7);
    expect(trends[0].p50Latency).toBeNull();
    expect(trends[0].p95Latency).toBeNull();
  });
});

describe('computeLatencyPercentiles', () => {
  it('pools all latency samples across snapshots', async () => {
    mockSnapshots = [
      makeSnapshot({ date: '2026-01-01', latencySamples: [10, 30, 50, 70, 90] }),
      makeSnapshot({ date: '2026-01-02', latencySamples: [20, 40, 60, 80, 100] }),
    ];

    const result = await computeLatencyPercentiles();
    expect(result.p50).toBe(50);
    expect(result.p95).toBe(90);
  });

  it('returns null when no samples', async () => {
    mockSnapshots = [];
    const result = await computeLatencyPercentiles();
    expect(result.p50).toBeNull();
    expect(result.p95).toBeNull();
  });
});

describe('computeProviderBreakdown', () => {
  it('aggregates provider stats from snapshots', async () => {
    mockSnapshots = [
      makeSnapshot({
        date: '2026-01-01',
        providerStats: {
          OpenAI: { cost: 0.50, tokens: 1000, messageCount: 5 },
          DeepSeek: { cost: 0.20, tokens: 500, messageCount: 3 },
        },
      }),
      makeSnapshot({
        date: '2026-01-02',
        providerStats: {
          OpenAI: { cost: 0.30, tokens: 600, messageCount: 3 },
        },
      }),
    ];

    const result = await computeProviderBreakdown();
    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe('OpenAI');
    expect(result[0].cost).toBe(0.80);
    expect(result[0].messages).toBe(8);
    expect(result[0].tokens).toBe(1600);
    expect(result[1].provider).toBe('DeepSeek');
    expect(result[1].cost).toBe(0.20);
  });

  it('falls back to message scan when no snapshots', async () => {
    mockSnapshots = [];
    mockModels.push({ id: 'm1', apiModelId: 'gpt-4', providerId: 'p1', label: 'GPT-4' } as UserChatModel);
    mockProviders.push({ id: 'p1', name: 'OpenAI' } as LlmProvider);
    mockMessagesToArray.mockResolvedValue([
      makeMsg({ model: 'gpt-4', promptTokens: 100, completionTokens: 50, totalCost: 0.01 }),
      makeMsg({ model: 'gpt-4', promptTokens: 200, completionTokens: 100, totalCost: 0.02 }),
    ]);

    const result = await computeProviderBreakdown();
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('OpenAI');
    expect(result[0].messages).toBe(2);
    expect(result[0].cost).toBe(0.03);
  });
});

describe('computeToolUsageBreakdown', () => {
  it('aggregates tool stats from snapshots', async () => {
    mockSnapshots = [
      makeSnapshot({
        date: '2026-01-01',
        toolStats: {
          update_scratchpad: { calls: 10, successCount: 8 },
          read_messages: { calls: 5, successCount: 3 },
        },
      }),
    ];

    const result = await computeToolUsageBreakdown();
    expect(result).toHaveLength(2);
    expect(result[0].tool).toBe('update_scratchpad');
    expect(result[0].calls).toBe(10);
    expect(result[0].successRate).toBe(80);
    expect(result[1].tool).toBe('read_messages');
    expect(result[1].calls).toBe(5);
    expect(result[1].successRate).toBe(60);
  });

  it('falls back to message scan when no snapshots', async () => {
    mockSnapshots = [];
    const debugPayload = JSON.stringify({
      toolLoopTrace: [
        {
          iteration: 1,
          toolResults: [
            { toolCallId: 't1', toolName: 'update_scratchpad', result: 'Saved' },
            { toolCallId: 't2', toolName: 'update_scratchpad', result: 'Error: full' },
          ],
        },
      ],
    });
    mockMessagesToArray.mockResolvedValue([
      makeMsg({ rawResponse: debugPayload }),
    ]);

    const result = await computeToolUsageBreakdown();
    expect(result).toHaveLength(1);
    expect(result[0].tool).toBe('update_scratchpad');
    expect(result[0].calls).toBe(2);
    expect(result[0].successRate).toBe(50);
  });

  it('handles empty snapshots and empty messages', async () => {
    mockSnapshots = [];
    mockMessagesToArray.mockResolvedValue([]);

    const result = await computeToolUsageBreakdown();
    expect(result).toEqual([]);
  });
});

describe('exportAnalytics / importAnalytics backward compatibility', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const origRevoke = URL.revokeObjectURL;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const origCreate = URL.createObjectURL;

  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { value: jest.fn((): string => 'blob:test'), configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true, writable: true });
  });

  afterAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { value: origCreate, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: origRevoke, configurable: true, writable: true });
  });

  it('exports with athena-analytics-v2 format', async () => {
    mockMessagesToArray.mockResolvedValue([]);
    mockSnapshotToArray.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation(jest.fn());
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const removeChildSpy = jest.spyOn(document.body, 'removeChild').mockImplementation(jest.fn());
    const clickSpy = jest.fn();
    const createElementSpy = jest.spyOn(document, 'createElement').mockReturnValue({ href: '', download: '', click: clickSpy } as unknown as HTMLElement);

    await exportAnalytics('test-user');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('importAnalytics accepts v1 format', async () => {
    const v1Data = JSON.stringify({
      format: 'athena-analytics-v1',
      deviceId: 'device-1',
      userId: 'user-1',
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '1.0',
      stats: {
        totalMessages: 100,
        totalCost: 5.0,
        messagesByType: {},
        messagesByModel: {},
        messageSizeDistribution: {},
        features: {},
      },
    });
    const file = new File([v1Data], 'test.json', { type: 'application/json' });

    const result = await importAnalytics(file);
    expect(result.success).toBe(true);
    expect(result.message).toContain('user-1');
  });

  it('importAnalytics accepts v2 format', async () => {
    const v2Data = JSON.stringify({
      format: 'athena-analytics-v2',
      deviceId: 'device-2',
      userId: 'user-2',
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '2.0',
      stats: {
        totalMessages: 200,
        totalCost: 10.0,
        messagesByType: {},
        messagesByModel: {},
        messageSizeDistribution: {},
        features: {},
      },
    });
    const file = new File([v2Data], 'test.json', { type: 'application/json' });

    const result = await importAnalytics(file);
    expect(result.success).toBe(true);
  });

  it('importAnalytics rejects invalid format', async () => {
    const invalidData = JSON.stringify({ format: 'athena-analytics-unknown', deviceId: 'd', stats: {} });
    const file = new File([invalidData], 'test.json', { type: 'application/json' });

    const result = await importAnalytics(file);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid analytics file format');
  });

  it('importAnalytics rejects missing required fields', async () => {
    const badData = JSON.stringify({ format: 'athena-analytics-v1' });
    const file = new File([badData], 'test.json', { type: 'application/json' });

    const result = await importAnalytics(file);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Missing required fields');
  });
});
