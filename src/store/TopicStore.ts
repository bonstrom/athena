import { create } from "zustand";
import { useNotificationStore } from "./NotificationStore";
import { encode } from "gpt-tokenizer";
import { athenaDb, Message, Topic } from "../database/AthenaDb";
import { useAuthStore } from "./AuthStore";
import { sendOpenAiChat } from "../services/openAi";
import { getDefaultTopicNameModel } from "../components/ModelSelector";
import { SCRATCHPAD_LIMIT } from "../constants";

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
  getTopicContext(topicId: string): Promise<Message[]>;
  updateTopicScratchpad: (id: string, scratchpad: string) => Promise<void>;
  forkTopic: (topicId: string, messageId: string) => Promise<void>;
  switchFork: (topicId: string, forkId: string) => Promise<void>;
  deleteFork: (topicId: string, forkId: string) => Promise<void>;
  getTopicTokenCount: (topicId: string) => Promise<number>;
  getTopicTotalCost: (topicId: string) => Promise<number>;
  updateTopicMaxContextMessages: (id: string, maxContextMessages: number) => Promise<void>;
  updateTopicChaining: (id: string, isChaining: boolean, secondModelId: string) => Promise<void>;
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
      const topics = await athenaDb.topics.orderBy("updatedOn").reverse().toArray();

      set({ topics });
    } catch (err) {
      console.error("Failed to load topics from DB", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to load topics", message);
      set({ error: "Failed to load topics" });
    } finally {
      set({ loading: false });
    }
  },

  createTopic: async (): Promise<Topic | null> => {
    try {
      const newTopic: Topic = {
        id: crypto.randomUUID(),
        name: "New Topic",
        createdOn: new Date().toISOString(),
        isDeleted: false,
        updatedOn: new Date().toISOString(),
      };

      await athenaDb.topics.add(newTopic);
      get().addTopic(newTopic);

      return newTopic;
    } catch (err) {
      console.error("Failed to create topic", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to create topic", message);
      return null;
    }
  },

  renameTopic: async (id, name): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { name });
      get().updateTopicName(id, name);
    } catch (err) {
      console.error("Failed to rename topic", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to rename topic", message);
    }
  },

  updateTopicScratchpad: async (id, scratchpad): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { scratchpad });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === id ? { ...t, scratchpad } : t)),
      }));
    } catch (err) {
      console.error("Failed to update topic scratchpad", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to update scratchpad", message);
    }
  },

  async getTopicContext(topicId: string): Promise<Message[]> {
    const topic = get().topics.find((t) => t.id === topicId);
    if (!topic) return [];

    const activeForkId = topic.activeForkId ?? "main";

    const allMessages = await athenaDb.messages
      .where("topicId")
      .equals(topicId)
      .and((m) => m.forkId === activeForkId)
      .toArray();

    // Sort all messages once to ensure order
    const sorted = allMessages.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    // Filter for active sequence: User messages and their active assistant responses
    const activeSequence: Message[] = [];
    const userMessageMap = new Map<string, Message>();

    for (const m of sorted) {
      if (m.isDeleted) continue;

      if (m.type === "user") {
        userMessageMap.set(m.id, m);
        activeSequence.push(m);
      } else if (m.type === "assistant") {
        if (m.parentMessageId) {
          const parent = userMessageMap.get(m.parentMessageId);
          // Only include if it's the active response for its parent
          if (parent && parent.activeResponseId === m.id) {
            activeSequence.push(m);
          }
        } else {
          // Legacy or standalone assistant message
          activeSequence.push(m);
        }
      }
    }

    const recent = activeSequence
      .filter((m) => m.type === "user" || m.type === "assistant")
      .slice(-(topic.maxContextMessages ?? 10));

    const pinned = allMessages.filter((m) => m.includeInContext);
    const aiNotes = allMessages.filter((m) => m.type === "aiNote");

    const combined = [...pinned, ...recent, ...aiNotes];
    const unique = Array.from(new Map(combined.map((m) => [m.id, m])).values());

    return unique.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  },

  generateTopicName: async (topicId: string, userMessage: string): Promise<void> => {
    const { topics, renameTopic } = get();
    const topic = topics.find((t) => t.id === topicId);
    const { openAiKey } = useAuthStore.getState();

    if (!topic || topic.name !== "New Topic") return;
    if (!openAiKey) {
      useNotificationStore.getState().addNotification("Missing OpenAI key", "Cannot generate topic name");
      return;
    }

    try {
      const result = await sendOpenAiChat(
        [
          {
            role: "system",
            content: "Reply with a short and descriptive title for the message. No explanation. Just the title.",
          },
          {
            role: "user",
            content: `Suggest a short title for this message:\n\n"${userMessage}"`,
          },
        ],
        getDefaultTopicNameModel().id,
        openAiKey,
      );

      const name = result.content.trim();
      if (name) {
        await renameTopic(topicId, name);
      }
    } catch (err) {
      console.error("Failed to generate topic name", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to generate topic name", message);
    }
  },

  deleteTopic: async (id): Promise<void> => {
    try {
      await athenaDb.topics.delete(id);
      set((state) => ({
        topics: state.topics.filter((t) => t.id !== id),
      }));
    } catch (err) {
      console.error("Failed to delete topic", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to delete topic", message);
    }
  },

  switchFork: async (topicId, forkId): Promise<void> => {
    try {
      await athenaDb.topics.update(topicId, { activeForkId: forkId });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? { ...t, activeForkId: forkId } : t)),
      }));
    } catch (err) {
      console.error("Failed to switch fork", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to switch tab", message);
    }
  },

  forkTopic: async (topicId: string, messageId: string): Promise<void> => {
    try {
      const originalTopic = get().topics.find((t) => t.id === topicId);
      if (!originalTopic) return;

      const currentForkId = originalTopic.activeForkId ?? "main";
      const newForkId = crypto.randomUUID();
      const newForkName = `Fork ${originalTopic.forks?.length ?? 1}`;

      const newFork = {
        id: newForkId,
        name: newForkName,
        createdOn: new Date().toISOString(),
      };

      const updatedForks = [...(originalTopic.forks ?? []), newFork];

      await athenaDb.topics.update(topicId, {
        forks: updatedForks,
        activeForkId: newForkId,
        updatedOn: new Date().toISOString(),
      });

      set((state) => ({
        topics: state.topics.map((t) =>
          t.id === topicId ? { ...t, forks: updatedForks, activeForkId: newForkId } : t,
        ),
      }));

      const allMessages = await athenaDb.messages
        .where("topicId")
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

      if (newMessages.length > 0) {
        await athenaDb.messages.bulkAdd(newMessages);
      }
    } catch (err) {
      console.error("Failed to fork topic", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to fork topic", message);
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
        topics: state.topics.map((t) =>
          t.id === topicId ? { ...t, forks: updatedForks, activeForkId: newActiveForkId } : t,
        ),
      }));

      // Delete messages unique to this fork
      await athenaDb.messages
        .where("topicId")
        .equals(topicId)
        .and((m) => m.forkId === forkId)
        .delete();
    } catch (err) {
      console.error("Failed to delete fork", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to delete branch", message);
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

    // 2. Scratchpad System Message
    let scratchpadSystemMsg = `You have a private scratchpad for long-term memory (max ${SCRATCHPAD_LIMIT} chars). To append a note to it, include \`<!-- persist: your note here -->\` in your response. To replace the entire scratchpad, use \`<!-- replace: your new content here -->\`. Use the scratchpad to remember key facts, character details, or state during games.`;
    if (topic?.scratchpad) {
      scratchpadSystemMsg += "\n\n[Current Scratchpad Content]:\n" + topic.scratchpad;
    }
    totalTokens += encode(`system: ${scratchpadSystemMsg}`).length;

    // 3. Context Messages
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
    const allMessages = await athenaDb.messages.where("topicId").equals(topicId).toArray();
    return allMessages.reduce((sum, msg) => sum + (msg.totalCost || 0), 0);
  },
  updateTopicMaxContextMessages: async (id, maxContextMessages): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { maxContextMessages });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === id ? { ...t, maxContextMessages } : t)),
      }));
    } catch (err) {
      console.error("Failed to update topic max context messages", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to update context limit", message);
    }
  },
  updateTopicChaining: async (id, isChaining, secondModelId): Promise<void> => {
    try {
      await athenaDb.topics.update(id, { isChaining, secondModelId });
      set((state) => ({
        topics: state.topics.map((t) => (t.id === id ? { ...t, isChaining, secondModelId } : t)),
      }));
    } catch (err) {
      console.error("Failed to update topic chaining settings", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to update chaining settings", message);
    }
  },
}));
