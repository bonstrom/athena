import { create } from 'zustand';
import { athenaDb, ChecklistGroup, ChecklistItem, ChecklistHistoryEntry } from '../database/AthenaDb';
import { useNotificationStore } from './NotificationStore';
import { useChatStore } from './ChatStore';
import { useTopicStore } from './TopicStore';
import { askLlm, orchestrateLlmLoop, LlmMessage } from '../services/llmService';
import { CHECKLIST_TOOLS } from '../services/checklistTools';
import { parseChecklistGroups } from '../utils/structuredJson';
import { CHECKLIST_GENERATION_PROMPT, CHECKLIST_EDITING_INSTRUCTIONS, SHORTENED_ID_LENGTH } from '../constants';
import { ChatModel } from '../components/ModelSelector';

const HISTORY_LIMIT = 20;

function sortGroups(groups: ChecklistGroup[]): ChecklistGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
}

function sortItems(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

function shortId(id: string): string {
  return id.slice(0, SHORTENED_ID_LENGTH);
}

function resolveById<T extends { id: string }>(records: T[], idOrPrefix: string): T | undefined {
  const exact = records.find((r) => r.id === idOrPrefix);
  if (exact) return exact;
  const matches = records.filter((r) => r.id.startsWith(idOrPrefix));
  return matches.length === 1 ? matches[0] : undefined;
}

function resolveAllById<T extends { id: string }>(records: T[], ids: string[]): T[] | null {
  const resolved: T[] = [];
  for (const id of ids) {
    const match = resolveById(records, id);
    if (!match) return null;
    resolved.push(match);
  }
  return resolved;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function serializeChecklist(groups: ChecklistGroup[], items: ChecklistItem[]): string {
  if (groups.length === 0) return '(empty checklist)';
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(`Group [${shortId(g.id)}] "${g.title}"`);
    const groupItems = items.filter((i) => i.groupId === g.id);
    if (groupItems.length === 0) {
      lines.push('  (no items)');
      continue;
    }
    for (const it of groupItems) {
      lines.push(`  - [${shortId(it.id)}] (${it.checked ? 'checked' : 'unchecked'}) "${it.content}"`);
      if (it.details) lines.push(`      details: "${it.details}"`);
    }
  }
  return lines.join('\n');
}

interface ChecklistState {
  groups: ChecklistGroup[];
  items: ChecklistItem[];
  loading: boolean;
  generating: boolean;
  editing: boolean;
  streamingContent: string;
  lastEditSummary: string;
  history: ChecklistHistoryEntry[];

  loadChecklist: (topicId: string) => Promise<void>;
  createGroup: (topicId: string, title: string) => Promise<ChecklistGroup | null>;
  renameGroup: (groupId: string, title: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  reorderGroup: (fromIndex: number, toIndex: number) => Promise<void>;
  addItem: (
    groupId: string,
    content: string,
    details?: string,
    createdBy?: 'user' | 'assistant',
  ) => Promise<ChecklistItem | null>;
  updateItem: (itemId: string, patch: Partial<Pick<ChecklistItem, 'content' | 'details' | 'checked'>>) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  reorderItem: (groupId: string, fromIndex: number, toIndex: number) => Promise<void>;
  generateChecklist: (topicId: string, prompt: string) => Promise<void>;
  applyLlmEdit: (topicId: string, instruction: string) => Promise<void>;
  stopEdit: () => void;
}

let editAbortController: AbortController | null = null;

export const useChecklistStore = create<ChecklistState>((set, get) => {
  const notifyError = (action: string, err: unknown): void => {
    console.error(`[ChecklistStore] ${action}`, err);
    const message = err instanceof Error ? err.message : String(err);
    useNotificationStore.getState().addNotification(action, message);
  };

  /**
   * Executes a single checklist tool call from the LLM. Mutates store + DB and
   * returns a short confirmation string that is fed back to the model.
   */
  const executeChecklistTool = async (toolName: string, argsJson: string, topicId: string): Promise<string> => {
    const { groups, items } = get();

    const parseArgs = <T>(raw: string): T | null => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    };

    switch (toolName) {
      case 'add_checklist_group': {
        const args = parseArgs<{ title?: string; items?: { content?: string; details?: string }[] }>(argsJson);
        if (!args?.title?.trim()) return 'Error: missing title.';
        const group: ChecklistGroup = {
          id: crypto.randomUUID(),
          topicId,
          title: args.title.trim(),
          sortOrder: groups.length,
        };
        await athenaDb.checklistGroups.add(group);
        const createdItems: ChecklistItem[] = [];
        let order = 0;
        for (const it of args.items ?? []) {
          const content = it.content?.trim();
          if (!content) continue;
          createdItems.push({
            id: crypto.randomUUID(),
            groupId: group.id,
            content,
            details: trimOrUndefined(it.details),
            checked: false,
            sortOrder: order++,
            createdBy: 'assistant',
          });
        }
        if (createdItems.length > 0) await athenaDb.checklistItems.bulkAdd(createdItems);
        set((state) => ({
          groups: [...state.groups, group],
          items: [...state.items, ...createdItems],
        }));
        return `Added group [${shortId(group.id)}] "${group.title}" with ${createdItems.length} item(s).`;
      }

      case 'rename_checklist_group': {
        const args = parseArgs<{ groupId?: string; title?: string }>(argsJson);
        const target = args?.groupId ? resolveById(groups, args.groupId) : undefined;
        if (!target) return 'Error: group not found.';
        if (!args?.title?.trim()) return 'Error: missing title.';
        const title = args.title.trim();
        await athenaDb.checklistGroups.update(target.id, { title });
        set((state) => ({ groups: state.groups.map((g) => (g.id === target.id ? { ...g, title } : g)) }));
        return `Renamed group [${shortId(target.id)}] to "${title}".`;
      }

      case 'delete_checklist_group': {
        const args = parseArgs<{ groupId?: string }>(argsJson);
        const target = args?.groupId ? resolveById(groups, args.groupId) : undefined;
        if (!target) return 'Error: group not found.';
        await athenaDb.transaction('rw', [athenaDb.checklistGroups, athenaDb.checklistItems], async () => {
          await athenaDb.checklistGroups.delete(target.id);
          await athenaDb.checklistItems.where('groupId').equals(target.id).delete();
        });
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== target.id),
          items: state.items.filter((i) => i.groupId !== target.id),
        }));
        return `Deleted group [${shortId(target.id)}] "${target.title}".`;
      }

      case 'reorder_checklist_groups': {
        const args = parseArgs<{ groupIds?: string[] }>(argsJson);
        if (!args?.groupIds || args.groupIds.length !== groups.length)
          return 'Error: expected the full list of group IDs.';
        const resolved = resolveAllById(groups, args.groupIds);
        if (!resolved) return 'Error: one or more group IDs not found.';
        const reordered = resolved.map((g, idx) => ({ ...g, sortOrder: idx }));
        await athenaDb.transaction('rw', athenaDb.checklistGroups, async () => {
          for (const g of reordered) await athenaDb.checklistGroups.update(g.id, { sortOrder: g.sortOrder });
        });
        set((state) => {
          const byId = new Map(reordered.map((g) => [g.id, g]));
          return { groups: state.groups.map((g) => byId.get(g.id) ?? g).sort((a, b) => a.sortOrder - b.sortOrder) };
        });
        return 'Reordered groups.';
      }

      case 'add_checklist_item': {
        const args = parseArgs<{ groupId?: string; content?: string; details?: string }>(argsJson);
        const target = args?.groupId ? resolveById(groups, args.groupId) : undefined;
        if (!target) return 'Error: group not found.';
        if (!args?.content?.trim()) return 'Error: missing content.';
        const groupItems = items.filter((i) => i.groupId === target.id);
        const item: ChecklistItem = {
          id: crypto.randomUUID(),
          groupId: target.id,
          content: args.content.trim(),
          details: trimOrUndefined(args.details),
          checked: false,
          sortOrder: groupItems.length,
          createdBy: 'assistant',
        };
        await athenaDb.checklistItems.add(item);
        set((state) => ({ items: [...state.items, item] }));
        return `Added item [${shortId(item.id)}] "${item.content}" to group [${shortId(target.id)}].`;
      }

      case 'update_checklist_item': {
        const args = parseArgs<{ itemId?: string; content?: string; details?: string; checked?: boolean }>(argsJson);
        const target = args?.itemId ? resolveById(items, args.itemId) : undefined;
        if (!target) return 'Error: item not found.';
        const patch: Partial<ChecklistItem> = {};
        if (typeof args?.content === 'string' && args.content.trim()) patch.content = args.content.trim();
        if (typeof args?.details === 'string') patch.details = trimOrUndefined(args.details);
        if (typeof args?.checked === 'boolean') patch.checked = args.checked;
        if (Object.keys(patch).length === 0) return 'Error: nothing to update.';
        await athenaDb.checklistItems.update(target.id, patch);
        set((state) => ({ items: state.items.map((i) => (i.id === target.id ? { ...i, ...patch } : i)) }));
        return `Updated item [${shortId(target.id)}].`;
      }

      case 'delete_checklist_item': {
        const args = parseArgs<{ itemId?: string }>(argsJson);
        const target = args?.itemId ? resolveById(items, args.itemId) : undefined;
        if (!target) return 'Error: item not found.';
        await athenaDb.checklistItems.delete(target.id);
        set((state) => ({ items: state.items.filter((i) => i.id !== target.id) }));
        return `Deleted item [${shortId(target.id)}].`;
      }

      case 'reorder_checklist_items': {
        const args = parseArgs<{ groupId?: string; itemIds?: string[] }>(argsJson);
        const targetGroup = args?.groupId ? resolveById(groups, args.groupId) : undefined;
        if (!targetGroup) return 'Error: group not found.';
        const groupItems = items.filter((i) => i.groupId === targetGroup.id);
        if (!args?.itemIds || args.itemIds.length !== groupItems.length)
          return 'Error: expected the full list of item IDs for the group.';
        const resolved = resolveAllById(groupItems, args.itemIds);
        if (!resolved) return 'Error: one or more item IDs not found.';
        const reordered = resolved.map((it, idx) => ({ ...it, sortOrder: idx }));
        await athenaDb.transaction('rw', athenaDb.checklistItems, async () => {
          for (const it of reordered) await athenaDb.checklistItems.update(it.id, { sortOrder: it.sortOrder });
        });
        set((state) => {
          const byId = new Map(reordered.map((i) => [i.id, i]));
          return {
            items: sortItems(state.items.map((i) => byId.get(i.id) ?? i)),
          };
        });
        return 'Reordered items.';
      }

      default:
        return 'Tool not implemented.';
    }
  };

  /**
   * Appends a history entry for the current topic and trims to the last
   * HISTORY_LIMIT entries (both in state and in the DB).
   */
  const addHistoryEntry = async (topicId: string, role: 'user' | 'assistant', content: string): Promise<void> => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const current = get().history;
    const nextSeq = current.length > 0 ? Math.max(...current.map((e) => e.seq)) + 1 : 0;

    const entry: ChecklistHistoryEntry = {
      id: crypto.randomUUID(),
      topicId,
      role,
      content: trimmed,
      created: new Date().toISOString(),
      seq: nextSeq,
    };

    let nextHistory: ChecklistHistoryEntry[] = [];
    set((state) => {
      nextHistory = [...state.history, entry];
      return { history: nextHistory };
    });

    try {
      await athenaDb.checklistHistory.add(entry);

      if (nextHistory.length > HISTORY_LIMIT) {
        const overflow = nextHistory.slice(0, nextHistory.length - HISTORY_LIMIT);
        await athenaDb.checklistHistory.bulkDelete(overflow.map((e) => e.id));
        set({ history: nextHistory.slice(nextHistory.length - HISTORY_LIMIT) });
      }
    } catch (err) {
      console.warn('[ChecklistStore] Failed to persist history entry', err);
    }
  };

  const buildHistoryMessages = (): LlmMessage[] => {
    return get()
      .history.slice(-HISTORY_LIMIT)
      .map((entry) => ({ role: entry.role, content: entry.content }));
  };

  return {
    groups: [],
    items: [],
    loading: false,
    generating: false,
    editing: false,
    streamingContent: '',
    lastEditSummary: '',
    history: [],

    loadChecklist: async (topicId: string): Promise<void> => {
      set({ loading: true });
      try {
        const groups = await athenaDb.checklistGroups.where('topicId').equals(topicId).toArray();
        const groupIds = groups.map((g) => g.id);
        const items =
          groupIds.length > 0 ? await athenaDb.checklistItems.where('groupId').anyOf(groupIds).toArray() : [];
        const history = await athenaDb.checklistHistory.where('topicId').equals(topicId).sortBy('seq');
        set({ groups: sortGroups(groups), items: sortItems(items), history, loading: false });
      } catch (err) {
        notifyError('Failed to load checklist', err);
        set({ loading: false });
      }
    },

    createGroup: async (topicId: string, title: string): Promise<ChecklistGroup | null> => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      try {
        const group: ChecklistGroup = {
          id: crypto.randomUUID(),
          topicId,
          title: trimmed,
          sortOrder: get().groups.length,
        };
        await athenaDb.checklistGroups.add(group);
        set((state) => ({ groups: [...state.groups, group] }));
        return group;
      } catch (err) {
        notifyError('Failed to create list', err);
        return null;
      }
    },

    renameGroup: async (groupId: string, title: string): Promise<void> => {
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        await athenaDb.checklistGroups.update(groupId, { title: trimmed });
        set((state) => ({ groups: state.groups.map((g) => (g.id === groupId ? { ...g, title: trimmed } : g)) }));
      } catch (err) {
        notifyError('Failed to rename list', err);
      }
    },

    deleteGroup: async (groupId: string): Promise<void> => {
      try {
        await athenaDb.transaction('rw', [athenaDb.checklistGroups, athenaDb.checklistItems], async () => {
          await athenaDb.checklistGroups.delete(groupId);
          await athenaDb.checklistItems.where('groupId').equals(groupId).delete();
        });
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== groupId),
          items: state.items.filter((i) => i.groupId !== groupId),
        }));
      } catch (err) {
        notifyError('Failed to delete list', err);
      }
    },

    reorderGroup: async (fromIndex: number, toIndex: number): Promise<void> => {
      const groups = get().groups;
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= groups.length || toIndex >= groups.length) return;
      const next = [...groups];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const reordered = next.map((g, idx) => ({ ...g, sortOrder: idx }));
      try {
        await athenaDb.transaction('rw', athenaDb.checklistGroups, async () => {
          for (const g of reordered) await athenaDb.checklistGroups.update(g.id, { sortOrder: g.sortOrder });
        });
        set({ groups: reordered });
      } catch (err) {
        notifyError('Failed to reorder lists', err);
      }
    },

    addItem: async (
      groupId: string,
      content: string,
      details?: string,
      createdBy: 'user' | 'assistant' = 'user',
    ): Promise<ChecklistItem | null> => {
      const trimmed = content.trim();
      if (!trimmed) return null;
      try {
        const groupItems = get().items.filter((i) => i.groupId === groupId);
        const item: ChecklistItem = {
          id: crypto.randomUUID(),
          groupId,
          content: trimmed,
          details: trimOrUndefined(details),
          checked: false,
          sortOrder: groupItems.length,
          createdBy,
        };
        await athenaDb.checklistItems.add(item);
        set((state) => ({ items: [...state.items, item] }));
        return item;
      } catch (err) {
        notifyError('Failed to add task', err);
        return null;
      }
    },

    updateItem: async (itemId: string, patch): Promise<void> => {
      try {
        await athenaDb.checklistItems.update(itemId, patch);
        set((state) => ({ items: state.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));
      } catch (err) {
        notifyError('Failed to update task', err);
      }
    },

    deleteItem: async (itemId: string): Promise<void> => {
      try {
        await athenaDb.checklistItems.delete(itemId);
        set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }));
      } catch (err) {
        notifyError('Failed to delete task', err);
      }
    },

    reorderItem: async (groupId: string, fromIndex: number, toIndex: number): Promise<void> => {
      const groupItems = get().items.filter((i) => i.groupId === groupId);
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= groupItems.length || toIndex >= groupItems.length) return;
      const next = [...groupItems];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const reordered = next.map((it, idx) => ({ ...it, sortOrder: idx }));
      try {
        await athenaDb.transaction('rw', athenaDb.checklistItems, async () => {
          for (const it of reordered) await athenaDb.checklistItems.update(it.id, { sortOrder: it.sortOrder });
        });
        set((state) => {
          const byId = new Map(reordered.map((i) => [i.id, i]));
          return { items: sortItems(state.items.map((i) => byId.get(i.id) ?? i)) };
        });
      } catch (err) {
        notifyError('Failed to reorder tasks', err);
      }
    },

    generateChecklist: async (topicId: string, prompt: string): Promise<void> => {
      const trimmed = prompt.trim();
      if (!trimmed || get().generating) return;
      const model: ChatModel = useChatStore.getState().selectedModel;
      set({ generating: true });
      try {
        const result = await askLlm(
          model,
          0.7,
          [
            { role: 'system', content: CHECKLIST_GENERATION_PROMPT },
            { role: 'user', content: trimmed },
          ],
          undefined,
          undefined,
          undefined,
          { includeCustomInstructions: false },
        );

        const parsed = parseChecklistGroups(result.content);
        if (!parsed || parsed.length === 0) {
          throw new Error('The model did not return a valid checklist.');
        }

        const groups: ChecklistGroup[] = parsed.map((g, idx) => ({
          id: crypto.randomUUID(),
          topicId,
          title: g.title || `Section ${idx + 1}`,
          sortOrder: idx,
        }));

        const items: ChecklistItem[] = [];
        parsed.forEach((g, gi) => {
          const groupId = groups[gi].id;
          g.items.forEach((it, ii) => {
            items.push({
              id: crypto.randomUUID(),
              groupId,
              content: it.content,
              details: it.details,
              checked: false,
              sortOrder: ii,
              createdBy: 'assistant',
            });
          });
        });

        await athenaDb.transaction('rw', [athenaDb.checklistGroups, athenaDb.checklistItems], async () => {
          if (groups.length > 0) await athenaDb.checklistGroups.bulkAdd(groups);
          if (items.length > 0) await athenaDb.checklistItems.bulkAdd(items);
        });

        set({ groups: sortGroups(groups), items: sortItems(items) });

        // Record the generation prompt and its result in the instruction history.
        await addHistoryEntry(topicId, 'user', trimmed);
        await addHistoryEntry(
          topicId,
          'assistant',
          `Created a checklist with ${groups.length} section(s) and ${items.length} task(s).`,
        );

        // Name the topic if it still has the default name (e.g. "New Checklist")
        void useTopicStore.getState().generateTopicName(topicId, trimmed);
      } catch (err) {
        notifyError('Failed to generate checklist', err);
      } finally {
        set({ generating: false });
      }
    },

    applyLlmEdit: async (topicId: string, instruction: string): Promise<void> => {
      const trimmed = instruction.trim();
      if (!trimmed || get().editing) return;

      const model: ChatModel = useChatStore.getState().selectedModel;
      if (!model.supportsTools) {
        notifyError(
          'Model does not support checklist editing',
          new Error('Select a model with tool support to edit checklists.'),
        );
        return;
      }

      const { groups, items } = get();
      const stateBlock = serializeChecklist(groups, items);

      editAbortController = new AbortController();
      set({ editing: true, streamingContent: '', lastEditSummary: '' });

      try {
        const historyMessages = buildHistoryMessages();
        const messages: LlmMessage[] = [
          { role: 'system', content: CHECKLIST_EDITING_INSTRUCTIONS },
          { role: 'system', content: `CURRENT CHECKLIST:\n${stateBlock}` },
          ...historyMessages,
          { role: 'user', content: trimmed },
        ];

        const result = await orchestrateLlmLoop(
          model,
          0.7,
          messages,
          (token: string): void => set((state) => ({ streamingContent: state.streamingContent + token })),
          undefined,
          undefined,
          (toolName: string, argsJson: string): Promise<string> => executeChecklistTool(toolName, argsJson, topicId),
          undefined,
          CHECKLIST_TOOLS,
          undefined,
          editAbortController.signal,
          { includeCustomInstructions: false },
        );

        set({ lastEditSummary: result.finalContent.trim() });

        // Record the instruction and its summary for future turns.
        await addHistoryEntry(topicId, 'user', trimmed);
        await addHistoryEntry(topicId, 'assistant', result.finalContent);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        notifyError('Failed to update checklist', err);
      } finally {
        set({ editing: false, streamingContent: '' });
        editAbortController = null;
      }
    },

    stopEdit: (): void => {
      if (editAbortController) {
        editAbortController.abort();
        editAbortController = null;
      }
      set({ editing: false, streamingContent: '', lastEditSummary: '' });
    },
  };
});
