import { create } from "zustand";
import { useNotificationStore } from "./NotificationStore";
import { v4 as uuidv4 } from "uuid";
import { athenaDb, Message, Topic } from "../database/AthenaDb";
import { useAuthStore } from "./AuthStore";
import { sendOpenAiChat } from "../services/openAi";
import { getDefaultTopicNameModel } from "../components/ModelSelector";

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
  forkTopic: (topicId: string, messageId: string) => Promise<Topic | null>;
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
      const topics = await athenaDb.topics.orderBy("createdOn").reverse().toArray();

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
        id: uuidv4(),
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
    const allMessages = await athenaDb.messages.where("topicId").equals(topicId).toArray();

    const recent = allMessages
      .filter((m) => (m.type === "user" || m.type === "assistant") && !m.isDeleted)
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
      .slice(-10);

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

  forkTopic: async (topicId, messageId): Promise<Topic | null> => {
    try {
      const originalTopic = get().topics.find((t) => t.id === topicId);
      if (!originalTopic) return null;

      const newTopic: Topic = {
        id: uuidv4(),
        name: `${originalTopic.name} (Fork)`,
        createdOn: new Date().toISOString(),
        isDeleted: false,
        updatedOn: new Date().toISOString(),
        scratchpad: originalTopic.scratchpad,
      };

      await athenaDb.topics.add(newTopic);
      get().addTopic(newTopic);

      const allMessages = await athenaDb.messages.where("topicId").equals(topicId).toArray();
      const selectedMessage = allMessages.find((m) => m.id === messageId);
      if (!selectedMessage) return newTopic;

      const messagesToCopy = allMessages
        .filter((m) => new Date(m.created).getTime() <= new Date(selectedMessage.created).getTime() && !m.isDeleted)
        .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

      const newMessages: Message[] = messagesToCopy.map((m) => ({
        ...m,
        id: uuidv4(),
        topicId: newTopic.id,
      }));

      if (newMessages.length > 0) {
        await athenaDb.messages.bulkAdd(newMessages);
      }

      return newTopic;
    } catch (err) {
      console.error("Failed to fork topic", err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("Failed to fork topic", message);
      return null;
    }
  },
}));
