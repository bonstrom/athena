import { create } from "zustand";
import { calculateCostSEK, ChatModel, getDefaultModel } from "../components/ModelSelector";
import { useTopicStore } from "./TopicStore";
import { orchestrateLlmLoop, LlmMessage } from "../services/llmService";
import { Message } from "../database/AthenaDb";
import { athenaDb } from "../database/AthenaDb";
import { useNotificationStore } from "./NotificationStore";

import { SCRATCHPAD_LIMIT } from "../constants";

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
  resetVisibleMessageCount: () => void;
  setInitialLoad: (value: boolean) => void;
  addMessage: (message: Message) => Promise<void>;
  addMessages: (messages: Message[]) => Promise<void>;
  updateMessage: (id: string, patch: Partial<Message>) => Promise<void>;
  updateMessages: (updates: { id: string; patch: Partial<Message> }[]) => Promise<void>;
  updateMessageStateOnly: (id: string, patch: Partial<Message>) => void;
  sendMessageStream: (content: string, topicId: string, messageId?: string) => Promise<void>;
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

  resetVisibleMessageCount: (): void => set({ visibleMessageCount: 10 }),

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

    set((state) => ({
      messagesByTopic: { ...state.messagesByTopic, [topicId]: all },
      currentTopicId: topicId,
      isInitialLoad: true,
      visibleMessageCount: 10,
    }));
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

  updateMessageStateOnly: (id, patch): void => {
    const { currentTopicId, messagesByTopic } = get();
    if (!currentTopicId) return;

    set({
      messagesByTopic: {
        ...messagesByTopic,
        [currentTopicId]: messagesByTopic[currentTopicId].map((m) => (m.id === id ? { ...m, ...patch } : m)),
      },
    });
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

    // 1. Handle User Message
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

    // 2. Build Context
    const existingContext = await topicStoreState.getTopicContext(topicId);
    const llmContext: LlmMessage[] = existingContext.map((m) => ({
      role: m.type === "user" ? "user" : m.type === "assistant" ? "assistant" : "system",
      content: m.content,
    }));

    const systems: LlmMessage[] = [];
    const scratchpadRules = `You have a private scratchpad for long-term memory (max ${SCRATCHPAD_LIMIT} chars). 

**Rules for the Scratchpad:**
* **What to store:** Only persistent, long-term facts (user preferences, ongoing goals, core character details, or established rules). 
* **What NOT to store:** Transient conversation history, short-term tasks that were just completed, or immediate context (I already remember recent messages).
* **Managing space:** If the scratchpad is getting full or contains outdated facts (e.g., a goal was completed, or a preference changed), use the \`replace\` action to rewrite the entire scratchpad, keeping only the currently relevant facts and discarding the dead ones.

[Current Scratchpad Content]:
${topic?.scratchpad ?? "(Empty)"}`;

    if (selectedModel.supportsTools) {
      systems.push({ role: "system", content: scratchpadRules });
    } else {
      systems.push({
        role: "system",
        content: `${scratchpadRules}\n\nTo update the scratchpad without tools, include \`<!-- persist: your note here -->\` to append or \`<!-- replace: your new content here -->\` to overwrite.`,
      });
    }

    llmContext.unshift(...systems);

    // 3. Prepare Assistant Message
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      topicId,
      forkId: activeForkId,
      type: "assistant",
      content: "",
      created: new Date().toISOString(),
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

      const loopStartTime = Date.now();
      let streamedContent = "";
      let lastRenderTime = 0;
      const RENDER_THROTTLE_MS = 64; // ~15fps for smooth but efficient UI

      // Conditionally create the stream callback
      const onTokenCallback = selectedModel.streaming
        ? (chunk: string): void => {
            streamedContent += chunk;
            const now = Date.now();
            if (now - lastRenderTime > RENDER_THROTTLE_MS) {
              const displayContent = streamedContent
                .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
                .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "");
              get().updateMessageStateOnly(assistantId, { content: displayContent });
              lastRenderTime = now;
            }
          }
        : undefined;

      // 4. Call the Orchestrator
      const { finalContent, totalPromptTokens, totalCompletionTokens, lastResult } = await orchestrateLlmLoop(
        selectedModel,
        get().temperature,
        llmContext,
        onTokenCallback, // Will be undefined if not streaming
        async (aiNote, action) => {
          const currentScratchpad = topicStoreState.topics.find((t) => t.id === topicId)?.scratchpad ?? "";
          let updatedScratchpad = "";
          if (action === "replace") {
            updatedScratchpad = aiNote;
          } else {
            updatedScratchpad = currentScratchpad ? `${currentScratchpad}\n${aiNote}` : aiNote;
          }
          if (updatedScratchpad.length > SCRATCHPAD_LIMIT) {
            updatedScratchpad = updatedScratchpad.slice(0, SCRATCHPAD_LIMIT);
          }
          await topicStoreState.updateTopicScratchpad(topicId, updatedScratchpad);
        },
      );

      const latencyMs = Date.now() - loopStartTime;

      // 5. Finalize DB Updates in batch
      await get().updateMessages([
        {
          id: userMessage.id,
          patch: {
            promptTokens: totalPromptTokens,
            totalCost: calculateCostSEK(selectedModel, totalPromptTokens, 0, lastResult.promptTokensDetails),
            failed: false,
          },
        },
        {
          id: assistantId,
          patch: {
            content: finalContent
              .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
              .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "")
              .trim(),
            completionTokens: totalCompletionTokens,
            totalCost: calculateCostSEK(selectedModel, 0, totalCompletionTokens),
            failed: false,
            latencyMs,
            reasoning: lastResult.reasoning,
          },
        },
      ]);

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
                  // The retry logic is now much cleaner too!
                  retry: (): Promise<void> => get().sendMessageStream(content, topicId, userMessage.id),
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

    // Call sendMessageStream with the user message content and ID as retry
    await get().sendMessageStream(userMsg.content, currentTopicId, userMsg.id);
  },
}));

const sortMessages = function (messages: Message[]): Message[] {
  return messages.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
};
