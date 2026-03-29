import { create } from "zustand";
import {
  calculateCostSEK,
  ChatModel,
  getDefaultModel,
  getDefaultSecondModel,
  chatModels,
} from "../components/ModelSelector";
import { useTopicStore } from "./TopicStore";
import { orchestrateLlmLoop, LlmMessage } from "../services/llmService";
import { Message } from "../database/AthenaDb";
import { athenaDb } from "../database/AthenaDb";
import { useNotificationStore } from "./NotificationStore";
import { useAuthStore } from "./AuthStore";
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

  secondModel: getDefaultSecondModel(),
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
      let lastContentRenderTime = 0;
      let lastReasoningRenderTime = 0;
      const RENDER_THROTTLE_MS = 64; // ~15fps for smooth but efficient UI

      let streamedReasoning = "";
      const onTokenCallback = (chunk: string): void => {
        streamedContent += chunk;
        const now = Date.now();
        if (now - lastContentRenderTime > RENDER_THROTTLE_MS) {
          const displayContent = streamedContent
            .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
            .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "");
          get().updateMessageStateOnly(assistantId, { content: displayContent });
          lastContentRenderTime = now;
        }
      };

      const onReasoningCallback = (token: string): void => {
        streamedReasoning += token;
        const now = Date.now();
        if (now - lastReasoningRenderTime > RENDER_THROTTLE_MS) {
          get().updateMessageStateOnly(assistantId, { reasoning: streamedReasoning.trim() });
          lastReasoningRenderTime = now;
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

      const finalContent = primaryResult.finalContent;
      const finalReasoning = primaryResult.lastResult.reasoning ?? "";
      const totalPromptTokens = primaryResult.totalPromptTokens;
      const totalCompletionTokens = primaryResult.totalCompletionTokens;
      const lastResult = primaryResult.lastResult;
      const finalTotalCost = calculateCostSEK(
        selectedModel,
        totalPromptTokens,
        totalCompletionTokens,
        lastResult.promptTokensDetails,
      );

      // 5. If Chaining is enabled, stream the second model as a separate response version
      if (get().isChaining && !controller.signal.aborted) {
        const secondModel = get().secondModel;
        const firstCost = calculateCostSEK(
          selectedModel,
          totalPromptTokens,
          totalCompletionTokens,
          lastResult.promptTokensDetails,
        );
        const firstLatencyMs = Date.now() - loopStartTime;

        // 5a. Finalize the first assistant message immediately with the primary result
        const firstAssistantPatch = {
          content: finalContent
            .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
            .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "")
            .trim(),
          reasoning: finalReasoning.trim(),
          completionTokens: totalCompletionTokens,
          totalCost: firstCost,
          failed: false,
          latencyMs: firstLatencyMs,
          model: selectedModel.id,
        };
        await athenaDb.messages.update(assistantId, firstAssistantPatch);
        get().updateMessageStateOnly(assistantId, firstAssistantPatch);

        // 5b. Create the second assistant message, seeding it with the primary's
        //     reasoning so it's visible immediately in the active bubble.
        const secondAssistantId = crypto.randomUUID();
        const secondAssistantMessage: Message = {
          id: secondAssistantId,
          topicId,
          forkId: activeForkId,
          type: "assistant",
          content: "",
          // Pre-populate with primary reasoning so user sees it while reviewer streams
          reasoning: finalReasoning.trim() || undefined,
          created: new Date().toISOString(),
          model: secondModel.id,
          isDeleted: false,
          includeInContext: false,
          failed: false,
          promptTokens: 0,
          completionTokens: 0,
          totalCost: 0,
          parentMessageId: userMessage.id,
        };

        await athenaDb.transaction("rw", athenaDb.messages, async () => {
          await athenaDb.messages.add(secondAssistantMessage);
          await athenaDb.messages.update(userMessage.id, { activeResponseId: secondAssistantId });
        });

        set((state) => {
          const existing = state.messagesByTopic[topicId] ?? [];
          return {
            messagesByTopic: {
              ...state.messagesByTopic,
              [topicId]: sortMessages([
                ...existing.map((m) => (m.id === userMessage.id ? { ...m, activeResponseId: secondAssistantId } : m)),
                secondAssistantMessage,
              ]),
            },
          };
        });

        // 5c. Stream the second model into the new message
        const reviewerPrompt =
          "You are an expert quality-assurance AI. Your task is to review a drafted response to a user's prompt and improve it. Correct any factual, logical, or grammatical errors. Ensure the formatting is clean and the tone matches the user's original intent. If the draft contains code, ensure it is syntactically correct and complete. Do not unnecessarily rewrite accurate content. Provide ONLY the final, polished response without any introductory or concluding meta-text.";

        const reviewMessages: LlmMessage[] = [
          { role: "system" as const, content: reviewerPrompt },
          ...existingContext.map((m) => ({
            role: (m.type === "user" ? "user" : m.type === "assistant" ? "assistant" : "system") as "user" | "assistant" | "system",
            content: m.content,
            reasoning_content: m.reasoning,
          })),
          { role: "user" as const, content: userMessage.content },
          { role: "assistant" as const, content: primaryResult.finalContent },
          {
            role: "user" as const,
            content:
              "Please review and polish your drafted response above. Correct any factual, logical, or grammatical errors. Ensure the formatting is clean and the tone matches the user's original intent. If the draft contains code, ensure it is syntactically correct and complete. Do not unnecessarily rewrite accurate content. Provide ONLY the final, polished response without any introductory or concluding meta-text.",
          },
        ];

        let reviewerStreamedContent = "";
        let reviewerStreamedReasoning = "";
        // Use independent render timers for the reviewer so content and reasoning
        // don't starve each other during fast streaming.
        let reviewerLastContentRenderTime = 0;
        let reviewerLastReasoningRenderTime = 0;
        const onReviewerTokenCallback = (chunk: string): void => {
          reviewerStreamedContent += chunk;
          const now = Date.now();
          if (now - reviewerLastContentRenderTime > RENDER_THROTTLE_MS) {
            get().updateMessageStateOnly(secondAssistantId, { content: reviewerStreamedContent.trim() });
            reviewerLastContentRenderTime = now;
          }
        };

        const onReviewerReasoningCallback = (chunk: string): void => {
          reviewerStreamedReasoning += chunk;
          const now = Date.now();
          if (now - reviewerLastReasoningRenderTime > RENDER_THROTTLE_MS) {
            get().updateMessageStateOnly(secondAssistantId, { reasoning: reviewerStreamedReasoning.trim() });
            reviewerLastReasoningRenderTime = now;
          }
        };

        let reviewerFinalContent = finalContent; // fallback to primary if reviewer fails
        let reviewerPromptTokens = 0;
        let reviewerCompletionTokens = 0;
        let reviewerCost = 0;

        try {
          // Preflight: ensure the reviewer model's provider has a configured API key.
          // If not, skip the reviewer rather than crashing with "Failed to fetch".
          const { openAiKey, deepSeekKey, googleApiKey, moonshotApiKey } = useAuthStore.getState();
          const hasKey =
            (secondModel.provider === "openai" && !!openAiKey) ||
            (secondModel.provider === "deepseek" && !!deepSeekKey) ||
            (secondModel.provider === "google" && !!googleApiKey) ||
            (secondModel.provider === "moonshot" && !!moonshotApiKey);
          if (!hasKey) {
            useNotificationStore
              .getState()
              .addNotification(
                "Reviewer skipped",
                `No API key configured for reviewer model "${secondModel.label}". Please select a different reviewer model.`,
              );
            throw new Error(`No API key for reviewer model provider: ${secondModel.provider}`);
          }

          const reviewerResult = await orchestrateLlmLoop(
            secondModel,
            get().temperature,
            reviewMessages,
            onReviewerTokenCallback,
            onReviewerReasoningCallback,
            undefined, // Reviewer doesn't update scratchpad
            controller.signal,
          );

          reviewerFinalContent = reviewerResult.finalContent;
          reviewerPromptTokens = reviewerResult.totalPromptTokens;
          reviewerCompletionTokens = reviewerResult.totalCompletionTokens;
          reviewerCost = calculateCostSEK(
            secondModel,
            reviewerPromptTokens,
            reviewerCompletionTokens,
            reviewerResult.lastResult.promptTokensDetails,
          );
        } catch (err) {
          console.error("Reviewer model failed:", err);
          const errMsg = err instanceof Error ? err.message : String(err);
          useNotificationStore.getState().addNotification("Reviewer failed", errMsg);
        }

        // 5d. Finalize both messages
        const chainedUserPatch = {
          promptTokens: totalPromptTokens + reviewerPromptTokens,
          totalCost: firstCost + reviewerCost,
          failed: false,
        };
        const secondAssistantPatch = {
          content: reviewerFinalContent
            .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, "")
            .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "")
            .trim(),
          // If the reviewer emits no reasoning, preserve the primary model's reasoning
          // that was seeded into the bubble so the user still sees the thinking output.
          reasoning: reviewerStreamedReasoning.trim() || finalReasoning.trim() || undefined,
          completionTokens: reviewerCompletionTokens,
          totalCost: reviewerCost,
          failed: reviewerFinalContent === "",
          latencyMs: Date.now() - loopStartTime - firstLatencyMs,
          model: secondModel.id,
        };

        await athenaDb.transaction("rw", athenaDb.messages, async () => {
          await athenaDb.messages.update(userMessage.id, chainedUserPatch);
          await athenaDb.messages.update(secondAssistantId, secondAssistantPatch);
        });

        set((state) => ({
          messagesByTopic: {
            ...state.messagesByTopic,
            [topicId]: (state.messagesByTopic[topicId] ?? []).map((m) => {
              if (m.id === userMessage.id) return { ...m, ...chainedUserPatch };
              if (m.id === secondAssistantId) return { ...m, ...secondAssistantPatch };
              return m;
            }),
          },
        }));

        void topicStoreState.generateTopicName(topicId, content);
        return;
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
        model: selectedModel.id,
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
