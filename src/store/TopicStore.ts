import { create } from 'zustand';
import { useNotificationStore } from './NotificationStore';
import { encode } from 'gpt-tokenizer';
import { athenaDb, Message, Topic } from '../database/AthenaDb';
import { useAuthStore } from './AuthStore';
import { askLlm } from '../services/llmService';
import { embeddingService, ScoredMessage } from '../services/embeddingService';
import { getDefaultTopicNameModel } from '../components/ModelSelector';
import { SCRATCHPAD_LIMIT } from '../constants';

const RAG_TOP_K = 5;
const RAG_MIN_SCORE = 0.3; // discard weakly-related matches
const RAG_MAX_CHARS = 4000; // hard cap on total RAG block size

interface TopicState {
  topics: Topic[];
  loading: boolean;
  error: string | null;
  visibleTopicCount: number;
  increaseVisibleTopicCount: () => void;
  loadTopics: () => Promise<void>;
  createTopic: () => Promise<Topic | null>;
  renameTopic: (id: string, name: string) => Promise<void>;
  setTopics: (topics: Topic[]) => void;
  updateTopicName: (id: string, name: string) => void;
  addTopic: (topic: Topic) => void;
  generateTopicName(topicId: string, userMessage: string): Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
  getTopicContext(topicId: string, excludeAfterId?: string, userQuery?: string): Promise<Message[]>;
  updateTopicScratchpad: (id: string, scratchpad: string) => Promise<void>;
  forkTopic: (topicId: string, messageId: string) => Promise<void>;
  switchFork: (topicId: string, forkId: string) => Promise<void>;
  deleteFork: (topicId: string, forkId: string) => Promise<void>;
  getTopicTokenCount: (topicId: string) => Promise<number>;
  getTopicTotalCost: (topicId: string) => Promise<number>;
  updateTopicMaxContextMessages: (id: string, maxContextMessages: number) => Promise<void>;
  updateTopicPromptSelection: (id: string, selectedPromptIds: string[]) => Promise<void>;
}

export const useTopicStore = create<TopicState>((set, get) => ({
  topics: [],
  loading: false,
  error: null,
  visibleTopicCount: 10,

  increaseVisibleTopicCount: (): void => set((state) => ({ visibleTopicCount: state.visibleTopicCount + 10 })),

  setTopics: (topics): void => set({ topics }),

  addTopic: (topic): void =>
    set((state) => ({
      topics: [topic, ...state.topics],
    })),

  updateTopicName: (id, name): void =>
    set((state) => ({
      topics: state.topics.map((t) => (t.id === id ? { ...t, name } : t)),
    })),

  loadTopics: async (): Promise<void> => {
    set({ loading: true, error: null });

    try {
      const topics = await athenaDb.topics.orderBy('updatedOn').reverse().toArray();

      set({ topics });
    } catch (err) {
      console.error('Failed to load topics from DB', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to load topics', message);
      set({ error: 'Failed to load topics' });
    } finally {
      set({ loading: false });
    }
  },

  createTopic: async (): Promise<Topic | null> => {
    try {
      const newTopic: Topic = {
        id: crypto.randomUUID(),
        name: 'New Topic',
        createdOn: new Date().toISOString(),
        isDeleted: false,
        updatedOn: new Date().toISOString(),
      };

      await athenaDb.topics.add(newTopic);
      get().addTopic(newTopic);

      return newTopic;
    } catch (err) {
      console.error('Failed to create topic', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to create topic', message);
      return null;
    }
  },

  renameTopic: async (id, name): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { name });
      get().updateTopicName(id, name);
    } catch (err) {
      console.error('Failed to rename topic', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to rename topic', message);
    }
  },

  updateTopicScratchpad: async (id, scratchpad): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { scratchpad });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === id ? { ...t, scratchpad } : t)),
      }));
    } catch (err) {
      console.error('Failed to update topic scratchpad', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to update scratchpad', message);
    }
  },

  async getTopicContext(topicId: string, excludeAfterId?: string, userQuery?: string): Promise<Message[]> {
    const topic = get().topics.find((t) => t.id === topicId);
    if (!topic) return [];

    const activeForkId = topic.activeForkId ?? 'main';

    const allMessages = await athenaDb.messages
      .where('topicId')
      .equals(topicId)
      .and((m) => m.forkId === activeForkId)
      .toArray();

    // Sort all messages once to ensure order
    const sorted = allMessages.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    // Pre-index assistant messages by parentId for fallback logic
    const assistantByParent = new Map<string, Message[]>();
    for (const m of sorted) {
      if (m.type === 'assistant' && m.parentMessageId) {
        const existing = assistantByParent.get(m.parentMessageId) ?? [];
        existing.push(m);
        assistantByParent.set(m.parentMessageId, existing);
      }
    }

    // Filter for active sequence: User messages and their active assistant responses
    const activeSequence: Message[] = [];
    const userMessageMap = new Map<string, Message>();

    for (const m of sorted) {
      if (m.isDeleted) continue;
      if (excludeAfterId && m.id === excludeAfterId) break;

      if (m.type === 'user') {
        userMessageMap.set(m.id, m);
        activeSequence.push(m);
      } else if (m.type === 'assistant') {
        if (m.parentMessageId) {
          const parent = userMessageMap.get(m.parentMessageId);
          if (parent) {
            const versions = assistantByParent.get(m.parentMessageId) ?? [];
            // Use activeResponseId if set, otherwise fallback to the latest version in the sequence
            const activeId = parent.activeResponseId ?? (versions.length > 0 ? versions[versions.length - 1].id : null);
            if (activeId === m.id) {
              activeSequence.push(m);
            }
          }
        } else {
          // Legacy or standalone assistant message
          activeSequence.push(m);
        }
      } else {
        // aiNote, system, etc.
        activeSequence.push(m);
      }
    }

    const recent = activeSequence.filter((m) => m.type === 'user' || m.type === 'assistant').slice(-(topic.maxContextMessages ?? 6));

    // Ensure only active versions are included even if pinned (user request: only active messages)
    const pinned = activeSequence.filter((m) => m.includeInContext);
    const aiNotes = activeSequence.filter((m) => m.type === 'aiNote');

    const combined = [...pinned, ...recent, ...aiNotes];
    const unique = Array.from(new Map(combined.map((m) => [m.id, m])).values());
    const base = unique.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    // RAG: inject semantically similar messages from outside the current window
    const ragEnabled = useAuthStore.getState().ragEnabled;
    if (ragEnabled && userQuery && embeddingService.isReady) {
      const includedIds = new Set(base.map((m) => m.id));
      const candidates = activeSequence.filter(
        (m) => !includedIds.has(m.id) && (m.type === 'user' || m.type === 'assistant') && m.embedding && m.embedding.length > 0,
      );

      try {
        const scoredResults: ScoredMessage[] = await embeddingService.searchSimilarMessages(userQuery, candidates, RAG_TOP_K);
        // Apply minimum similarity threshold — drop weakly-related matches
        const relevant: ScoredMessage[] = scoredResults.filter((s) => s.score >= RAG_MIN_SCORE);
        if (relevant.length > 0) {
          // For each retrieved user message, also pull in its active assistant response
          // so the LLM sees the full exchange, not just the question
          const allCandidatesById = new Map(activeSequence.map((m) => [m.id, m]));
          // Build pairs: keep score of the triggering message so we can budget-cut by relevance
          const pairs: { messages: Message[]; score: number }[] = [];
          const seenIds = new Set<string>();
          for (const { message: m, score } of relevant) {
            if (seenIds.has(m.id)) continue;
            const pair: Message[] = [m];
            seenIds.add(m.id);
            if (m.type === 'user') {
              const assistantVersions = assistantByParent.get(m.id) ?? [];
              const activeId = m.activeResponseId ?? (assistantVersions.length > 0 ? assistantVersions[assistantVersions.length - 1].id : null);
              if (activeId && !includedIds.has(activeId)) {
                const reply = allCandidatesById.get(activeId);
                if (reply) {
                  pair.push(reply);
                  seenIds.add(reply.id);
                }
              }
            }
            pairs.push({ messages: pair, score });
          }

          // Apply character budget: include pairs highest-score-first until budget exhausted
          const budgetedMessages: Message[] = [];
          let usedChars = 0;
          for (const { messages } of pairs) {
            const pairChars = messages.reduce((sum, m) => sum + m.content.length, 0);
            if (usedChars + pairChars > RAG_MAX_CHARS) break;
            budgetedMessages.push(...messages);
            usedChars += pairChars;
          }

          if (budgetedMessages.length > 0) {
            // Sort chronologically for readable context
            const sorted = budgetedMessages.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
            const ragContent = sorted.map((m) => `[${m.type === 'user' ? 'User' : 'Assistant'}]: ${m.content}`).join('\n\n');
            const ragMessage: Message = {
              id: '__rag_context__',
              topicId,
              type: 'system',
              content: `Relevant context retrieved from earlier in this conversation:\n\n${ragContent}`,
              isDeleted: false,
              includeInContext: false,
              created: new Date(0).toISOString(),
              failed: false,
              promptTokens: 0,
              completionTokens: 0,
              totalCost: 0,
            };
            return [ragMessage, ...base];
          }
        }
      } catch (err) {
        console.warn('RAG retrieval failed, falling back to base context:', err);
      }
    }

    return base;
  },

  generateTopicName: async (topicId: string, userMessage: string): Promise<void> => {
    const { topics, renameTopic } = get();
    const topic = topics.find((t) => t.id === topicId);
    if (!topic || topic.name !== 'New Topic') return;

    const { openAiKey, deepSeekKey, googleApiKey, moonshotApiKey } = useAuthStore.getState();
    const hasAnyKey = !!(openAiKey || deepSeekKey || googleApiKey || moonshotApiKey);

    if (!hasAnyKey) {
      const fallback = userMessage.trim().split(/\s+/).slice(0, 6).join(' ');
      const name = fallback.length > 40 ? fallback.slice(0, 37) + '...' : fallback;
      if (name) {
        await renameTopic(topicId, name);
      }
      return;
    }

    try {
      const model = getDefaultTopicNameModel();
      const result = await askLlm(model, 1.0, [
        {
          role: 'system',
          content: 'Reply with a short and descriptive title for the message. No explanation. Just the title. Max 5 words.',
        },
        {
          role: 'user',
          content: `Suggest a short title for this message:\n\n"${userMessage}"`,
        },
      ]);

      const name = result.content.trim().replace(/^"|"$/g, '');
      if (name) {
        await renameTopic(topicId, name);
      }
    } catch (err) {
      console.error('Failed to generate topic name', err);
      // Fallback if LLM fail
      const fallback = userMessage.trim().split(/\s+/).slice(0, 6).join(' ');
      const name = fallback.length > 40 ? fallback.slice(0, 37) + '...' : fallback;
      if (name) {
        await renameTopic(topicId, name);
      }
    }
  },

  deleteTopic: async (id): Promise<void> => {
    try {
      await athenaDb.topics.delete(id);
      set((state) => ({
        topics: state.topics.filter((t) => t.id !== id),
      }));
    } catch (err) {
      console.error('Failed to delete topic', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to delete topic', message);
    }
  },

  switchFork: async (topicId, forkId): Promise<void> => {
    try {
      await athenaDb.topics.update(topicId, { activeForkId: forkId });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? { ...t, activeForkId: forkId } : t)),
      }));
    } catch (err) {
      console.error('Failed to switch fork', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to switch tab', message);
    }
  },

  forkTopic: async (topicId: string, messageId: string): Promise<void> => {
    try {
      const originalTopic = get().topics.find((t) => t.id === topicId);
      if (!originalTopic) return;

      const currentForkId = originalTopic.activeForkId ?? 'main';
      const newForkId = crypto.randomUUID();
      const existingForks = originalTopic.forks ?? [];

      // If this topic has never been forked, bootstrap the implicit "main" fork
      // so the ForkTabs component (which requires length > 1) will render.
      const baseForks = existingForks.length === 0 ? [{ id: 'main', name: 'Main', createdOn: originalTopic.createdOn }] : existingForks;

      const newForkName = `Fork ${baseForks.length}`;

      const newFork = {
        id: newForkId,
        name: newForkName,
        createdOn: new Date().toISOString(),
      };

      const updatedForks = [...baseForks, newFork];

      // 1. Query and prepare messages BEFORE touching state, so the reactive
      //    fetchMessages in ChatView always finds the copied messages in the DB.
      const allMessages = await athenaDb.messages
        .where('topicId')
        .equals(topicId)
        .and((m) => m.forkId === currentForkId)
        .toArray();

      const selectedMessage = allMessages.find((m) => m.id === messageId);
      if (!selectedMessage) return;

      const messagesToCopy = allMessages
        .filter((m) => new Date(m.created).getTime() <= new Date(selectedMessage.created).getTime() && !m.isDeleted)
        .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

      // Create ID mapping for internal references (parentMessageId, activeResponseId)
      const idMap: Record<string, string> = {};
      messagesToCopy.forEach((m) => {
        idMap[m.id] = crypto.randomUUID();
      });

      const newMessages: Message[] = messagesToCopy.map((m) => ({
        ...m,
        id: idMap[m.id],
        forkId: newForkId,
        parentMessageId: m.parentMessageId ? idMap[m.parentMessageId] : undefined,
        activeResponseId: m.activeResponseId ? idMap[m.activeResponseId] : undefined,
      }));

      // 2. Write messages + topic update atomically, THEN update React state.
      //    This prevents the reactive fetchMessages (triggered by activeForkId
      //    changing in state) from running before the messages are in the DB.
      await athenaDb.transaction('rw', [athenaDb.topics, athenaDb.messages], async () => {
        if (newMessages.length > 0) {
          await athenaDb.messages.bulkAdd(newMessages);
        }
        await athenaDb.topics.update(topicId, {
          forks: updatedForks,
          activeForkId: newForkId,
          updatedOn: new Date().toISOString(),
        });
      });

      // 3. Update Zustand state — this triggers ChatView's useEffect which now
      //    safely calls fetchMessages with data already present in the DB.
      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? { ...t, forks: updatedForks, activeForkId: newForkId } : t)),
      }));
    } catch (err) {
      console.error('Failed to fork topic', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to fork topic', message);
    }
  },

  deleteFork: async (topicId: string, forkId: string): Promise<void> => {
    try {
      const topic = get().topics.find((t) => t.id === topicId);
      if (!topic?.forks) return;

      const updatedForks = topic.forks.filter((f) => f.id !== forkId);
      if (updatedForks.length === 0) return; // Don't delete the last fork

      let newActiveForkId = topic.activeForkId;
      if (topic.activeForkId === forkId) {
        newActiveForkId = updatedForks[0].id;
      }

      await athenaDb.topics.update(topicId, {
        forks: updatedForks,
        activeForkId: newActiveForkId,
        updatedOn: new Date().toISOString(),
      });

      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? { ...t, forks: updatedForks, activeForkId: newActiveForkId } : t)),
      }));

      // Delete messages unique to this fork
      await athenaDb.messages
        .where('topicId')
        .equals(topicId)
        .and((m) => m.forkId === forkId)
        .delete();
    } catch (err) {
      console.error('Failed to delete fork', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to delete branch', message);
    }
  },
  getTopicTokenCount: async (topicId: string): Promise<number> => {
    const topic = get().topics.find((t) => t.id === topicId);
    const contextMessages = await get().getTopicContext(topicId);
    const auth = useAuthStore.getState();
    const customInstructions = auth.customInstructions.trim();

    let totalTokens = 0;

    // 1. Custom Instructions
    if (customInstructions) {
      totalTokens += encode(`system: ${customInstructions}`).length;
    }

    // 2. Selected Predefined Prompts
    const selectedPromptIds = topic?.selectedPromptIds ?? [];
    if (selectedPromptIds.length > 0) {
      const allPrompts = auth.predefinedPrompts;
      const selectedPrompts = allPrompts.filter((p) => selectedPromptIds.includes(p.id));
      for (const p of selectedPrompts) {
        totalTokens += encode(`system: ${p.content}`).length;
      }
    }

    // 3. Scratchpad Rules & Content (matches logic in ChatStore.ts)
    const rawScratchpadRules = auth.scratchpadRules.replace('{{SCRATCHPAD_LIMIT}}', String(SCRATCHPAD_LIMIT));
    // Note: We skip the model-specific "without tools" instruction here for simplicity in estimation
    totalTokens += encode(`system: ${rawScratchpadRules}`).length;
    totalTokens += encode(`system: ${topic?.scratchpad ?? '(Empty)'}`).length;

    // 4. Context Messages
    for (const msg of contextMessages) {
      if (msg.promptTokens || msg.completionTokens) {
        totalTokens += (msg.promptTokens || 0) + (msg.completionTokens || 0);
      } else {
        totalTokens += encode(`${msg.type}: ${msg.content}`).length;
      }
    }

    return totalTokens;
  },
  getTopicTotalCost: async (topicId: string): Promise<number> => {
    const allMessages = await athenaDb.messages.where('topicId').equals(topicId).toArray();
    return allMessages.reduce((sum, msg) => sum + (msg.totalCost || 0), 0);
  },
  updateTopicMaxContextMessages: async (id, maxContextMessages): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { maxContextMessages });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === id ? { ...t, maxContextMessages } : t)),
      }));
    } catch (err) {
      console.error('Failed to update topic max context messages', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to update context limit', message);
    }
  },
  updateTopicPromptSelection: async (id, selectedPromptIds): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { selectedPromptIds });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === id ? { ...t, selectedPromptIds } : t)),
      }));
    } catch (err) {
      console.error('Failed to update topic prompt selection', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to update selection', message);
    }
  },
}));
