import { ChecklistGroup, ChecklistItem, ChecklistHistoryEntry, ChecklistTab } from '../../database/AthenaDb';
import { UserChatModel } from '../../types/provider';
import { createUserChatModel } from '../../testUtils';

let mockGroupsDb: ChecklistGroup[] = [];
let mockItemsDb: ChecklistItem[] = [];
let mockHistoryDb: ChecklistHistoryEntry[] = [];
let mockTabsDb: ChecklistTab[] = [];
let mockTopicActiveTabIds = new Map<string, string>();

const mockAskLlm = jest.fn();
const mockOrchestrateLlmLoop = jest.fn();
const mockAddNotification = jest.fn((title: string, message?: string, severity?: 'success' | 'info' | 'warning' | 'error'): undefined => {
  void title;
  void message;
  void severity;
  return undefined;
});
const mockGetSelectedModel = jest.fn<UserChatModel, []>();
const mockGenerateTopicName = jest.fn<Promise<void>, [string, string]>();
const mockUpdateTopicTimestamp = jest.fn<Promise<void>, [string]>();
const mockLoadGroups = jest.fn<Promise<ChecklistGroup[]>, [string]>();
const mockTopicExists = jest.fn<Promise<boolean>, [string]>();
const mockOperationUsageAdd = jest.fn<Promise<void>, [unknown]>();

const mockTransaction = jest.fn<Promise<void>, [string, unknown[], () => Promise<void>]>();

function mockMakeWhereClause<T>(records: T[], field: string, value: unknown): { toArray: () => Promise<T[]>; delete: () => Promise<number> } {
  return {
    toArray: (): Promise<T[]> => Promise.resolve(records.filter((r) => (r as Record<string, unknown>)[field] === value)),
    delete: (): Promise<number> => {
      const before = records.length;
      const idx = records.filter((r) => (r as Record<string, unknown>)[field] === value);
      for (const item of idx) {
        const i = records.indexOf(item);
        if (i >= 0) records.splice(i, 1);
      }
      return Promise.resolve(before - records.length);
    },
  };
}

jest.mock('../../store/ChatStore', () => ({
  useChatStore: {
    getState: (): { selectedModel: UserChatModel } => ({ selectedModel: mockGetSelectedModel() }),
  },
}));

jest.mock('../../store/TopicStore', () => ({
  useTopicStore: {
    getState: (): {
      generateTopicName: (topicId: string, userMessage: string) => Promise<void>;
      updateTopicTimestamp: (topicId: string) => Promise<void>;
    } => ({
      generateTopicName: (...args: [string, string]): Promise<void> => mockGenerateTopicName(...args),
      updateTopicTimestamp: (topicId: string): Promise<void> => mockUpdateTopicTimestamp(topicId),
    }),
  },
}));

jest.mock('../../store/NotificationStore', () => ({
  useNotificationStore: {
    getState: (): { addNotification: (title: string, message?: string, severity?: 'success' | 'info' | 'warning' | 'error') => void } => ({
      addNotification: (...args: [string, string?, ('success' | 'info' | 'warning' | 'error')?]): void => {
        mockAddNotification(...args);
      },
    }),
  },
}));

jest.mock('../../services/llmService', () => ({
  askLlm: (...args: unknown[]): ReturnType<typeof mockAskLlm> => mockAskLlm(...args),
  orchestrateLlmLoop: (...args: unknown[]): ReturnType<typeof mockOrchestrateLlmLoop> => mockOrchestrateLlmLoop(...args),
}));

jest.mock('../../components/ModelSelector', () => ({
  getDefaultModel: jest.fn(),
  calculateCostUSD: jest.fn((): number => 0),
  getPeakMultiplier: jest.fn((): number => 1),
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    topics: {
      get: async (id: string): Promise<{ id: string; activeChecklistTabId?: string } | undefined> =>
        (await mockTopicExists(id)) ? { id, activeChecklistTabId: mockTopicActiveTabIds.get(id) } : undefined,
      update: (id: string, patch: { activeChecklistTabId?: string }): Promise<number> => {
        if (patch.activeChecklistTabId) mockTopicActiveTabIds.set(id, patch.activeChecklistTabId);
        return Promise.resolve(1);
      },
    },
    checklistTabs: {
      add: (tab: ChecklistTab): Promise<void> => {
        mockTabsDb.push(tab);
        return Promise.resolve();
      },
      update: (id: string, patch: Partial<ChecklistTab>): Promise<number> => {
        const tab = mockTabsDb.find((candidate) => candidate.id === id);
        if (tab) Object.assign(tab, patch);
        return Promise.resolve(tab ? 1 : 0);
      },
      delete: (id: string): Promise<void> => {
        mockTabsDb = mockTabsDb.filter((tab) => tab.id !== id);
        return Promise.resolve();
      },
      get: (id: string): Promise<ChecklistTab | undefined> => Promise.resolve(mockTabsDb.find((tab) => tab.id === id)),
      where: (field: string): { equals: (value: unknown) => { toArray: () => Promise<ChecklistTab[]> } } => ({
        equals: (value: unknown) => ({
          toArray: (): Promise<ChecklistTab[]> =>
            Promise.resolve(mockTabsDb.filter((tab) => (tab as unknown as Record<string, unknown>)[field] === value)),
        }),
      }),
    },
    checklistGroups: {
      add: (g: ChecklistGroup): Promise<void> => {
        mockGroupsDb.push(g);
        return Promise.resolve();
      },
      bulkAdd: (gs: ChecklistGroup[]): Promise<void> => {
        mockGroupsDb.push(...gs);
        return Promise.resolve();
      },
      update: (id: string, patch: Partial<ChecklistGroup>): Promise<number> => {
        const g = mockGroupsDb.find((x) => x.id === id);
        if (g) Object.assign(g, patch);
        return Promise.resolve(g ? 1 : 0);
      },
      delete: (id: string): Promise<void> => {
        mockGroupsDb = mockGroupsDb.filter((x) => x.id !== id);
        return Promise.resolve();
      },
      get: (id: string): Promise<ChecklistGroup | undefined> => Promise.resolve(mockGroupsDb.find((x) => x.id === id)),
      where: (
        field: string,
      ): {
        equals: (value: unknown) => { toArray: () => Promise<ChecklistGroup[]>; primaryKeys: () => Promise<string[]>; delete: () => Promise<number> };
      } => ({
        equals: (value: unknown) => ({
          toArray: (): Promise<ChecklistGroup[]> =>
            field === 'topicId' || field === 'tabId'
              ? mockLoadGroups(String(value))
              : Promise.resolve(mockGroupsDb.filter((g) => (g as Record<string, unknown>)[field] === value)),
          primaryKeys: (): Promise<string[]> =>
            Promise.resolve(mockGroupsDb.filter((group) => (group as Record<string, unknown>)[field] === value).map((group) => group.id)),
          delete: (): Promise<number> => mockMakeWhereClause(mockGroupsDb, field, value).delete(),
        }),
      }),
    },
    checklistItems: {
      add: (item: ChecklistItem): Promise<void> => {
        mockItemsDb.push(item);
        return Promise.resolve();
      },
      bulkAdd: (items: ChecklistItem[]): Promise<void> => {
        mockItemsDb.push(...items);
        return Promise.resolve();
      },
      bulkDelete: (ids: string[]): Promise<void> => {
        mockItemsDb = mockItemsDb.filter((item) => !ids.includes(item.id));
        return Promise.resolve();
      },
      update: (id: string, patch: Partial<ChecklistItem>): Promise<number> => {
        const item = mockItemsDb.find((x) => x.id === id);
        if (item) Object.assign(item, patch);
        return Promise.resolve(item ? 1 : 0);
      },
      delete: (id: string): Promise<void> => {
        mockItemsDb = mockItemsDb.filter((x) => x.id !== id);
        return Promise.resolve();
      },
      get: (id: string): Promise<ChecklistItem | undefined> => Promise.resolve(mockItemsDb.find((x) => x.id === id)),
      where: (
        field: string,
      ): {
        equals: (value: unknown) => { toArray: () => Promise<ChecklistItem[]>; delete: () => Promise<number> };
        anyOf: (values: unknown[]) => { toArray: () => Promise<ChecklistItem[]>; delete: () => Promise<number> };
      } => ({
        equals: (value: unknown): { toArray: () => Promise<ChecklistItem[]>; delete: () => Promise<number> } =>
          mockMakeWhereClause(mockItemsDb, field, value),
        anyOf: (values: unknown[]) => ({
          toArray: (): Promise<ChecklistItem[]> => Promise.resolve(mockItemsDb.filter((i) => values.includes((i as Record<string, unknown>)[field]))),
          delete: (): Promise<number> => {
            const before = mockItemsDb.length;
            mockItemsDb = mockItemsDb.filter((item) => !values.includes((item as Record<string, unknown>)[field]));
            return Promise.resolve(before - mockItemsDb.length);
          },
        }),
      }),
    },
    checklistHistory: {
      add: (entry: ChecklistHistoryEntry): Promise<void> => {
        mockHistoryDb.push(entry);
        return Promise.resolve();
      },
      bulkDelete: (ids: string[]): Promise<void> => {
        mockHistoryDb = mockHistoryDb.filter((x) => !ids.includes(x.id));
        return Promise.resolve();
      },
      where: (field: string): { equals: (value: unknown) => { sortBy: () => Promise<ChecklistHistoryEntry[]>; delete: () => Promise<number> } } => ({
        equals: (value: unknown) => ({
          sortBy: (): Promise<ChecklistHistoryEntry[]> =>
            Promise.resolve(
              mockHistoryDb.filter((e) => (e as Record<string, unknown>)[field] === value).sort((a, b) => a.created.localeCompare(b.created)),
            ),
          delete: (): Promise<number> => mockMakeWhereClause(mockHistoryDb, field, value).delete(),
        }),
      }),
    },
    llmOperationUsages: {
      add: (usage: unknown): Promise<void> => mockOperationUsageAdd(usage),
    },
    transaction: (...args: [string, unknown[], () => Promise<void>]): Promise<void> => mockTransaction(...args),
  },
}));

import { useChecklistStore } from '../ChecklistStore';

let uuidCounter = 0;

describe('ChecklistStore', () => {
  beforeEach(() => {
    mockGroupsDb = [];
    mockItemsDb = [];
    mockHistoryDb = [];
    mockTabsDb = [{ id: 'tab-main', topicId: 't1', name: 'Main', sortOrder: 0 }];
    mockTopicActiveTabIds = new Map([['t1', 'tab-main']]);
    mockAskLlm.mockReset();
    mockOrchestrateLlmLoop.mockReset();
    mockAddNotification.mockReset();
    mockTransaction.mockReset();
    mockGetSelectedModel.mockReset();
    mockGenerateTopicName.mockReset();
    mockUpdateTopicTimestamp.mockReset();
    mockOperationUsageAdd.mockReset();
    mockLoadGroups.mockReset();
    mockTopicExists.mockReset();
    mockGetSelectedModel.mockReturnValue(createUserChatModel());
    mockTopicExists.mockResolvedValue(true);
    mockUpdateTopicTimestamp.mockResolvedValue(undefined);
    mockOperationUsageAdd.mockResolvedValue(undefined);
    mockLoadGroups.mockImplementation((ownerId: string): Promise<ChecklistGroup[]> => {
      return Promise.resolve(mockGroupsDb.filter((group) => group.topicId === ownerId || group.tabId === ownerId));
    });
    mockTransaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>): Promise<void> => {
      await callback();
    });

    useChecklistStore.setState({
      tabs: [],
      activeTabId: null,
      groups: [],
      items: [],
      activeTopicId: null,
      loading: false,
      generating: false,
      editing: false,
      streamingContent: '',
      lastEditSummary: '',
      history: [],
    });

    uuidCounter = 0;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: jest.fn((): string => {
          const n = uuidCounter++;
          const prefix = String(n).padStart(8, '0');
          return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
        }),
      },
      configurable: true,
    });
  });

  describe('loadChecklist', () => {
    it('loads groups and items sorted by sortOrder', async () => {
      mockGroupsDb = [
        { id: 'g2', topicId: 't1', tabId: 'tab-main', title: 'Later', sortOrder: 1 },
        { id: 'g1', topicId: 't1', tabId: 'tab-main', title: 'First', sortOrder: 0 },
      ];
      mockItemsDb = [
        { id: 'i2', groupId: 'g1', content: 'B', checked: false, sortOrder: 1 },
        { id: 'i1', groupId: 'g1', content: 'A', checked: false, sortOrder: 0 },
      ];

      await useChecklistStore.getState().loadChecklist('t1');

      const state = useChecklistStore.getState();
      expect(state.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
      expect(state.items.map((i) => i.id)).toEqual(['i1', 'i2']);
    });

    it('ignores a stale load that finishes after a newer topic', async () => {
      let resolveTopicA: ((groups: ChecklistGroup[]) => void) | undefined;
      const topicALoad = new Promise<ChecklistGroup[]>((resolve) => {
        resolveTopicA = resolve;
      });
      const topicAGroup: ChecklistGroup = { id: 'ga', topicId: 'ta', tabId: 'tab-a', title: 'Topic A', sortOrder: 0 };
      const topicBGroup: ChecklistGroup = { id: 'gb', topicId: 'tb', tabId: 'tab-b', title: 'Topic B', sortOrder: 0 };
      mockTabsDb = [
        { id: 'tab-a', topicId: 'ta', name: 'Main', sortOrder: 0 },
        { id: 'tab-b', topicId: 'tb', name: 'Main', sortOrder: 0 },
      ];
      mockTopicActiveTabIds = new Map([
        ['ta', 'tab-a'],
        ['tb', 'tab-b'],
      ]);
      mockGroupsDb = [topicAGroup, topicBGroup];
      mockLoadGroups.mockImplementation((tabId: string): Promise<ChecklistGroup[]> => {
        return tabId === 'tab-a' ? topicALoad : Promise.resolve([topicBGroup]);
      });

      const loadTopicA = useChecklistStore.getState().loadChecklist('ta');
      await useChecklistStore.getState().loadChecklist('tb');
      resolveTopicA?.([topicAGroup]);
      await loadTopicA;

      expect(useChecklistStore.getState().groups).toEqual([topicBGroup]);
      expect(useChecklistStore.getState().loading).toBe(false);
    });

    it('ignores a stale load failure after a newer topic succeeds', async () => {
      let rejectTopicA: ((reason: Error) => void) | undefined;
      const topicALoad = new Promise<ChecklistGroup[]>((_resolve, reject) => {
        rejectTopicA = reject;
      });
      void topicALoad.catch((): undefined => undefined);
      const topicBGroup: ChecklistGroup = { id: 'gb', topicId: 'tb', tabId: 'tab-b', title: 'Topic B', sortOrder: 0 };
      mockTabsDb = [
        { id: 'tab-a', topicId: 'ta', name: 'Main', sortOrder: 0 },
        { id: 'tab-b', topicId: 'tb', name: 'Main', sortOrder: 0 },
      ];
      mockTopicActiveTabIds = new Map([
        ['ta', 'tab-a'],
        ['tb', 'tab-b'],
      ]);
      mockGroupsDb = [topicBGroup];
      mockLoadGroups.mockImplementation((topicId: string): Promise<ChecklistGroup[]> => {
        return topicId === 'ta' ? topicALoad : Promise.resolve([topicBGroup]);
      });

      const loadTopicA = useChecklistStore.getState().loadChecklist('ta');
      await useChecklistStore.getState().loadChecklist('tb');
      rejectTopicA?.(new Error('stale load failed'));
      await loadTopicA;

      expect(useChecklistStore.getState().groups).toEqual([topicBGroup]);
      expect(useChecklistStore.getState().loading).toBe(false);
      expect(mockAddNotification).not.toHaveBeenCalled();
    });
  });

  describe('tabs', () => {
    it('creates and selects an empty tab', async () => {
      await useChecklistStore.getState().loadChecklist('t1');

      const tab = await useChecklistStore.getState().createTab('t1', 'Ideas');

      expect(tab).toMatchObject({ topicId: 't1', name: 'Ideas', sortOrder: 1 });
      expect(mockTabsDb).toHaveLength(2);
      expect(mockTopicActiveTabIds.get('t1')).toBe(tab?.id);
      expect(useChecklistStore.getState()).toMatchObject({ activeTabId: tab?.id, groups: [], items: [], history: [] });
    });

    it('renames a tab', async () => {
      useChecklistStore.setState({ tabs: [...mockTabsDb], activeTabId: 'tab-main', activeTopicId: 't1' });

      expect(await useChecklistStore.getState().renameTab('tab-main', 'Overview')).toBe(true);

      expect(mockTabsDb[0].name).toBe('Overview');
      expect(useChecklistStore.getState().tabs[0].name).toBe('Overview');
    });

    it('switches to only the selected tab content and history', async () => {
      const ideasTab: ChecklistTab = { id: 'tab-ideas', topicId: 't1', name: 'Ideas', sortOrder: 1 };
      const ideasGroup: ChecklistGroup = { id: 'g-ideas', topicId: 't1', tabId: ideasTab.id, title: 'Ideas', sortOrder: 0 };
      const ideasItem: ChecklistItem = { id: 'i-ideas', groupId: ideasGroup.id, content: 'Explore', checked: false, sortOrder: 0 };
      const ideasHistory: ChecklistHistoryEntry = {
        id: 'h-ideas',
        topicId: 't1',
        tabId: ideasTab.id,
        role: 'user',
        content: 'Add ideas',
        created: '2026-01-01T00:00:00.000Z',
        seq: 0,
      };
      mockTabsDb.push(ideasTab);
      mockGroupsDb.push(ideasGroup);
      mockItemsDb.push(ideasItem);
      mockHistoryDb.push(ideasHistory);
      useChecklistStore.setState({ tabs: [...mockTabsDb], activeTabId: 'tab-main', activeTopicId: 't1' });

      await useChecklistStore.getState().switchTab(ideasTab.id);

      expect(useChecklistStore.getState()).toMatchObject({
        activeTabId: ideasTab.id,
        groups: [ideasGroup],
        items: [ideasItem],
        history: [ideasHistory],
      });
      expect(mockTopicActiveTabIds.get('t1')).toBe(ideasTab.id);
    });

    it('deletes tab-owned content and selects a remaining tab', async () => {
      const ideasTab: ChecklistTab = { id: 'tab-ideas', topicId: 't1', name: 'Ideas', sortOrder: 1 };
      const mainGroup: ChecklistGroup = { id: 'g-main', topicId: 't1', tabId: 'tab-main', title: 'Main', sortOrder: 0 };
      const ideasGroup: ChecklistGroup = { id: 'g-ideas', topicId: 't1', tabId: ideasTab.id, title: 'Ideas', sortOrder: 0 };
      mockTabsDb.push(ideasTab);
      mockGroupsDb.push(mainGroup, ideasGroup);
      mockItemsDb.push(
        { id: 'i-main', groupId: mainGroup.id, content: 'Keep', checked: false, sortOrder: 0 },
        { id: 'i-ideas', groupId: ideasGroup.id, content: 'Delete', checked: false, sortOrder: 0 },
      );
      mockHistoryDb.push({
        id: 'h-ideas',
        topicId: 't1',
        tabId: ideasTab.id,
        role: 'user',
        content: 'Delete me',
        created: '2026-01-01T00:00:00.000Z',
        seq: 0,
      });
      useChecklistStore.setState({ tabs: [...mockTabsDb], activeTabId: ideasTab.id, activeTopicId: 't1' });

      expect(await useChecklistStore.getState().deleteTab(ideasTab.id)).toBe(true);

      expect(mockTabsDb.map((tab) => tab.id)).toEqual(['tab-main']);
      expect(mockGroupsDb).toEqual([mainGroup]);
      expect(mockItemsDb.map((item) => item.id)).toEqual(['i-main']);
      expect(mockHistoryDb).toEqual([]);
      expect(useChecklistStore.getState().activeTabId).toBe('tab-main');
    });

    it('does not delete the final tab', async () => {
      useChecklistStore.setState({ tabs: [...mockTabsDb], activeTabId: 'tab-main', activeTopicId: 't1' });

      expect(await useChecklistStore.getState().deleteTab('tab-main')).toBe(false);
      expect(mockTabsDb).toHaveLength(1);
    });
  });

  describe('createGroup and addItem', () => {
    it('adds a group with incremental sortOrder', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', '  My tasks  ');
      expect(group?.title).toBe('My tasks');
      expect(group?.sortOrder).toBe(0);
      expect(useChecklistStore.getState().groups).toHaveLength(1);
    });

    it('adds an item with incremental sortOrder within its group', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const item = await useChecklistStore.getState().addItem(group.id, 'First task', 'details here');
      expect(item?.sortOrder).toBe(0);
      expect(item?.checked).toBe(false);
      const second = await useChecklistStore.getState().addItem(group.id, 'Second task');
      expect(second?.sortOrder).toBe(1);
    });
  });

  describe('updateItem', () => {
    it('updates checked and content', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const item = await useChecklistStore.getState().addItem(group.id, 'Task');
      if (!item) throw new Error('expected item to be created');
      await useChecklistStore.getState().updateItem(item.id, { checked: true, content: 'Done' });

      const updated = useChecklistStore.getState().items.find((i) => i.id === item.id);
      expect(updated?.checked).toBe(true);
      expect(updated?.content).toBe('Done');
    });
  });

  describe('deleteGroup', () => {
    it('deletes the group and its items', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      await useChecklistStore.getState().addItem(group.id, 'Task 1');
      await useChecklistStore.getState().addItem(group.id, 'Task 2');

      await useChecklistStore.getState().deleteGroup(group.id);

      const state = useChecklistStore.getState();
      expect(state.groups).toHaveLength(0);
      expect(state.items).toHaveLength(0);
    });
  });

  describe('reorderItem', () => {
    it('reorders items within a group', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const a = await useChecklistStore.getState().addItem(group.id, 'A');
      const b = await useChecklistStore.getState().addItem(group.id, 'B');
      const c = await useChecklistStore.getState().addItem(group.id, 'C');

      await useChecklistStore.getState().reorderItem(group.id, 0, 2);

      const ordered = useChecklistStore.getState().items.filter((i) => i.groupId === group.id);
      expect(ordered.map((i) => i.id)).toEqual([b?.id, c?.id, a?.id]);
    });
  });

  describe('generateChecklist', () => {
    it('parses LLM JSON and persists groups and items', async () => {
      mockAskLlm.mockResolvedValue({
        content: JSON.stringify({
          groups: [
            { title: 'Important', items: [{ content: 'Task 1', details: 'Do it now' }, { content: 'Task 2' }] },
            { title: 'Later', items: [{ content: 'Task 3' }] },
          ],
        }),
      });

      await useChecklistStore.getState().generateChecklist('t1', 'Plan my day');

      const state = useChecklistStore.getState();
      expect(state.groups.map((g) => g.title)).toEqual(['Important', 'Later']);
      expect(state.items.map((i) => i.content).sort()).toEqual(['Task 1', 'Task 2', 'Task 3']);
      expect(state.items.find((i) => i.content === 'Task 1')?.details).toBe('Do it now');
      expect(state.items.find((i) => i.content === 'Task 1')?.createdBy).toBe('assistant');
      expect(mockGenerateTopicName).toHaveBeenCalledWith('t1', 'Plan my day');
      expect(state.history.map((h) => h.role)).toEqual(['user', 'assistant']);
      expect(state.history[0].content).toBe('Plan my day');
    });

    it('notifies when the model returns invalid JSON', async () => {
      mockAskLlm.mockResolvedValue({ content: 'not json' });

      await useChecklistStore.getState().generateChecklist('t1', 'Plan');

      expect(mockAddNotification).toHaveBeenCalledWith('Failed to generate checklist', expect.any(String));
    });

    it('discards a generated checklist after the active topic changes', async () => {
      let resolveGeneration: ((value: { content: string }) => void) | undefined;
      mockAskLlm.mockImplementation(
        (): Promise<{ content: string }> =>
          new Promise((resolve) => {
            resolveGeneration = resolve;
          }),
      );

      const generation = useChecklistStore.getState().generateChecklist('t1', 'Plan topic A');
      await useChecklistStore.getState().loadChecklist('t2');
      resolveGeneration?.({
        content: JSON.stringify({ groups: [{ title: 'Topic A', items: [{ content: 'Wrong topic' }] }] }),
      });
      await generation;

      const state = useChecklistStore.getState();
      expect(state.activeTopicId).toBe('t2');
      expect(state.groups).toEqual([]);
      expect(state.items).toEqual([]);
      expect(state.history).toEqual([]);
      expect(mockGenerateTopicName).not.toHaveBeenCalled();
    });

    it('does not recreate checklist data when its topic is deleted during generation', async () => {
      let resolveGeneration: ((value: { content: string }) => void) | undefined;
      let signalGenerationStarted: (() => void) | undefined;
      const generationStarted = new Promise<void>((resolve) => {
        signalGenerationStarted = resolve;
      });
      mockAskLlm.mockImplementation(
        (): Promise<{ content: string }> =>
          new Promise((resolve) => {
            resolveGeneration = resolve;
            signalGenerationStarted?.();
          }),
      );

      const generation = useChecklistStore.getState().generateChecklist('t1', 'Plan deleted topic');
      await generationStarted;
      mockTopicExists.mockResolvedValue(false);
      resolveGeneration?.({
        content: JSON.stringify({ groups: [{ title: 'Orphan', items: [{ content: 'Wrong topic' }] }] }),
      });
      await generation;

      expect(mockGroupsDb).toEqual([]);
      expect(mockItemsDb).toEqual([]);
      expect(mockHistoryDb).toEqual([]);
      expect(useChecklistStore.getState().groups).toEqual([]);
      expect(mockGenerateTopicName).not.toHaveBeenCalled();
    });
  });

  describe('applyLlmEdit', () => {
    it('sends only the active tab checklist to the LLM', async () => {
      const activeGroup: ChecklistGroup = { id: 'g-active', topicId: 't1', tabId: 'tab-main', title: 'Visible section', sortOrder: 0 };
      const hiddenGroup: ChecklistGroup = { id: 'g-hidden', topicId: 't1', tabId: 'tab-hidden', title: 'Hidden section', sortOrder: 0 };
      useChecklistStore.setState({
        tabs: [...mockTabsDb, { id: 'tab-hidden', topicId: 't1', name: 'Hidden', sortOrder: 1 }],
        activeTabId: 'tab-main',
        activeTopicId: 't1',
        groups: [activeGroup, hiddenGroup],
        items: [
          { id: 'i-active', groupId: activeGroup.id, content: 'Visible task', checked: false, sortOrder: 0 },
          { id: 'i-hidden', groupId: hiddenGroup.id, content: 'Hidden task', checked: false, sortOrder: 0 },
        ],
      });
      let capturedMessages: unknown = null;
      mockOrchestrateLlmLoop.mockImplementation((...args: unknown[]): { finalContent: string } => {
        capturedMessages = args[2];
        return { finalContent: 'Done.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Update this tab');

      const serializedMessages = JSON.stringify(capturedMessages);
      expect(serializedMessages).toContain('Visible section');
      expect(serializedMessages).toContain('Visible task');
      expect(serializedMessages).not.toContain('Hidden section');
      expect(serializedMessages).not.toContain('Hidden task');
    });

    it('executes a tool call that mutates the checklist', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });
      const gid = group.id;

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool('add_checklist_item', JSON.stringify({ groupId: gid.slice(0, 8), content: 'New from AI' }));
        expect(result).toContain('Success: Added item');
        expect(result).toContain('CURRENT CHECKLIST JSON after this tool call:');
        expect(result).toContain('New from AI');
        return { finalContent: 'Added one task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add a task');

      const items = useChecklistStore.getState().items.filter((i) => i.groupId === gid);
      expect(items.map((i) => i.content)).toEqual(['New from AI']);
      expect(items[0].createdBy).toBe('assistant');
      expect(useChecklistStore.getState().lastEditSummary).toBe('Added one task.');
      expect(useChecklistStore.getState().history.map((h) => h.role)).toEqual(['user', 'assistant']);
    });

    it('returns refreshed checklist state after a deletion', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const item = await useChecklistStore.getState().addItem(group.id, 'Remove me');
      if (!item) throw new Error('expected item to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool('delete_checklist_item', JSON.stringify({ itemId: item.id.slice(0, 8) }));
        expect(result).toContain('Success: Deleted item');
        expect(result).toContain('CURRENT CHECKLIST JSON after this tool call:');
        expect(result).not.toContain('Remove me');
        return { finalContent: 'Deleted one task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Delete the task');

      expect(useChecklistStore.getState().items).toEqual([]);
    });

    it('notifies when a checklist tool failure remains unresolved', async () => {
      useChecklistStore.setState({ activeTopicId: 't1' });
      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool('delete_checklist_item', JSON.stringify({ itemId: 'missing' }));
        expect(result).toContain('Error: item not found.');
        return { finalContent: 'I could not delete the task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Delete the missing task');

      expect(mockAddNotification).toHaveBeenCalledWith('Some checklist changes failed', 'delete_checklist_item: item not found.', 'warning');
    });

    it('does not notify when the model corrects a failed tool call', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const item = await useChecklistStore.getState().addItem(group.id, 'Remove me');
      if (!item) throw new Error('expected item to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });
      mockAddNotification.mockClear();

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        await onExecuteTool('delete_checklist_item', JSON.stringify({ itemId: 'missing' }));
        await onExecuteTool('delete_checklist_item', JSON.stringify({ itemId: item.id.slice(0, 8) }));
        return { finalContent: 'Deleted one task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Delete the task');

      expect(mockAddNotification).not.toHaveBeenCalled();
    });

    it('moves one checklist item by ID and destination index', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const first = await useChecklistStore.getState().addItem(group.id, 'First');
      const second = await useChecklistStore.getState().addItem(group.id, 'Second');
      if (!first || !second) throw new Error('expected items to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool('reorder_checklist_items', JSON.stringify({ itemId: first.id.slice(0, 8), toIndex: 1 }));
        expect(result).toContain('Success: Moved item');
        return { finalContent: 'Moved one task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Move the first task to the end');

      expect(useChecklistStore.getState().items.map((item) => item.id)).toEqual([second.id, first.id]);
      expect(mockItemsDb.map((item) => item.sortOrder)).toEqual([1, 0]);
    });

    it('moves one checklist group by ID and destination index', async () => {
      const first = await useChecklistStore.getState().createGroup('t1', 'First');
      const second = await useChecklistStore.getState().createGroup('t1', 'Second');
      if (!first || !second) throw new Error('expected groups to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool('reorder_checklist_groups', JSON.stringify({ groupId: first.id.slice(0, 8), toIndex: 1 }));
        expect(result).toContain('Success: Moved group');
        return { finalContent: 'Moved one list.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Move the first list to the end');

      expect(useChecklistStore.getState().groups.map((group) => group.id)).toEqual([second.id, first.id]);
      expect(mockGroupsDb.map((group) => group.sortOrder)).toEqual([1, 0]);
    });

    it('rejects an out-of-range item destination without changing order', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const item = await useChecklistStore.getState().addItem(group.id, 'Only task');
      if (!item) throw new Error('expected item to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool('reorder_checklist_items', JSON.stringify({ itemId: item.id.slice(0, 8), toIndex: 1 }));
        expect(result).toContain('Error: destination index is out of range.');
        return { finalContent: 'Could not move the task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Move the task');

      expect(useChecklistStore.getState().items.map((entry) => entry.id)).toEqual([item.id]);
      expect(mockAddNotification).toHaveBeenCalledWith(
        'Some checklist changes failed',
        'reorder_checklist_items: destination index is out of range.',
        'warning',
      );
    });

    it('allows only one structural mutation per model response', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string, iteration: number) => Promise<string>;
        const first = await onExecuteTool('add_checklist_item', JSON.stringify({ groupId: group.id.slice(0, 8), content: 'First' }), 1);
        const blocked = await onExecuteTool('add_checklist_item', JSON.stringify({ groupId: group.id.slice(0, 8), content: 'Blocked' }), 1);
        const nextRound = await onExecuteTool('add_checklist_item', JSON.stringify({ groupId: group.id.slice(0, 8), content: 'Second' }), 2);
        expect(first).toContain('Success: Added item');
        expect(blocked).toContain('Error: only one structural checklist change is allowed per tool round');
        expect(nextRound).toContain('Success: Added item');
        return { finalContent: 'Added two tasks.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add two tasks');

      expect(useChecklistStore.getState().items.map((item) => item.content)).toEqual(['First', 'Second']);
      expect(mockAddNotification).not.toHaveBeenCalled();
    });

    it('disables tool-result caching so duplicate structural calls can be rejected', async () => {
      let cacheToolResults: unknown;
      mockOrchestrateLlmLoop.mockImplementation((...args: unknown[]): { finalContent: string } => {
        cacheToolResults = args[12];
        return { finalContent: 'Done.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add the task once');

      expect(cacheToolResults).toBe(false);
    });

    it('injects prior history into the edit context', async () => {
      useChecklistStore.setState({
        history: [
          {
            id: 'h1',
            topicId: 't1',
            tabId: 'tab-main',
            role: 'user',
            content: 'Add a packing section',
            created: '2026-01-01T00:00:00.000Z',
            seq: 0,
          },
          {
            id: 'h2',
            topicId: 't1',
            tabId: 'tab-main',
            role: 'assistant',
            content: 'Added packing section.',
            created: '2026-01-01T00:00:01.000Z',
            seq: 1,
          },
        ],
      });

      let capturedMessages: unknown = null;
      mockOrchestrateLlmLoop.mockImplementation((...args: unknown[]): { finalContent: string } => {
        capturedMessages = args[2];
        return { finalContent: 'Done.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add a toothbrush to it');

      const messages = capturedMessages as { role: string; content: string }[];
      expect(messages.some((m) => m.role === 'user' && m.content === 'Add a packing section')).toBe(true);
      expect(messages.some((m) => m.role === 'assistant' && m.content === 'Added packing section.')).toBe(true);
      expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'Add a toothbrush to it' });
    });

    it('does not edit when the model lacks tool support', async () => {
      mockGetSelectedModel.mockReturnValue(createUserChatModel({ supportsTools: false }));

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add a task');

      expect(mockOrchestrateLlmLoop).not.toHaveBeenCalled();
      expect(mockAddNotification).toHaveBeenCalledWith('Model does not support checklist editing', expect.any(String));
    });

    it('stops editing in finally even on error', async () => {
      mockOrchestrateLlmLoop.mockRejectedValue(new Error('boom'));

      await useChecklistStore.getState().applyLlmEdit('t1', 'Do something');

      expect(useChecklistStore.getState().editing).toBe(false);
    });

    it('aborts tool execution when the active checklist topic changes', async () => {
      const groupA = await useChecklistStore.getState().createGroup('t1', 'Topic A');
      if (!groupA) throw new Error('expected group to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });
      const groupB: ChecklistGroup = { id: 'group-b', topicId: 't2', title: 'Topic B', sortOrder: 0 };

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        useChecklistStore.setState({ activeTopicId: 't2', groups: [groupB], items: [] });
        await expect(onExecuteTool('add_checklist_item', JSON.stringify({ groupId: groupB.id, content: 'Wrong topic' }))).rejects.toMatchObject({
          name: 'AbortError',
        });
        throw new DOMException('Checklist topic changed during edit', 'AbortError');
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add a task');

      expect(useChecklistStore.getState().items).toEqual([]);
      expect(useChecklistStore.getState().lastEditSummary).toBe('');
      expect(useChecklistStore.getState().history.map((entry) => [entry.role, entry.content])).toEqual([['user', 'Add a task']]);
    });

    it('ignores a final edit result after the active checklist topic changes', async () => {
      const groupA = await useChecklistStore.getState().createGroup('t1', 'Topic A');
      if (!groupA) throw new Error('expected group to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });
      const groupB: ChecklistGroup = { id: 'group-b', topicId: 't2', title: 'Topic B', sortOrder: 0 };
      mockOrchestrateLlmLoop.mockImplementation((): { finalContent: string } => {
        useChecklistStore.setState({ activeTopicId: 't2', groups: [groupB], items: [] });
        return { finalContent: 'Edited topic A.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Rename a task');

      expect(useChecklistStore.getState().groups).toEqual([groupB]);
      expect(useChecklistStore.getState().lastEditSummary).toBe('');
      expect(useChecklistStore.getState().history.map((entry) => [entry.role, entry.content])).toEqual([['user', 'Rename a task']]);
    });

    it('reorders all items in a group with set_checklist_item_order', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Fruits');
      if (!group) throw new Error('expected group to be created');
      const apple = await useChecklistStore.getState().addItem(group.id, 'Apple');
      const cherry = await useChecklistStore.getState().addItem(group.id, 'Cherry');
      const banana = await useChecklistStore.getState().addItem(group.id, 'Banana');
      if (!apple || !cherry || !banana) throw new Error('expected items to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool(
          'set_checklist_item_order',
          JSON.stringify({
            groupId: group.id.slice(0, 8),
            itemIds: [banana.id.slice(0, 8), apple.id.slice(0, 8), cherry.id.slice(0, 8)],
          }),
        );
        expect(result).toContain('Success: Reordered 3 item(s)');
        return { finalContent: 'Sorted the fruits.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Sort the fruits');

      expect(useChecklistStore.getState().items.map((item) => item.id)).toEqual([banana.id, apple.id, cherry.id]);
      const persistedSortOrder = new Map(mockItemsDb.map((item) => [item.content, item.sortOrder]));
      expect(persistedSortOrder.get('Banana')).toBe(0);
      expect(persistedSortOrder.get('Apple')).toBe(1);
      expect(persistedSortOrder.get('Cherry')).toBe(2);
    });

    it('rejects set_checklist_item_order with unknown or duplicate item IDs', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Fruits');
      if (!group) throw new Error('expected group to be created');
      const apple = await useChecklistStore.getState().addItem(group.id, 'Apple');
      const cherry = await useChecklistStore.getState().addItem(group.id, 'Cherry');
      if (!apple || !cherry) throw new Error('expected items to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const unknown = await onExecuteTool(
          'set_checklist_item_order',
          JSON.stringify({ groupId: group.id.slice(0, 8), itemIds: [apple.id.slice(0, 8), 'nope'] }),
        );
        expect(unknown).toContain('Error: item nope not found in this group.');
        const duplicate = await onExecuteTool(
          'set_checklist_item_order',
          JSON.stringify({ groupId: group.id.slice(0, 8), itemIds: [apple.id.slice(0, 8), apple.id.slice(0, 8)] }),
        );
        expect(duplicate).toContain('Error: duplicate item ID');
        return { finalContent: 'Could not sort.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Sort the fruits');

      expect(useChecklistStore.getState().items.map((item) => item.id)).toEqual([apple.id, cherry.id]);
    });

    it('adds several items with add_checklist_items in one call', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Packing');
      if (!group) throw new Error('expected group to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool(
          'add_checklist_items',
          JSON.stringify({
            groupId: group.id.slice(0, 8),
            items: [{ content: 'Toothbrush' }, { content: 'Passport', details: 'Valid for 6 months' }],
          }),
        );
        expect(result).toContain('Success: Added 2 item(s)');
        return { finalContent: 'Added two tasks.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add toothbrush and passport');

      const items = useChecklistStore.getState().items.filter((item) => item.groupId === group.id);
      expect(items.map((item) => item.content)).toEqual(['Toothbrush', 'Passport']);
      expect(items.every((item) => item.createdBy === 'assistant')).toBe(true);
      expect(items.find((item) => item.content === 'Passport')?.details).toBe('Valid for 6 months');
    });

    it('deletes several items with delete_checklist_items in one call', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Fruits');
      if (!group) throw new Error('expected group to be created');
      const apple = await useChecklistStore.getState().addItem(group.id, 'Apple');
      const cherry = await useChecklistStore.getState().addItem(group.id, 'Cherry');
      const keep = await useChecklistStore.getState().addItem(group.id, 'Keep me');
      if (!apple || !cherry || !keep) throw new Error('expected items to be created');
      useChecklistStore.setState({ activeTopicId: 't1' });

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool(
          'delete_checklist_items',
          JSON.stringify({ itemIds: [apple.id.slice(0, 8), cherry.id.slice(0, 8)] }),
        );
        expect(result).toContain('Success: Deleted 2 item(s)');
        return { finalContent: 'Removed two fruits.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Remove the fruits');

      expect(useChecklistStore.getState().items.map((item) => item.id)).toEqual([keep.id]);
      expect(mockItemsDb.map((item) => item.id)).toEqual([keep.id]);
    });
  });
});
