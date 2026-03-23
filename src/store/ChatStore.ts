import { create } from "zustand";
import { calculateCostSEK, ChatModel, getDefaultModel } from "../components/ModelSelector";
import { useTopicStore } from "./TopicStore";
import { askLlm, askLlmStream, LlmMessage } from "../services/llmService";
import { Message } from "../database/AthenaDb";
import { athenaDb } from "../database/AthenaDb";
import { useNotificationStore } from "./NotificationStore";

export const SCRATCHPAD_LIMIT = 5000;

interface ChatStore {
  messagesByTopic: Record<string, Message[]>;
  currentTopicId: string | null;
  isInitialLoad: boolean;
  showAllMessages: boolean;
  sending: boolean;
  selectedModel: ChatModel;
  visibleMessageCount: number;
  setSending: (value: boolean) => void;
  fetchMessages: (topicId: string, forkId?: string) => Promise<void>;
  increaseVisibleMessageCount: () => void;
  toggleShowAllMessages: () => void;
  setInitialLoad: (value: boolean) => void;
  addMessage: (message: Message) => Promise<void>;
  addMessages: (messages: Message[]) => Promise<void>;
  updateMessage: (id: string, patch: Partial<Message>) => Promise<void>;
  updateMessages: (updates: { id: string; patch: Partial<Message> }[]) => Promise<void>;
  sendMessageWithoutStream: (content: string, topicId: string, messageId?: string) => Promise<void>;
  sendMessageStream: (content: string, topicId: string, messageId?: string) => Promise<void>;
  sendMessage: (content: string, topicId: string, messageId?: string) => Promise<void>;
  setSelectedModel: (model: ChatModel) => void;
  updateMessageContext: (messageId: string, include: boolean) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  regenerateResponse: (assistantMessageId: string) => Promise<void>;
  temperature: number;
  setTemperature: (temp: number) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messagesByTopic: {},
  currentTopicId: null,
  isInitialLoad: true,
  showAllMessages: false,
  visibleMessageCount: 10,
  sending: false,
  selectedModel: getDefaultModel(),
  temperature: 1.0,

  setTemperature: (temp): void => set({ temperature: temp }),
  setSending: (value): void => set({ sending: value }),

  increaseVisibleMessageCount: (): void => set((state) => ({ visibleMessageCount: state.visibleMessageCount + 10 })),

  toggleShowAllMessages: (): void => set((state) => ({ showAllMessages: !state.showAllMessages })),

  setInitialLoad: (value: boolean): void => set({ isInitialLoad: value }),

  setSelectedModel: (model): void => {
    localStorage.setItem("athena_selected_model", model.id);
    set({ selectedModel: model });
  },

  deleteMessage: async (id): Promise<void> => {
    const { currentTopicId } = get();
    if (!currentTopicId) return;
    await athenaDb.messages.delete(id);
    set((state) => ({
      messagesByTopic: {
        ...state.messagesByTopic,
        [currentTopicId]: state.messagesByTopic[currentTopicId].filter((m) => m.id !== id),
      },
    }));
  },

  fetchMessages: async (topicId: string, forkId?: string): Promise<void> => {
    const topic = useTopicStore.getState().topics.find((t) => t.id === topicId);
    const activeForkId = forkId ?? topic?.activeForkId ?? "main";

    const all = await athenaDb.messages
      .where("topicId")
      .equals(topicId)
      .and((m) => m.forkId === activeForkId)
      .sortBy("created");

    set({
      messagesByTopic: { [topicId]: all },
      currentTopicId: topicId,
      isInitialLoad: true,
    });
  },

  updateMessageContext: async (id, include): Promise<void> => {
    await athenaDb.messages.update(id, { includeInContext: include });

    const { currentTopicId, messagesByTopic } = get();
    if (!currentTopicId) return;

    const updated = messagesByTopic[currentTopicId].map((m) => (m.id === id ? { ...m, includeInContext: include } : m));

    set({ messagesByTopic: { ...messagesByTopic, [currentTopicId]: updated } });
  },

  addMessage: async (message: Message): Promise<void> => {
    const { topicId, id } = message;

    const existing = await athenaDb.messages.get(id);
    if (existing) return;

    await athenaDb.messages.add(message);

    set((state) => {
      const existing = state.messagesByTopic[topicId] as Message[] | undefined;
      const updated = [...(existing ?? []), message];
      return {
        messagesByTopic: {
          ...state.messagesByTopic,
          [topicId]: sortMessages(updated),
        },
      };
    });
  },

  addMessages: async (messages: Message[]): Promise<void> => {
    if (messages.length === 0) return;

    const existingIds = await athenaDb.messages.bulkGet(messages.map((m) => m.id));
    const newMessages = messages.filter((_, i) => !existingIds[i]);

    if (newMessages.length === 0) return;

    await athenaDb.messages.bulkAdd(newMessages);

    set((state) => {
      const topicId = newMessages[0].topicId;
      const existing = state.messagesByTopic[topicId] as Message[] | undefined;
      const merged = [...(existing ?? []), ...newMessages];
      return {
        messagesByTopic: {
          ...state.messagesByTopic,
          [topicId]: sortMessages(merged),
        },
      };
    });
  },

  updateMessage: async (id, patch): Promise<void> => {
    await athenaDb.messages.update(id, patch);

    const { currentTopicId, messagesByTopic } = get();
    if (!currentTopicId) return;

    set({
      messagesByTopic: {
        ...messagesByTopic,
        [currentTopicId]: messagesByTopic[currentTopicId].map((m) => (m.id === id ? { ...m, ...patch } : m)),
      },
    });
  },

  updateMessages: async (updates): Promise<void> => {
    const { currentTopicId, messagesByTopic } = get();
    if (!currentTopicId) return;

    await Promise.all(updates.map(({ id, patch }) => athenaDb.messages.update(id, patch)));

    set({
      messagesByTopic: {
        ...messagesByTopic,
        [currentTopicId]: messagesByTopic[currentTopicId].map((msg) => {
          const update = updates.find((u) => u.id === msg.id);
          return update ? { ...msg, ...update.patch } : msg;
        }),
      },
    });
  },

  sendMessage: async (content, topicId, messageId?): Promise<void> => {
    const { selectedModel } = get();

    return selectedModel.streaming
      ? get().sendMessageStream(content, topicId, messageId)
      : get().sendMessageWithoutStream(content, topicId, messageId);
  },

  sendMessageStream: async (content: string, topicId: string, messageId?: string): Promise<void> => {
    const { selectedModel } = get();
    const topicStoreState = useTopicStore.getState();

    if (!content.trim() || !topicId) return;

    set({ sending: true });

    const now = new Date().toISOString();
    const isRetry = !!messageId;

    let userMessage: Message;

    const topic = topicStoreState.topics.find((t) => t.id === topicId);
    const activeForkId = topic?.activeForkId ?? "main";

    if (isRetry) {
      const existing = await athenaDb.messages.get(messageId);
      if (!existing) throw new Error("Original message not found for retry.");
      userMessage = existing;
      await get().updateMessage(messageId, { failed: false });
    } else {
      userMessage = {
        id: crypto.randomUUID(),
        topicId,
        forkId: activeForkId,
        type: "user",
        content: content.trim(),
        created: now,
        model: undefined,
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      };
      await get().addMessage(userMessage);
    }

    const existingContext = await topicStoreState.getTopicContext(topicId);
    const llmContext: LlmMessage[] = existingContext.map((m) => ({
      role: m.type === "user" ? "user" : m.type === "assistant" ? "assistant" : "system",
      content: m.content,
    }));

    let scratchpadSystemMsg = `You have a private scratchpad for long-term memory (max ${SCRATCHPAD_LIMIT} chars). To append a note to it, include \`<!-- persist: your note here -->\` in your response. To replace the entire scratchpad, use \`<!-- replace: your new content here -->\`. Use the scratchpad to remember key facts, character details, or state during games.`;
    if (topic?.scratchpad) {
      scratchpadSystemMsg += "\n\n[Current Scratchpad Content]:\n" + topic.scratchpad;
    }
    llmContext.unshift({ role: "system", content: scratchpadSystemMsg });

    if (!isRetry) {
      llmContext.push({ role: "user", content: content.trim() });
    }

    const assistantId = crypto.randomUUID();
    const assistantCreated = new Date().toISOString();
    let streamedContent = "";

    const assistantMessage: Message = {
      id: assistantId,
      topicId,
      forkId: activeForkId,
      type: "assistant",
      content: "",
      created: assistantCreated,
      model: selectedModel.id,
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    try {
      // Show typing indicator
      await get().addMessage(assistantMessage);

      const result = await askLlmStream(llmContext, (chunk: string) => {
        streamedContent += chunk;
        const displayContent = streamedContent
          .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
          .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "");
        void get().updateMessage(assistantId, { content: displayContent });
      });

      await get().updateMessage(userMessage.id, {
        promptTokens: result.promptTokens,
        totalCost: calculateCostSEK(selectedModel, result.promptTokens, 0),
        failed: false,
      });

      await get().updateMessage(assistantId, {
        content: result.content,
        completionTokens: result.completionTokens,
        totalCost: calculateCostSEK(selectedModel, 0, result.completionTokens),
        failed: false,
      });

      if (result.aiNote) {
        const currentScratchpad = topicStoreState.topics.find((t) => t.id === topicId)?.scratchpad ?? "";
        let updatedScratchpad = "";
        if (result.aiNoteAction === "replace") {
          updatedScratchpad = result.aiNote;
        } else {
          updatedScratchpad = currentScratchpad ? `${currentScratchpad}\n${result.aiNote}` : result.aiNote;
        }

        if (updatedScratchpad.length > SCRATCHPAD_LIMIT) {
          updatedScratchpad = updatedScratchpad.slice(0, SCRATCHPAD_LIMIT);
        }

        await topicStoreState.updateTopicScratchpad(topicId, updatedScratchpad);
      }

      void topicStoreState.generateTopicName(topicId, content);
    } catch (err) {
      console.error("LLM request failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("LLM request failed", msg);

      await get().updateMessage(userMessage.id, { failed: true });

      await get().updateMessage(assistantId, { isDeleted: true });

      set((state) => ({
        messagesByTopic: {
          ...state.messagesByTopic,
          [topicId]: state.messagesByTopic[topicId].map((m) =>
            m.id === userMessage.id
              ? {
                  ...m,
                  retry: (): Promise<void> =>
                    selectedModel.streaming
                      ? get().sendMessageStream(content, topicId, messageId)
                      : get().sendMessageWithoutStream(content, topicId, messageId),
                }
              : m,
          ),
        },
      }));
    } finally {
      set({ sending: false });
    }
  },

  sendMessageWithoutStream: async (content, topicId, messageId): Promise<void> => {
    const { selectedModel } = get();
    const topicStoreState = useTopicStore.getState();

    if (!content.trim() || !topicId) return;

    set({ sending: true });

    const now = new Date().toISOString();
    const isRetry = !!messageId;

    let userMessage: Message;

    const topic = topicStoreState.topics.find((t) => t.id === topicId);
    const activeForkId = topic?.activeForkId ?? "main";

    if (isRetry) {
      const existing = await athenaDb.messages.get(messageId);
      if (!existing) throw new Error("Original message not found for retry.");
      userMessage = existing;
      await get().updateMessage(messageId, { failed: false });
    } else {
      userMessage = {
        id: crypto.randomUUID(),
        topicId,
        forkId: activeForkId,
        type: "user",
        content: content.trim(),
        created: now,
        model: undefined,
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
      };
      await get().addMessage(userMessage);
    }

    const existingContext = await topicStoreState.getTopicContext(topicId);
    const llmContext: LlmMessage[] = existingContext.map((m) => ({
      role: m.type === "user" ? "user" : m.type === "assistant" ? "assistant" : "system",
      content: m.content,
    }));

    let scratchpadSystemMsg = `You have a private scratchpad for long-term memory (max ${SCRATCHPAD_LIMIT} chars). To append a note to it, include \`<!-- persist: your note here -->\` in your response. To replace the entire scratchpad, use \`<!-- replace: your new content here -->\`. Use the scratchpad to remember key facts, character details, or state during games.`;
    if (topic?.scratchpad) {
      scratchpadSystemMsg += "\n\n[Current Scratchpad Content]:\n" + topic.scratchpad;
    }
    llmContext.unshift({ role: "system", content: scratchpadSystemMsg });

    if (!isRetry) {
      llmContext.push({ role: "user", content: content.trim() });
    }

    const assistantId = crypto.randomUUID();
    const assistantCreated = new Date().toISOString();

    const assistantMessage: Message = {
      id: assistantId,
      topicId,
      forkId: activeForkId,
      type: "assistant",
      content: "",
      created: assistantCreated,
      model: selectedModel.id,
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };

    try {
      await get().addMessage(assistantMessage);

      const result = await askLlm(llmContext);

      await get().updateMessage(userMessage.id, {
        promptTokens: result.promptTokens,
        totalCost: calculateCostSEK(selectedModel, result.promptTokens, 0),
        failed: false,
      });

      await get().updateMessage(assistantId, {
        content: result.content,
        completionTokens: result.completionTokens,
        totalCost: calculateCostSEK(selectedModel, 0, result.completionTokens),
        failed: false,
      });

      if (result.aiNote) {
        const currentScratchpad = topicStoreState.topics.find((t) => t.id === topicId)?.scratchpad ?? "";
        let updatedScratchpad = "";
        if (result.aiNoteAction === "replace") {
          updatedScratchpad = result.aiNote;
        } else {
          updatedScratchpad = currentScratchpad ? `${currentScratchpad}\n${result.aiNote}` : result.aiNote;
        }

        if (updatedScratchpad.length > SCRATCHPAD_LIMIT) {
          updatedScratchpad = updatedScratchpad.slice(0, SCRATCHPAD_LIMIT);
        }

        await topicStoreState.updateTopicScratchpad(topicId, updatedScratchpad);
      }

      void topicStoreState.generateTopicName(topicId, content);
    } catch (err) {
      console.error("LLM request failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("LLM request failed", msg);

      await get().updateMessage(userMessage.id, { failed: true });

      await get().updateMessage(assistantId, { isDeleted: true });

      set((state) => ({
        messagesByTopic: {
          ...state.messagesByTopic,
          [topicId]: state.messagesByTopic[topicId].map((m) =>
            m.id === userMessage.id
              ? {
                  ...m,
                  retry: (): Promise<void> =>
                    selectedModel.streaming
                      ? get().sendMessageStream(content, topicId, messageId)
                      : get().sendMessageWithoutStream(content, topicId, messageId),
                }
              : m,
          ),
        },
      }));
    } finally {
      set({ sending: false });
    }
  },
  regenerateResponse: async (assistantId): Promise<void> => {
    const { messagesByTopic, currentTopicId } = get();
    if (!currentTopicId) return;

    const messages = messagesByTopic[currentTopicId];
    const assistantMsgIndex = messages.findIndex((m) => m.id === assistantId);
    if (assistantMsgIndex === -1) return;

    // Find the user message that was sent before this assistant message
    const userMsg = messages
      .slice(0, assistantMsgIndex)
      .reverse()
      .find((m) => m.type === "user");

    if (!userMsg) return;

    // Delete the existing assistant message
    await get().deleteMessage(assistantId);

    // Call sendMessage with the user message content and ID as retry
    await get().sendMessage(userMsg.content, currentTopicId, userMsg.id);
  },
}));

const sortMessages = function (messages: Message[]): Message[] {
  return messages.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
};
