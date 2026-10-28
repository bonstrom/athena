/* eslint-disable @typescript-eslint/explicit-function-return-type, unused-imports/no-unused-vars, @typescript-eslint/no-non-null-assertion */
import type { AnalyticsSnapshot, LlmOperationUsage, Message } from '../../database/AthenaDb';

const mockMessagesToArray = jest.fn<Promise<Message[]>, []>();
const mockOperationUsagesToArray = jest.fn<Promise<LlmOperationUsage[]>, []>();
const mockWhereAboveOrEqual = jest.fn<{ toArray: () => Promise<Message[]> }, [string]>();
const mockWhereCreated = jest.fn<{ aboveOrEqual: (marker: string) => { toArray: () => Promise<Message[]> } }, [string]>();

const mockSnapshotGet = jest.fn<Promise<AnalyticsSnapshot | undefined>, [string]>();
const mockSnapshotPut = jest.fn<Promise<string>, [AnalyticsSnapshot]>();
const mockSnapshotToArray = jest.fn<Promise<AnalyticsSnapshot[]>, []>();
const mockSnapshotClear = jest.fn<Promise<void>, []>();

const mockMessagesSortBy = jest.fn().mockResolvedValue([]);
const mockMessagesModify = jest.fn<Promise<void>, [(m: Message) => void]>();
const mockTransaction = jest.fn<Promise<unknown>, [string, unknown[], () => Promise<unknown>]>();
const userSettingsStore = new Map<string, unknown>();
const mockUserSettingsGet = jest.fn<Promise<{ id: string; value: unknown } | undefined>, [string]>();
const mockUserSettingsPut = jest.fn<Promise<string>, [{ id: string; value: unknown }]>();

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
      filter: () => ({ modify: (mutator: (m: Message) => void): Promise<void> => mockMessagesModify(mutator) }),
    },
    llmOperationUsages: {
      toArray: (): Promise<LlmOperationUsage[]> => mockOperationUsagesToArray(),
      where: (_field: string): { aboveOrEqual: (_marker: string) => { toArray: () => Promise<LlmOperationUsage[]> } } => ({
        aboveOrEqual: (_marker: string): { toArray: () => Promise<LlmOperationUsage[]> } => ({
          toArray: (): Promise<LlmOperationUsage[]> => mockOperationUsagesToArray(),
        }),
      }),
    },
    analyticsSnapshots: {
      get: (date: string): Promise<AnalyticsSnapshot | undefined> => mockSnapshotGet(date),
      put: (snap: AnalyticsSnapshot): Promise<string> => mockSnapshotPut(snap),
      toArray: (): Promise<AnalyticsSnapshot[]> => mockSnapshotToArray(),
      clear: (): Promise<void> => mockSnapshotClear(),
      orderBy: (): { reverse: () => { limit: (n: number) => { toArray: () => Promise<AnalyticsSnapshot[]> } } } => ({
        reverse: () => ({
          limit: (n: number) => ({
            toArray: (): Promise<AnalyticsSnapshot[]> => mockSnapshotToArray(),
          }),
        }),
      }),
    },
    userSettings: {
      get: (id: string): Promise<{ id: string; value: unknown } | undefined> => mockUserSettingsGet(id),
      put: (setting: { id: string; value: unknown }): Promise<string> => mockUserSettingsPut(setting),
    },
    transaction: (mode: string, tables: unknown[], scope: () => Promise<unknown>): Promise<unknown> => mockTransaction(mode, tables, scope),
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
import { rollupAnalytics, resolveProviderName, rebuildAnalyticsOwnership } from '../analyticsRollupService';

const localStorageBackup = { ...localStorage };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  Object.keys(localStorageBackup).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  });
  userSettingsStore.clear();
  mockMessagesToArray.mockResolvedValue([]);
  mockOperationUsagesToArray.mockResolvedValue([]);
  mockWhereAboveOrEqual.mockReturnValue({ toArray: (): Promise<Message[]> => mockMessagesToArray() });
  mockWhereCreated.mockReturnValue({ aboveOrEqual: (marker: string) => ({ toArray: (): Promise<Message[]> => mockMessagesToArray() }) });
  mockSnapshotGet.mockResolvedValue(undefined);
  mockSnapshotPut.mockResolvedValue('ok');
  mockSnapshotToArray.mockResolvedValue([]);
  mockSnapshotClear.mockResolvedValue(undefined);
  mockMessagesModify.mockResolvedValue(undefined);
  mockTransaction.mockImplementation((_mode: string, _tables: unknown[], scope: () => Promise<unknown>): Promise<unknown> => scope());
  mockUserSettingsGet.mockImplementation((id: string): Promise<{ id: string; value: unknown } | undefined> => {
    const value = userSettingsStore.get(id);
    return Promise.resolve(value === undefined ? undefined : { id, value });
  });
  mockUserSettingsPut.mockImplementation((setting: { id: string; value: unknown }): Promise<string> => {
    userSettingsStore.set(setting.id, setting.value);
    return Promise.resolve(setting.id);
  });
  mockGetState.mockReturnValue({ models: mockModels, providers: mockProviders });
});

function setRollupMarker(ts: string): void {
  userSettingsStore.set('analyticsRollupMarker', ts);
}

function getRollupMarker(): string | null {
  const v = userSettingsStore.get('analyticsRollupMarker');
  return typeof v === 'string' ? v : null;
}

function getRollupLastId(): string | null {
  const v = userSettingsStore.get('analyticsRollupLastId');
  return typeof v === 'string' ? v : null;
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

function trackSnapshots(): Map<string, AnalyticsSnapshot> {
  const snapshots = new Map<string, AnalyticsSnapshot>();
  mockSnapshotGet.mockImplementation((date: string): Promise<AnalyticsSnapshot | undefined> => Promise.resolve(snapshots.get(date)));
  mockSnapshotPut.mockImplementation((snapshot: AnalyticsSnapshot): Promise<string> => {
    snapshots.set(snapshot.date, snapshot);
    return Promise.resolve(snapshot.date);
  });
  return snapshots;
}

function makeOperationUsage(overrides: Partial<LlmOperationUsage> = {}): LlmOperationUsage {
  return {
    id: 'operation-1',
    topicId: 'topic-1',
    operationType: 'checklist_edit',
    created: '2026-01-01T12:00:00.000Z',
    promptTokens: 20,
    completionTokens: 10,
    totalCost: 0.2,
    failed: false,
    ...overrides,
  };
}

function loadIsolatedRollup(): typeof rollupAnalytics {
  let rollup!: typeof rollupAnalytics;
  jest.isolateModules((): void => {
    const service = jest.requireActual<typeof import('../analyticsRollupService')>('../analyticsRollupService');
    rollup = service.rollupAnalytics;
  });
  return rollup;
}

describe('resolveProviderName', () => {
  it('returns provider name when model found', () => {
    mockModels.push({ id: 'm1', apiModelId: 'gpt-4', providerId: 'p1', label: 'GPT-4' } as UserChatModel);
    mockProviders.push({ id: 'p1', name: 'OpenAI' } as LlmProvider);
    mockGetState.mockReturnValue({ models: mockModels, providers: mockProviders });

    expect(resolveProviderName('gpt-4')).toBe('OpenAI');
  });

  it('returns null when model not found', () => {
    mockGetState.mockReturnValue({ models: [], providers: [] });
    expect(resolveProviderName('nonexistent')).toBeNull();
  });

  it('returns null when modelApiId is undefined', () => {
    expect(resolveProviderName(undefined)).toBeNull();
  });
});

describe('rollupAnalytics', () => {
  it.each([
    ['older timestamp', '2026-01-01T10:00:00.000Z'],
    ['same timestamp with a lower ID', '2026-01-01T12:00:00.000Z'],
  ])('ACC-01 counts a late record with %s exactly once', async (_scenario: string, created: string): Promise<void> => {
    const messages = [makeMsg({ id: 'z', totalCost: 0.1 })];
    const snapshots = new Map<string, AnalyticsSnapshot>();
    mockMessagesToArray.mockImplementation((): Promise<Message[]> => Promise.resolve([...messages]));
    mockWhereCreated.mockImplementation((): ReturnType<typeof mockWhereCreated> => ({
      aboveOrEqual: (marker: string): { toArray: () => Promise<Message[]> } => ({
        toArray: (): Promise<Message[]> => Promise.resolve(messages.filter((message) => message.created >= marker)),
      }),
    }));
    mockSnapshotGet.mockImplementation((date: string): Promise<AnalyticsSnapshot | undefined> => Promise.resolve(snapshots.get(date)));
    mockSnapshotPut.mockImplementation((snapshot: AnalyticsSnapshot): Promise<string> => {
      snapshots.set(snapshot.date, snapshot);
      return Promise.resolve(snapshot.date);
    });

    await rollupAnalytics();
    messages.push(makeMsg({ id: 'a', created, totalCost: 0.2 }));
    await rollupAnalytics();
    await rollupAnalytics();

    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);
  });

  it('ACC-02 replaces provisional usage after an already-counted message is finalized', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    const message = makeMsg({ promptTokens: 0, completionTokens: 0, totalCost: 0 });
    mockMessagesToArray.mockImplementation((): Promise<Message[]> => Promise.resolve([{ ...message }]));

    await rollupAnalytics();
    message.promptTokens = 100;
    message.completionTokens = 50;
    message.totalCost = 0.3;
    message.failed = true;
    await rollupAnalytics();

    const snapshot = snapshots.get('2026-01-01');
    expect(snapshot?.cost).toBeCloseTo(0.3);
    expect(snapshot?.promptTokens).toBe(100);
    expect(snapshot?.completionTokens).toBe(50);
    expect(snapshot?.failedCount).toBe(1);
    expect(snapshot?.messageCount).toBe(1);
  });

  it('ACC-03 does not replay accounted records after a transient checkpoint read failure', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    mockMessagesToArray.mockResolvedValue([makeMsg({ totalCost: 0.1 })]);
    await rollupAnalytics();
    mockUserSettingsGet.mockRejectedValueOnce(new Error('Checkpoint temporarily unavailable'));

    await rollupAnalytics().catch((): void => undefined);
    await rollupAnalytics();

    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.1);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(1);
  });

  it('ACC-04 counts a batch once across independent rollup instances with serialized commits', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    const firstRollup = loadIsolatedRollup();
    const secondRollup = loadIsolatedRollup();
    let reads = 0;
    let releaseReads!: () => void;
    const bothReadCheckpoint = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    mockMessagesToArray.mockImplementation(async (): Promise<Message[]> => {
      reads++;
      if (reads === 2) releaseReads();
      await bothReadCheckpoint;
      return [makeMsg({ totalCost: 0.1 })];
    });
    let transactionQueue: Promise<unknown> = Promise.resolve();
    mockTransaction.mockImplementation((_mode, _tables, scope): Promise<unknown> => {
      const run = transactionQueue.then(scope);
      transactionQueue = run.catch((): void => undefined);
      return run;
    });

    await Promise.all([firstRollup(), secondRollup()]);

    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.1);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(1);
  });

  it('ACC-01 counts a late operation below a message-owned checkpoint', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    mockMessagesToArray.mockResolvedValue([makeMsg({ id: 'z', totalCost: 0.1 })]);
    await rollupAnalytics();
    mockOperationUsagesToArray.mockResolvedValue([makeOperationUsage({ id: 'a' })]);

    await rollupAnalytics();
    await rollupAnalytics();

    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);
  });

  it('ACC-04 rebuilds legacy snapshots once instead of double-counting after ledger creation', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    snapshots.set('2026-01-01', {
      date: '2026-01-01',
      messageCount: 1,
      failedCount: 0,
      promptTokens: 10,
      completionTokens: 5,
      cost: 0.1,
      latencySamples: [],
      providerStats: {},
      toolStats: {},
    });
    mockSnapshotToArray.mockImplementation((): Promise<AnalyticsSnapshot[]> => Promise.resolve([...snapshots.values()]));
    mockSnapshotClear.mockImplementation((): Promise<void> => {
      snapshots.clear();
      return Promise.resolve();
    });
    setRollupMarker('2026-01-02T00:00:00.000Z');
    userSettingsStore.set('analyticsRollupLastId', 'legacy');
    mockMessagesToArray.mockResolvedValue([
      makeMsg({ id: 'a', totalCost: 0.1 }),
      makeMsg({ id: 'b', totalCost: 0.2 }),
    ]);

    await rollupAnalytics();
    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);

    await rollupAnalytics();
    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);
  });

  it('ACC-04 ignores a stale concurrent legacy migration instead of clearing newer totals', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    snapshots.set('2026-01-01', {
      date: '2026-01-01',
      messageCount: 1,
      failedCount: 0,
      promptTokens: 10,
      completionTokens: 5,
      cost: 0.1,
      latencySamples: [],
      providerStats: {},
      toolStats: {},
    });
    mockSnapshotToArray.mockImplementation((): Promise<AnalyticsSnapshot[]> => Promise.resolve([...snapshots.values()]));
    mockSnapshotClear.mockImplementation((): Promise<void> => {
      snapshots.clear();
      return Promise.resolve();
    });
    setRollupMarker('2026-01-02T00:00:00.000Z');
    userSettingsStore.set('analyticsRollupLastId', 'legacy');
    const firstRollup = loadIsolatedRollup();
    const secondRollup = loadIsolatedRollup();
    const newer = [makeMsg({ id: 'a', totalCost: 0.1 }), makeMsg({ id: 'b', totalCost: 0.2 })];
    const stale = [makeMsg({ id: 'a', totalCost: 0.1 })];
    let firstRead = true;
    let releaseStale!: () => void;
    let markStalePrepared!: () => void;
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    const stalePrepared = new Promise<void>((resolve) => {
      markStalePrepared = resolve;
    });
    mockMessagesToArray.mockImplementation(async (): Promise<Message[]> => {
      if (firstRead) {
        firstRead = false;
        await stalePrepared;
        return newer;
      }
      markStalePrepared();
      await staleGate;
      return stale;
    });

    // Both instances read the empty legacy ledger before either commits. The
    // newer instance finishes migration while the stale one is still preparing.
    const firstRun = firstRollup();
    const secondRun = secondRollup();
    await firstRun;
    releaseStale();
    await secondRun;

    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);

    mockMessagesToArray.mockResolvedValue(newer);
    await firstRollup();
    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);
  });

  it('ACC-05 replaces obsolete latency samples and tool errors on revision', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    const message = makeMsg({
      id: 'revision',
      latencyMs: 100,
      rawResponse: JSON.stringify({
        toolLoopTrace: [{ toolResults: [{ toolName: 'update_scratchpad', result: 'Error: old failure' }] }],
      }),
    });
    mockMessagesToArray.mockImplementation((): Promise<Message[]> => Promise.resolve([{ ...message }]));

    await rollupAnalytics();
    expect(snapshots.get('2026-01-01')?.latencySamples).toEqual([100]);
    expect(snapshots.get('2026-01-01')?.toolStats.update_scratchpad.errors).toEqual(['Error: old failure']);

    message.latencyMs = 200;
    message.rawResponse = JSON.stringify({
      toolLoopTrace: [{ toolResults: [{ toolName: 'update_scratchpad', result: 'Saved' }] }],
    });
    await rollupAnalytics();

    const snapshot = snapshots.get('2026-01-01');
    expect(snapshot?.latencySamples).toEqual([200]);
    expect(snapshot?.toolStats.update_scratchpad).toEqual({ calls: 1, successCount: 1, errors: [] });
  });

  it('ACC-07 preserves a shared tool error until every contributing record is corrected', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    const sharedError = JSON.stringify({
      toolLoopTrace: [{ toolResults: [{ toolName: 'update_scratchpad', result: 'Error: shared failure' }] }],
    });
    const first = makeMsg({ id: 'first', rawResponse: sharedError });
    const second = makeMsg({ id: 'second', rawResponse: sharedError });
    mockMessagesToArray.mockImplementation((): Promise<Message[]> => Promise.resolve([{ ...first }, { ...second }]));

    await rollupAnalytics();
    expect(snapshots.get('2026-01-01')?.toolStats.update_scratchpad).toEqual({
      calls: 2,
      successCount: 0,
      errors: ['Error: shared failure'],
    });

    first.rawResponse = JSON.stringify({
      toolLoopTrace: [{ toolResults: [{ toolName: 'update_scratchpad', result: 'Saved' }] }],
    });
    await rollupAnalytics();
    expect(snapshots.get('2026-01-01')?.toolStats.update_scratchpad).toEqual({
      calls: 2,
      successCount: 1,
      errors: ['Error: shared failure'],
    });

    second.rawResponse = JSON.stringify({
      toolLoopTrace: [{ toolResults: [{ toolName: 'update_scratchpad', result: 'Saved' }] }],
    });
    await rollupAnalytics();
    expect(snapshots.get('2026-01-01')?.toolStats.update_scratchpad).toEqual({
      calls: 2,
      successCount: 2,
      errors: [],
    });
  });

  it('ACC-control includes message and operation usage once on repeated and overlapping runs', async (): Promise<void> => {
    const snapshots = trackSnapshots();
    mockMessagesToArray.mockResolvedValue([makeMsg({ id: 'message', totalCost: 0.1 })]);
    mockOperationUsagesToArray.mockResolvedValue([makeOperationUsage({ id: 'operation' })]);

    await Promise.all([rollupAnalytics(), rollupAnalytics()]);
    await rollupAnalytics();

    expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.3);
    expect(snapshots.get('2026-01-01')?.messageCount).toBe(2);
    expect(snapshots.get('2026-01-01')?.promptTokens).toBe(120);
    expect(snapshots.get('2026-01-01')?.completionTokens).toBe(60);
  });

  it.each(['snapshot', 'marker', 'last ID'])(
    'ACC-control rolls back the %s write failure and retries without duplicate accounting',
    async (boundary: string): Promise<void> => {
      const snapshots = trackSnapshots();
      const messages = [makeMsg({ id: 'a', totalCost: 0.1 })];
      mockMessagesToArray.mockImplementation((): Promise<Message[]> => Promise.resolve([...messages]));
      await rollupAnalytics();
      messages.push(makeMsg({ id: 'b', created: '2026-01-02T12:00:00.000Z', totalCost: 0.2 }));
      mockTransaction.mockImplementation(async (_mode, _tables, scope): Promise<unknown> => {
        const previousSnapshots = new Map(snapshots);
        const previousSettings = new Map(userSettingsStore);
        try {
          return await scope();
        } catch (error: unknown) {
          snapshots.clear();
          previousSnapshots.forEach((value, key): void => {
            snapshots.set(key, value);
          });
          userSettingsStore.clear();
          previousSettings.forEach((value, key): void => {
            userSettingsStore.set(key, value);
          });
          throw error;
        }
      });
      if (boundary === 'snapshot') {
        mockSnapshotPut.mockRejectedValueOnce(new Error('Injected write failure'));
      } else {
        let failNext = true;
        const failingKey = boundary === 'marker' ? 'analyticsRollupMarker' : 'analyticsRollupLastId';
        mockUserSettingsPut.mockImplementation((setting): Promise<string> => {
          if (failNext && setting.id === failingKey) {
            failNext = false;
            return Promise.reject(new Error('Injected write failure'));
          }
          userSettingsStore.set(setting.id, setting.value);
          return Promise.resolve(setting.id);
        });
      }

      await expect(rollupAnalytics()).rejects.toThrow('Injected write failure');
      expect(snapshots.size).toBe(1);
      expect(getRollupMarker()).toBe('2026-01-01T12:00:00.000Z');
      expect(getRollupLastId()).toBe('a');
      await rollupAnalytics();

      expect(snapshots.size).toBe(2);
      expect(snapshots.get('2026-01-01')?.cost).toBeCloseTo(0.1);
      expect(snapshots.get('2026-01-02')?.cost).toBeCloseTo(0.2);
      expect(getRollupLastId()).toBe('b');
    },
  );

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
    userSettingsStore.set('analyticsRollupLastId', 'a');

    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z' }), makeMsg({ id: 'b', created: '2026-01-02T10:00:00.000Z' })];
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
    userSettingsStore.set('analyticsRollupLastId', 'msg-dup');

    const msgs = [makeMsg({ id: 'msg-dup', created: '2026-01-01T12:00:00.000Z' }), makeMsg({ id: 'msg-new', created: '2026-01-01T12:00:00.000Z' })];
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
      cost: 0.1,
      latencySamples: [100, 200],
      providerStats: { OpenAI: { cost: 0.1, tokens: 150, messageCount: 3 } },
      toolStats: { scratchpad: { calls: 2, successCount: 2, errors: [] } },
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
      OpenAI: { cost: 0.1, tokens: 150, messageCount: 3 },
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

    const msgs = Array.from({ length: 20 }, (_, i) => makeMsg({ id: `lat-${i}`, created: '2026-01-01T14:00:00.000Z', latencyMs: 500 + i }));
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
    userSettingsStore.set('analyticsRollupLastId', 'last');
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
      update_scratchpad: { calls: 1, successCount: 1, errors: [] },
      read_messages: { calls: 1, successCount: 0, errors: ['Error: not found'] },
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
      makeMsg({ id: 'c', created: '2026-01-02T10:00:00.000Z', totalCost: 0.1 }),
    ];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    expect(mockSnapshotPut).toHaveBeenCalledTimes(2);
    const day1 = mockSnapshotPut.mock.calls[0][0];
    const day2 = mockSnapshotPut.mock.calls[1][0];
    expect(day1.date).toBe('2026-01-01');
    expect(day1.cost).toBeCloseTo(0.08);
    expect(day2.date).toBe('2026-01-02');
    expect(day2.cost).toBeCloseTo(0.1);
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

  it('serializes overlapping rollups without double-counting', async () => {
    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', totalCost: 0.01 })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await Promise.all([rollupAnalytics(), rollupAnalytics()]);

    // The second run must observe the first run's advanced marker (via
    // userSettings) and skip the already-processed message, so the snapshot is
    // written exactly once.
    expect(mockSnapshotPut).toHaveBeenCalledTimes(1);
  });

  it('stores the rollup marker transactionally in userSettings', async () => {
    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', totalCost: 0.01 })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rollupAnalytics();

    expect(mockTransaction).toHaveBeenCalled();
    expect(userSettingsStore.get('analyticsRollupMarker')).toBe('2026-01-01T10:00:00.000Z');
    expect(userSettingsStore.get('analyticsRollupLastId')).toBe('a');
  });
});

describe('rebuildAnalyticsOwnership', () => {
  it('rebuilds once, marks the flag, and skips subsequent runs', async () => {
    await rebuildAnalyticsOwnership();

    expect(mockMessagesModify).toHaveBeenCalled();
    expect(mockSnapshotClear).toHaveBeenCalled();
    expect(userSettingsStore.get('analyticsOwnershipRebuilt')).toBe(true);

    mockMessagesModify.mockClear();
    mockSnapshotClear.mockClear();
    mockSnapshotPut.mockClear();

    await rebuildAnalyticsOwnership();

    expect(mockMessagesModify).not.toHaveBeenCalled();
    expect(mockSnapshotClear).not.toHaveBeenCalled();
    expect(mockSnapshotPut).not.toHaveBeenCalled();
  });

  it('rebuilds derived snapshots from scratch after clearing', async () => {
    const msgs = [makeMsg({ id: 'a', created: '2026-01-01T10:00:00.000Z', totalCost: 0.01 })];
    mockMessagesToArray.mockResolvedValue(msgs);

    await rebuildAnalyticsOwnership();

    expect(mockSnapshotClear).toHaveBeenCalled();
    expect(mockSnapshotPut).toHaveBeenCalledTimes(1);
    expect(userSettingsStore.get('analyticsOwnershipRebuilt')).toBe(true);
  });
});
