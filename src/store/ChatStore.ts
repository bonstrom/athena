import { create } from "zustand";
import { calculateCostSEK, ChatModel, getDefaultModel, chatModels } from "../components/ModelSelector";
import { useTopicStore } from "./TopicStore";
import { orchestrateLlmLoop, LlmMessage } from "../services/llmService";
import { Message } from "../database/AthenaDb";
import { athenaDb } from "../database/AthenaDb";
import { useNotificationStore } from "./NotificationStore";
import { BackupService } from "../services/backupService";

import { SCRATCHPAD_LIMIT } from "../constants";

interface ChatStore {
  messagesByTopic: Record<string, Message[] | undefined>;
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
  isChaining: boolean;
  setIsChaining: (value: boolean) => void;
  secondModel: ChatModel;
  setSecondModel: (model: ChatModel) => void;
  updateMessageContext: (messageId: string, include: boolean) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  regenerateResponse: (assistantMessageId: string) => Promise<void>;
  switchMessageVersion: (userMessageId: string, assistantMessageId: string) => Promise<void>;
  temperature: number;
  setTemperature: (temp: number) => void;
  abortController: AbortController | null;
  currentRequestMessageIds: { userMessageId: string; assistantMessageId: string } | null;
  stopSending: () => Promise<string | null>;
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
  abortController: null,
  currentRequestMessageIds: null,

  setTemperature: (temp): void => set({ temperature: temp }),
  setSending: (value): void => set({ sending: value }),

  increaseVisibleMessageCount: (): void => set((state) => ({ visibleMessageCount: state.visibleMessageCount + 10 })),

  toggleShowAllMessages: (): void => set((state) => ({ showAllMessages: !state.showAllMessages })),

  resetVisibleMessageCount: (): void => set({ visibleMessageCount: 10 }),

  setInitialLoad: (value: boolean): void => set({ isInitialLoad: value }),

  setSelectedModel: (model: ChatModel): void => {
    localStorage.setItem("athena_selected_model", model.id);
    set({ selectedModel: model });
  },

  isChaining: false,
  setIsChaining: (value: boolean): void => {
    const { currentTopicId, secondModel } = get();
    set({ isChaining: value });
    if (currentTopicId) {
      void useTopicStore.getState().updateTopicChaining(currentTopicId, value, secondModel.id);
    }
  },

  secondModel: chatModels.find((m) => m.id.includes("mini") || m.id.includes("flash")) ?? chatModels[0],
  setSecondModel: (model: ChatModel): void => {
    const { currentTopicId, isChaining } = get();
    set({ secondModel: model });
    if (currentTopicId) {
      void useTopicStore.getState().updateTopicChaining(currentTopicId, isChaining, model.id);
    }
  },

  deleteMessage: async (id): Promise<void> => {
    const { currentTopicId } = get();
    if (!currentTopicId) return;
    await athenaDb.messages.delete(id);
    set((state) => ({
      messagesByTopic: {
        ...state.messagesByTopic,
        [currentTopicId]: (state.messagesByTopic[currentTopicId] ?? []).filter((m) => m.id !== id),
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
      isChaining: topic?.isChaining ?? false,
      secondModel: chatModels.find((m) => m.id === topic?.secondModelId) ?? state.secondModel,
    }));
  },

  updateMessageContext: async (id, include): Promise<void> => {
    await athenaDb.messages.update(id, { includeInContext: include });

    const { currentTopicId, messagesByTopic } = get();
    if (!currentTopicId) return;

    const updated = (messagesByTopic[currentTopicId] ?? []).map((m) =>
      m.id === id ? { ...m, includeInContext: include } : m,
    );

    set({ messagesByTopic: { ...messagesByTopic, [currentTopicId]: updated } });
  },

  addMessage: async (message: Message): Promise<void> => {
    const { topicId, id } = message;

    const existing = await athenaDb.messages.get(id);
    if (existing) return;

    await athenaDb.messages.add(message);

    set((state) => {
      const existing = state.messagesByTopic[topicId];
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
      const existing = state.messagesByTopic[topicId];
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
        [currentTopicId]: (messagesByTopic[currentTopicId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
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
        [currentTopicId]: (messagesByTopic[currentTopicId] ?? []).map((msg) => {
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
        [currentTopicId]: (messagesByTopic[currentTopicId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
      },
    });
  },

  sendMessageStream: async (content: string, topicId: string, messageId?: string): Promise<void> => {
    // Trigger auto-backup on user gesture to ensure permissions are refreshed
    void BackupService.performAutoBackup(true);

    const { selectedModel } = get();
    const topicStoreState = useTopicStore.getState();

    if (!content.trim() || !topicId) return;
    const controller = new AbortController();
    set({ sending: true, abortController: controller });

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
    }

    // 2. Build Context
    const existingContext = await topicStoreState.getTopicContext(topicId);

    const llmContext: LlmMessage[] = existingContext.map((m) => ({
      role: m.type === "user" ? "user" : m.type === "assistant" ? "assistant" : "system",
      content: m.content,
      reasoning_content: m.reasoning,
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

    // Add current user message to context before calling loop
    llmContext.push({ role: "user", content: userMessage.content });

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
      parentMessageId: userMessage.id,
    };

    try {
      // Create initial DB state in a single transaction
      await athenaDb.transaction("rw", athenaDb.messages, async () => {
        if (isRetry) {
          await athenaDb.messages.update(userMessage.id, { failed: false });
        } else {
          await athenaDb.messages.add(userMessage);
        }
        await athenaDb.messages.add(assistantMessage);
        await athenaDb.messages.update(userMessage.id, { activeResponseId: assistantId });
      });

      // Update state once for both messages
      set((state) => {
        const existingMessages = state.messagesByTopic[topicId] ?? [];
        let updated = [...existingMessages];

        if (isRetry) {
          updated = updated.map((m) =>
            m.id === userMessage.id ? { ...m, failed: false, activeResponseId: assistantId } : m,
          );
        } else {
          updated.push(userMessage);
        }
        updated.push(assistantMessage);

        return {
          messagesByTopic: {
            ...state.messagesByTopic,
            [topicId]: sortMessages(updated),
          },
          currentRequestMessageIds: { userMessageId: userMessage.id, assistantMessageId: assistantId },
        };
      });

      const loopStartTime = Date.now();
      let streamedContent = "";
      let lastRenderTime = 0;
      const RENDER_THROTTLE_MS = 64; // ~15fps for smooth but efficient UI

      let streamedReasoning = "";
      const onTokenCallback = (chunk: string): void => {
        streamedContent += chunk;
        const now = Date.now();
        if (now - lastRenderTime > RENDER_THROTTLE_MS) {
          const displayContent = streamedContent
            .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
            .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "");
          get().updateMessageStateOnly(assistantId, { content: displayContent });
          lastRenderTime = now;
        }
      };

      const onReasoningCallback = (token: string): void => {
        streamedReasoning += token;
        const now = Date.now();
        if (now - lastRenderTime > RENDER_THROTTLE_MS) {
          get().updateMessageStateOnly(assistantId, { reasoning: streamedReasoning.trim() });
          lastRenderTime = now;
        }
      };

      // 4. Call the Orchestrator for the Primary Model
      const primaryResult = await orchestrateLlmLoop(
        selectedModel,
        get().temperature,
        llmContext,
        onTokenCallback,
        onReasoningCallback,
        async (aiNote: string, action: "append" | "replace") => {
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
        controller.signal,
      );

      let finalContent = primaryResult.finalContent;
      let finalReasoning = primaryResult.lastResult.reasoning ?? "";
      let totalPromptTokens = primaryResult.totalPromptTokens;
      let totalCompletionTokens = primaryResult.totalCompletionTokens;
      const lastResult = primaryResult.lastResult;
      let finalTotalCost = calculateCostSEK(
        selectedModel,
        totalPromptTokens,
        totalCompletionTokens,
        lastResult.promptTokensDetails,
      );

      // 5. If Chaining is enabled, call the Reviewer Model
      if (get().isChaining && !controller.signal.aborted) {
        const secondModel = get().secondModel;

        // Optimize: Move Step 1 content to reasoning and clear content for Step 2
        finalReasoning =
          (finalReasoning ? `${finalReasoning}\n\n` : "") + `Draft Answer:\n${primaryResult.finalContent}`;
        get().updateMessageStateOnly(assistantId, { content: "", reasoning: finalReasoning });

        // Show status in UI
        onTokenCallback("*(Reviewing and improving...)*");

        const reviewMessages: LlmMessage[] = [
          {
            role: "system",
            content:
              "You are an expert scientific editor. Your goal is to correct any logical or factual errors in the initial response.\n\nCRITICAL: You must maintain high-quality, professional grammar. Do not omit words or take shortcuts in phrasing. If the logic is correct but the tone is poor, fix the tone. Provide ONLY the final, polished response.",
          },
          {
            role: "user",
            content: `User Question: ${content.trim()}\n\nInitial Response: ${primaryResult.finalContent}`,
          },
        ];

        let reviewerStreamedContent = "";
        let reviewerStreamedReasoning = "";
        const onReviewerTokenCallback = (chunk: string): void => {
          reviewerStreamedContent += chunk;
          const now = Date.now();
          if (now - lastRenderTime > RENDER_THROTTLE_MS) {
            get().updateMessageStateOnly(assistantId, { content: reviewerStreamedContent.trim() });
            lastRenderTime = now;
          }
        };

        const onReviewerReasoningCallback = (chunk: string): void => {
          reviewerStreamedReasoning += chunk;
          const now = Date.now();
          if (now - lastRenderTime > RENDER_THROTTLE_MS) {
            const currentReasoning =
              (finalReasoning ? `${finalReasoning}\n\n` : "") +
              `Reviewer Thinking:\n${reviewerStreamedReasoning.trim()}`;
            get().updateMessageStateOnly(assistantId, { reasoning: currentReasoning });
            lastRenderTime = now;
          }
        };

        const reviewerResult = await orchestrateLlmLoop(
          secondModel,
          get().temperature,
          reviewMessages,
          onReviewerTokenCallback,
          onReviewerReasoningCallback,
          undefined, // Reviewer doesn't update scratchpad
          controller.signal,
        );

        finalContent = reviewerResult.finalContent;
        totalPromptTokens += reviewerResult.totalPromptTokens;
        totalCompletionTokens += reviewerResult.totalCompletionTokens;

        // Add cost of reviewer model
        finalTotalCost += calculateCostSEK(
          secondModel,
          reviewerResult.totalPromptTokens,
          reviewerResult.totalCompletionTokens,
          reviewerResult.lastResult.promptTokensDetails,
        );
      }

      const latencyMs = Date.now() - loopStartTime;

      // 6. Finalize DB Updates in atomic transaction
      const userPatch = {
        promptTokens: totalPromptTokens,
        totalCost: finalTotalCost,
        failed: false,
      };
      const assistantPatch = {
        content: finalContent
          .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
          .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "")
          .trim(),
        reasoning: finalReasoning.trim(),
        completionTokens: totalCompletionTokens,
        totalCost: finalTotalCost,
        failed: false,
        latencyMs,
        model: get().isChaining ? `${selectedModel.id} - ${get().secondModel.id}` : selectedModel.id,
      };

      await athenaDb.transaction("rw", athenaDb.messages, async () => {
        await athenaDb.messages.update(userMessage.id, userPatch);
        await athenaDb.messages.update(assistantId, assistantPatch);
      });

      // Update state in one go
      set((state) => ({
        messagesByTopic: {
          ...state.messagesByTopic,
          [topicId]: (state.messagesByTopic[topicId] ?? []).map((m) => {
            if (m.id === userMessage.id) return { ...m, ...userPatch };
            if (m.id === assistantId) return { ...m, ...assistantPatch };
            return m;
          }),
        },
      }));

      void topicStoreState.generateTopicName(topicId, content);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("LLM request failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification("LLM request failed", msg);

      await get().updateMessage(userMessage.id, { failed: true });
      await get().updateMessage(assistantId, { isDeleted: true });

      set((state) => ({
        messagesByTopic: {
          ...state.messagesByTopic,
          [topicId]: (state.messagesByTopic[topicId] ?? []).map((m) =>
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
      set({ sending: false, abortController: null, currentRequestMessageIds: null });
    }
  },
  regenerateResponse: async (assistantId): Promise<void> => {
    const { messagesByTopic, currentTopicId } = get();
    if (!currentTopicId) return;

    const messages = messagesByTopic[currentTopicId] ?? [];
    const assistantMsgIndex = messages.findIndex((m) => m.id === assistantId);
    if (assistantMsgIndex === -1) return;

    // Find the user message that was sent before this assistant message
    const userMsg = messages
      .slice(0, assistantMsgIndex)
      .reverse()
      .find((m) => m.type === "user");

    if (!userMsg) return;

    // Call sendMessageStream with the user message content and ID as retry
    await get().sendMessageStream(userMsg.content, currentTopicId, userMsg.id);
  },
  stopSending: async (): Promise<string | null> => {
    const { abortController, currentRequestMessageIds, currentTopicId, messagesByTopic } = get();
    if (abortController) {
      abortController.abort();
    }

    if (currentRequestMessageIds && currentTopicId) {
      const { userMessageId, assistantMessageId } = currentRequestMessageIds;
      const messages = messagesByTopic[currentTopicId] ?? [];
      const userMsg = messages.find((m) => m.id === userMessageId);
      const content = userMsg?.content ?? null;

      // Delete from DB
      await athenaDb.messages.delete(userMessageId);
      await athenaDb.messages.delete(assistantMessageId);

      // Update state
      set((state) => ({
        sending: false,
        abortController: null,
        currentRequestMessageIds: null,
        messagesByTopic: {
          ...state.messagesByTopic,
          [currentTopicId]: (state.messagesByTopic[currentTopicId] ?? []).filter(
            (m) => m.id !== userMessageId && m.id !== assistantMessageId,
          ),
        },
      }));

      return content;
    }

    set({ sending: false, abortController: null, currentRequestMessageIds: null });
    return null;
  },
  switchMessageVersion: async (userMessageId, assistantId): Promise<void> => {
    const { currentTopicId, updateMessage } = get();
    if (!currentTopicId) return;

    await updateMessage(userMessageId, { activeResponseId: assistantId });
  },
}));

const sortMessages = function (messages: Message[]): Message[] {
  return messages.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
};
