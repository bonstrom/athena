import { ChecklistGroup, ChecklistItem, ChecklistHistoryEntry } from '../../database/AthenaDb';
import { UserChatModel } from '../../types/provider';
import { createUserChatModel } from '../../testUtils';

let mockGroupsDb: ChecklistGroup[] = [];
let mockItemsDb: ChecklistItem[] = [];
let mockHistoryDb: ChecklistHistoryEntry[] = [];

const mockAskLlm = jest.fn();
const mockOrchestrateLlmLoop = jest.fn();
const mockAddNotification = jest.fn((title: string, message?: string): undefined => {
  void title;
  void message;
  return undefined;
});
const mockGetSelectedModel = jest.fn<UserChatModel, []>();
const mockGenerateTopicName = jest.fn<Promise<void>, [string, string]>();

const mockTransaction = jest.fn<Promise<void>, [string, unknown[], () => Promise<void>]>();

function mockMakeWhereClause<T>(
  records: T[],
  field: string,
  value: unknown,
): { toArray: () => Promise<T[]>; delete: () => Promise<number> } {
  return {
    toArray: (): Promise<T[]> =>
      Promise.resolve(records.filter((r) => (r as Record<string, unknown>)[field] === value)),
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
    getState: (): { generateTopicName: (topicId: string, userMessage: string) => Promise<void> } => ({
      generateTopicName: (...args: [string, string]): Promise<void> => mockGenerateTopicName(...args),
    }),
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

jest.mock('../../services/llmService', () => ({
  askLlm: (...args: unknown[]): ReturnType<typeof mockAskLlm> => mockAskLlm(...args),
  orchestrateLlmLoop: (...args: unknown[]): ReturnType<typeof mockOrchestrateLlmLoop> =>
    mockOrchestrateLlmLoop(...args),
}));

jest.mock('../../components/ModelSelector', () => ({
  getDefaultModel: jest.fn(),
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
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
      where: (field: string): { equals: (value: unknown) => { toArray: () => Promise<ChecklistGroup[]> } } => ({
        equals: (value: unknown) => ({
          toArray: (): Promise<ChecklistGroup[]> =>
            Promise.resolve(mockGroupsDb.filter((g) => (g as Record<string, unknown>)[field] === value)),
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
      update: (id: string, patch: Partial<ChecklistItem>): Promise<number> => {
        const item = mockItemsDb.find((x) => x.id === id);
        if (item) Object.assign(item, patch);
        return Promise.resolve(item ? 1 : 0);
      },
      delete: (id: string): Promise<void> => {
        mockItemsDb = mockItemsDb.filter((x) => x.id !== id);
        return Promise.resolve();
      },
      where: (
        field: string,
      ): {
        equals: (value: unknown) => { toArray: () => Promise<ChecklistItem[]>; delete: () => Promise<number> };
        anyOf: (values: unknown[]) => { toArray: () => Promise<ChecklistItem[]> };
      } => ({
        equals: (value: unknown): { toArray: () => Promise<ChecklistItem[]>; delete: () => Promise<number> } =>
          mockMakeWhereClause(mockItemsDb, field, value),
        anyOf: (values: unknown[]) => ({
          toArray: (): Promise<ChecklistItem[]> =>
            Promise.resolve(mockItemsDb.filter((i) => values.includes((i as Record<string, unknown>)[field]))),
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
      where: (field: string): { equals: (value: unknown) => { sortBy: () => Promise<ChecklistHistoryEntry[]> } } => ({
        equals: (value: unknown) => ({
          sortBy: (): Promise<ChecklistHistoryEntry[]> =>
            Promise.resolve(
              mockHistoryDb
                .filter((e) => (e as Record<string, unknown>)[field] === value)
                .sort((a, b) => a.created.localeCompare(b.created)),
            ),
        }),
      }),
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
    mockAskLlm.mockReset();
    mockOrchestrateLlmLoop.mockReset();
    mockAddNotification.mockReset();
    mockTransaction.mockReset();
    mockGetSelectedModel.mockReset();
    mockGenerateTopicName.mockReset();
    mockGetSelectedModel.mockReturnValue(createUserChatModel());
    mockTransaction.mockImplementation(
      async (_mode: string, _tables: unknown[], callback: () => Promise<void>): Promise<void> => {
        await callback();
      },
    );

    useChecklistStore.setState({
      groups: [],
      items: [],
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
        { id: 'g2', topicId: 't1', title: 'Later', sortOrder: 1 },
        { id: 'g1', topicId: 't1', title: 'First', sortOrder: 0 },
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
  });

  describe('applyLlmEdit', () => {
    it('executes a tool call that mutates the checklist', async () => {
      const group = await useChecklistStore.getState().createGroup('t1', 'Tasks');
      if (!group) throw new Error('expected group to be created');
      const gid = group.id;

      mockOrchestrateLlmLoop.mockImplementation(async (...args: unknown[]): Promise<{ finalContent: string }> => {
        const onExecuteTool = args[6] as (toolName: string, argsJson: string) => Promise<string>;
        const result = await onExecuteTool(
          'add_checklist_item',
          JSON.stringify({ groupId: gid.slice(0, 8), content: 'New from AI' }),
        );
        expect(result).toContain('Added item');
        return { finalContent: 'Added one task.' };
      });

      await useChecklistStore.getState().applyLlmEdit('t1', 'Add a task');

      const items = useChecklistStore.getState().items.filter((i) => i.groupId === gid);
      expect(items.map((i) => i.content)).toEqual(['New from AI']);
      expect(items[0].createdBy).toBe('assistant');
      expect(useChecklistStore.getState().lastEditSummary).toBe('Added one task.');
      expect(useChecklistStore.getState().history.map((h) => h.role)).toEqual(['user', 'assistant']);
    });

    it('injects prior history into the edit context', async () => {
      useChecklistStore.setState({
        history: [
          {
            id: 'h1',
            topicId: 't1',
            role: 'user',
            content: 'Add a packing section',
            created: '2026-01-01T00:00:00.000Z',
            seq: 0,
          },
          {
            id: 'h2',
            topicId: 't1',
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
  });
});
