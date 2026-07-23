export {};
type SchemaMap = Record<string, string>;

type UpgradeCallback = (trans: { table: (tableName: string) => unknown }) => Promise<void> | void;

interface VersionRecord {
  storesSchema?: SchemaMap;
  upgradeCallback?: UpgradeCallback;
}

const mockVersionRecords = new Map<number, VersionRecord>();

jest.mock('dexie', () => {
  class MockDexie {
    version(versionNumber: number): {
      stores: (schema: SchemaMap) => { upgrade: (callback: UpgradeCallback) => unknown };
    } {
      const record = mockVersionRecords.get(versionNumber) ?? {};
      mockVersionRecords.set(versionNumber, record);

      return {
        stores: (schema: SchemaMap): { upgrade: (callback: UpgradeCallback) => unknown } => {
          record.storesSchema = schema;
          return {
            upgrade: (callback: UpgradeCallback): unknown => {
              record.upgradeCallback = callback;
              return {};
            },
          };
        },
      };
    }
  }

  return {
    __esModule: true,
    default: MockDexie,
    Table: function Table(): void {
      // Runtime placeholder for Dexie.Table in tests.
    },
  };
});

interface TopicLike {
  id: string;
  createdOn: string;
  forks?: { id: string; name: string; createdOn: string }[];
  activeForkId?: string;
}

interface MessageV2Like {
  id: string;
  topicId: string;
  type: 'user' | 'assistant' | 'system' | 'aiNote';
  created: string;
  forkId?: string;
}

interface MessageV5Like extends MessageV2Like {
  parentMessageId?: string;
}

interface MessageV9Like extends MessageV5Like {
  model?: string;
}

interface TopicV9Like extends TopicLike {
  modelId?: string;
}

function loadAthenaDbModule(): void {
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../AthenaDb');
  });
}

function getUpgradeCallback(version: number): UpgradeCallback {
  const callback = mockVersionRecords.get(version)?.upgradeCallback;
  if (!callback) {
    throw new Error(`Expected upgrade callback for version ${version}`);
  }
  return callback;
}

describe('AthenaDb migrations', () => {
  beforeEach(() => {
    jest.resetModules();
    mockVersionRecords.clear();
  });

  it('registers schema versions 1 through 9', () => {
    loadAthenaDbModule();

    for (const version of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(mockVersionRecords.has(version)).toBe(true);
      expect(mockVersionRecords.get(version)?.storesSchema).toBeDefined();
    }
  });

  it('v9 topics schema includes modelId index', () => {
    loadAthenaDbModule();

    const v9Schema = mockVersionRecords.get(9)?.storesSchema?.topics;
    expect(v9Schema).toBeDefined();
    expect(v9Schema).toContain('modelId');
  });

  it('v2 upgrade backfills topic forks and message forkId', async () => {
    loadAthenaDbModule();

    const topics: TopicLike[] = [
      { id: 't1', createdOn: '2024-01-01T00:00:00.000Z' },
      {
        id: 't2',
        createdOn: '2024-01-02T00:00:00.000Z',
        forks: [{ id: 'custom', name: 'Custom', createdOn: '2024-01-02T00:00:00.000Z' }],
        activeForkId: 'custom',
      },
    ];

    const messages: MessageV2Like[] = [
      {
        id: 'm1',
        topicId: 't1',
        type: 'user',
        created: '2024-01-01T00:01:00.000Z',
      },
      {
        id: 'm2',
        topicId: 't1',
        type: 'assistant',
        created: '2024-01-01T00:02:00.000Z',
        forkId: 'existing-fork',
      },
    ];

    const v2Transaction = {
      table: (tableName: string): { toCollection: () => { modify: (mutator: (row: unknown) => void) => Promise<void> } } => ({
        toCollection: () => ({
          modify: (mutator: (row: unknown) => void): Promise<void> => {
            if (tableName === 'topics') {
              for (const topic of topics) {
                mutator(topic);
              }
              return Promise.resolve();
            }

            if (tableName === 'messages') {
              for (const message of messages) {
                mutator(message);
              }
            }
            return Promise.resolve();
          },
        }),
      }),
    };

    await getUpgradeCallback(2)(v2Transaction);

    expect(topics[0].forks).toEqual([
      {
        id: 'main',
        name: 'Main',
        createdOn: '2024-01-01T00:00:00.000Z',
      },
    ]);
    expect(topics[0].activeForkId).toBe('main');

    expect(topics[1].forks).toEqual([{ id: 'custom', name: 'Custom', createdOn: '2024-01-02T00:00:00.000Z' }]);
    expect(topics[1].activeForkId).toBe('custom');

    expect(messages[0].forkId).toBe('main');
    expect(messages[1].forkId).toBe('existing-fork');
  });

  it('v5 upgrade assigns assistant parentMessageId from latest prior user by topic', async () => {
    loadAthenaDbModule();

    const messages: MessageV5Like[] = [
      {
        id: 'a-before-user',
        topicId: 't1',
        type: 'assistant',
        created: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'u1',
        topicId: 't1',
        type: 'user',
        created: '2024-01-01T00:01:00.000Z',
      },
      {
        id: 'a1',
        topicId: 't1',
        type: 'assistant',
        created: '2024-01-01T00:02:00.000Z',
      },
      {
        id: 'a-has-parent',
        topicId: 't1',
        type: 'assistant',
        created: '2024-01-01T00:03:00.000Z',
        parentMessageId: 'u1',
      },
      {
        id: 'u2',
        topicId: 't2',
        type: 'user',
        created: '2024-01-01T00:01:30.000Z',
      },
      {
        id: 'a2',
        topicId: 't2',
        type: 'assistant',
        created: '2024-01-01T00:02:30.000Z',
      },
    ];

    const updates: { id: string; parentMessageId: string }[] = [];

    const v5Transaction = {
      table: (
        _tableName: string,
      ): {
        toArray: () => Promise<MessageV5Like[]>;
        update: (id: string, patch: Partial<MessageV5Like>) => Promise<number>;
      } => ({
        toArray: (): Promise<MessageV5Like[]> => Promise.resolve(messages),
        update: (id: string, patch: Partial<MessageV5Like>): Promise<number> => {
          if (typeof patch.parentMessageId === 'string') {
            updates.push({ id, parentMessageId: patch.parentMessageId });
          }
          return Promise.resolve(1);
        },
      }),
    };

    await getUpgradeCallback(5)(v5Transaction);

    expect(updates).toEqual([
      { id: 'a1', parentMessageId: 'u1' },
      { id: 'a2', parentMessageId: 'u2' },
    ]);
  });

  it('v9 upgrade backfills topic.modelId from last assistant message with a model', async () => {
    loadAthenaDbModule();

    const messages: MessageV9Like[] = [
      {
        id: 'm-u1',
        topicId: 't1',
        type: 'user',
        created: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'm-a1',
        topicId: 't1',
        type: 'assistant',
        created: '2024-01-01T00:01:00.000Z',
        model: 'gpt-4',
      },
      {
        id: 'm-a2',
        topicId: 't1',
        type: 'assistant',
        created: '2024-01-01T00:02:00.000Z',
        model: 'gpt-5',
      },
      // t2: assistant without model, should not be backfilled
      {
        id: 'm-a3',
        topicId: 't2',
        type: 'assistant',
        created: '2024-01-01T00:00:00.000Z',
      },
      // t3: already has modelId, should not be overwritten
      {
        id: 'm-a4',
        topicId: 't3',
        type: 'assistant',
        created: '2024-01-01T00:00:00.000Z',
        model: 'claude-3',
      },
      // t4: user message only, no assistant message
      {
        id: 'm-u2',
        topicId: 't4',
        type: 'user',
        created: '2024-01-01T00:00:00.000Z',
      },
    ];

    const topics: TopicV9Like[] = [
      { id: 't1', createdOn: '2024-01-01T00:00:00.000Z' },
      { id: 't2', createdOn: '2024-01-01T00:00:00.000Z' },
      { id: 't3', createdOn: '2024-01-01T00:00:00.000Z', modelId: 'existing-model' },
      { id: 't4', createdOn: '2024-01-01T00:00:00.000Z' },
    ];

    const topicUpdates: { id: string; modelId: string }[] = [];

    const v9Transaction = {
      table: (
        tableName: string,
      ): {
        toArray: () => Promise<MessageV9Like[] | TopicV9Like[]>;
        update: (id: string, patch: Partial<TopicV9Like>) => Promise<number>;
      } => ({
        toArray: (): Promise<MessageV9Like[] | TopicV9Like[]> => {
          if (tableName === 'messages') {
            return Promise.resolve(messages);
          }
          if (tableName === 'topics') {
            return Promise.resolve(topics);
          }
          return Promise.resolve([]);
        },
        update: (id: string, patch: Partial<TopicV9Like>): Promise<number> => {
          if (typeof patch.modelId === 'string') {
            topicUpdates.push({ id, modelId: patch.modelId });
          }
          return Promise.resolve(1);
        },
      }),
    };

    await getUpgradeCallback(9)(v9Transaction);

    // t1: most recent assistant is m-a2 with model 'gpt-5'
    // t3: already has modelId, should NOT be in updates
    expect(topicUpdates).toEqual([{ id: 't1', modelId: 'gpt-5' }]);
  });
});

describe('AthenaDb migration error safety', () => {
  beforeEach(() => {
    jest.resetModules();
    mockVersionRecords.clear();
  });

  it('v2 migration swallows errors and does not crash on schema load', async () => {
    loadAthenaDbModule();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    const throwingTransaction = {
      table: (): never => {
        throw new Error('v2 migration data error');
      },
    };

    await expect(getUpgradeCallback(2)(throwingTransaction)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('AthenaDb v2 migration failed', expect.any(Error));

    errorSpy.mockRestore();
  });

  it('v5 migration swallows errors and does not crash on schema load', async () => {
    loadAthenaDbModule();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    const throwingTransaction = {
      table: (): never => {
        throw new Error('v5 migration data error');
      },
    };

    await expect(getUpgradeCallback(5)(throwingTransaction)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('AthenaDb v5 migration failed', expect.any(Error));

    errorSpy.mockRestore();
  });

  it('v9 migration swallows errors and does not crash on schema load', async () => {
    loadAthenaDbModule();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation((): void => undefined);

    const throwingTransaction = {
      table: (): never => {
        throw new Error('v9 migration data error');
      },
    };

    await expect(getUpgradeCallback(9)(throwingTransaction)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('AthenaDb v9 migration failed', expect.any(Error));

    errorSpy.mockRestore();
  });
});
