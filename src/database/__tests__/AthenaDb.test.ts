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

  it('registers schema versions 1 through 7', () => {
    loadAthenaDbModule();

    for (const version of [1, 2, 3, 4, 5, 6, 7]) {
      expect(mockVersionRecords.has(version)).toBe(true);
      expect(mockVersionRecords.get(version)?.storesSchema).toBeDefined();
    }
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
});
