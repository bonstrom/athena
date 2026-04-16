import { create } from 'zustand';
import { calculateCostSEK, ChatModel, getDefaultModel } from '../components/ModelSelector';
import { useProviderStore } from './ProviderStore';
import { useTopicStore } from './TopicStore';
import { useNotificationStore } from './NotificationStore';
import {
  orchestrateLlmLoop,
  askLlm,
  LlmMessage,
  LlmContentPart,
  SCRATCHPAD_TOOL,
  READ_MESSAGES_TOOL,
  LIST_MESSAGES_TOOL,
  ASK_USER_TOOL,
  LlmTool,
  LlmDebugPayload,
} from '../services/llmService';
import { generateImage, generateMusic } from '../services/mediaService';
import { llmSuggestionService } from '../services/llmSuggestionService';
import { Message, Attachment } from '../database/AthenaDb';
import { athenaDb } from '../database/AthenaDb';
import { BackupService } from '../services/backupService';
import { useAuthStore } from './AuthStore';
import { embeddingService } from '../services/embeddingService';

import { SCRATCHPAD_LIMIT, SHORT_SCRATCHPAD_RULES, ASK_USER_INSTRUCTIONS, MESSAGE_RETRIEVAL_INSTRUCTIONS } from '../constants';

/**
 * Heuristic: detect when the LLM response is primarily a clarification question
 * rather than a substantive answer. Used as a fallback when the model ignores the
 * ask_user tool and embeds questions directly in its reply text.
 */
function looksLikeClarificationQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Must end with a question mark
  if (!trimmed.endsWith('?')) return false;
  // Must have at least one question mark
  const questionCount = (trimmed.match(/\?/g) ?? []).length;
  if (questionCount < 1) return false;
  // Skip long, substantive responses (likely real answers that happen to end with a question)
  if (trimmed.length > 2000) return false;
  // Should contain clarification-related language
  const clarificationPatterns =
    /\b(clarif|specify|which|what (do|would|are|is|did)|could you (tell|let|provide|share|specify)|more (context|information|details)|what.*(mean|refer)|need.*(know|more|information|context|detail))\b/i;
  return clarificationPatterns.test(trimmed);
}

export interface PendingUserQuestion {
  question: string;
  context: string;
  resolve: (answer: string) => void;
  reject: (reason?: unknown) => void;
}

export interface ContextEntry {
  message: LlmMessage;
  sourceLabel: string;
  messageId?: string;
  messageType?: string;
  isConversationMessage?: boolean;
  isRagRetrieved?: boolean;
}

interface ChatStore {
  messagesByTopic: Record<string, Message[] | undefined>;
  currentTopicId: string | null;
  isInitialLoad: boolean;
  showAllMessages: boolean;
  sending: boolean;
  selectedModel: ChatModel;
  visibleMessageCount: number;
  webSearchEnabled: boolean;
  imageGenerationEnabled: boolean;
  musicGenerationEnabled: boolean;
  setWebSearchEnabled: (value: boolean) => void;
  setImageGenerationEnabled: (value: boolean) => void;
  setMusicGenerationEnabled: (value: boolean) => void;
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
  sendMessageStream: (content: string, topicId: string, messageId?: string, attachments?: Attachment[]) => Promise<void>;
  buildFullContext: (topicId: string, userMessagePreview?: string) => Promise<ContextEntry[]>;
  setSelectedModel: (model: ChatModel) => void;
  updateMessageContext: (messageId: string, include: boolean) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  regenerateResponse: (assistantMessageId: string) => Promise<void>;
  switchMessageVersion: (userMessageId: string, assistantMessageId: string) => Promise<void>;
  temperature: number;
  setTemperature: (temp: number) => void;
  abortController: AbortController | null;
  currentRequestMessageIds: { userMessageId: string; assistantMessageId: string } | null;
  stopSending: () => Promise<string | null>;
  pendingSuggestions: string[] | null;
  clearSuggestions: () => void;
  isSuggestionsLoading: boolean;
  pendingUserQuestion: PendingUserQuestion | null;
  resolvePendingQuestion: (answer: string) => void;
  preloadTopics: (topicIds: string[]) => Promise<void>;
  maybeSummarize: (messageId: string, content: string, force?: boolean, contextMessages?: LlmMessage[]) => Promise<void>;
  _runSummarize: (messageId: string, content: string, contextMessages?: LlmMessage[]) => Promise<void>;
  summarizingMessageIds: Set<string>;
  failedSummaryMessageIds: Set<string>;
}

// Serialize summarization requests — llmSuggestionService has a single completion slot
// so concurrent calls would overwrite each other's resolve callback and hang.
let summarizeQueue: Promise<void> = Promise.resolve();

export const useChatStore = create<ChatStore>((set, get) => ({
  messagesByTopic: {},
  currentTopicId: null,
  isInitialLoad: true,
  showAllMessages: false,
  visibleMessageCount: 10,
  sending: false,
  selectedModel: getDefaultModel(),
  temperature: 1.0,
  webSearchEnabled: false,
  imageGenerationEnabled: false,
  musicGenerationEnabled: false,
  abortController: null,
  currentRequestMessageIds: null,
  pendingSuggestions: null,
  summarizingMessageIds: new Set<string>(),
  failedSummaryMessageIds: new Set<string>(),
  isSuggestionsLoading: false,
  pendingUserQuestion: null,

  resolvePendingQuestion: (answer: string): void => {
    const pending = get().pendingUserQuestion;
    if (pending) {
      pending.resolve(answer);
      set({ pendingUserQuestion: null });
    }
  },

  clearSuggestions: (): void => set({ pendingSuggestions: null, isSuggestionsLoading: false }),

  preloadTopics: async (topicIds: string[]): Promise<void> => {
    const { messagesByTopic } = get();
    const unloaded = topicIds.filter((id) => messagesByTopic[id] === undefined);
    if (unloaded.length === 0) return;

    const results = await Promise.all(
      unloaded.map((topicId) =>
        athenaDb.messages
          .where('topicId')
          .equals(topicId)
          .sortBy('created')
          .then((msgs) => ({ topicId, msgs })),
      ),
    );

    set((state) => {
      const updates: Record<string, Message[]> = {};
      for (const { topicId, msgs } of results) {
        if (state.messagesByTopic[topicId] === undefined) {
          updates[topicId] = msgs;
        }
      }
      return { messagesByTopic: { ...state.messagesByTopic, ...updates } };
    });
  },

  setWebSearchEnabled: (value: boolean): void => set({ webSearchEnabled: value }),
  setImageGenerationEnabled: (value: boolean): void => set({ imageGenerationEnabled: value }),
  setMusicGenerationEnabled: (value: boolean): void => set({ musicGenerationEnabled: value }),

  buildFullContext: async (topicId: string, userMessagePreview?: string): Promise<ContextEntry[]> => {
    const { selectedModel, webSearchEnabled } = get();
    const topicStoreState = useTopicStore.getState();
    const topic = topicStoreState.topics.find((t) => t.id === topicId);

    const existingContext = await topicStoreState.getTopicContext(topicId, undefined, userMessagePreview?.trim());
    const entries: ContextEntry[] = [];

    // System: Custom instructions (prepended first, same as buildPayload in llmService)
    const customInstructions = useAuthStore.getState().customInstructions.trim();
    if (customInstructions) {
      entries.push({ message: { role: 'system', content: customInstructions }, sourceLabel: 'Custom Instructions' });
    }

    // System: Scratchpad rules + content (shown as two entries for clarity in the inspector)
    const rawScratchpadRules = (topic?.scratchpad ? useAuthStore.getState().scratchpadRules : SHORT_SCRATCHPAD_RULES).replace(
      '{{SCRATCHPAD_LIMIT}}',
      String(SCRATCHPAD_LIMIT),
    );
    const scratchpadRulesOnly = selectedModel.supportsTools
      ? rawScratchpadRules
      : `${rawScratchpadRules}\n\nTo update the scratchpad without tools, include \`<!-- persist: your note here -->\` to append or \`<!-- replace: your new content here -->\` to overwrite.`;
    entries.push({ message: { role: 'system', content: scratchpadRulesOnly }, sourceLabel: 'Scratchpad Rules' });
    if (topic?.scratchpad) {
      entries.push({ message: { role: 'system', content: topic.scratchpad }, sourceLabel: 'Scratchpad Content' });
    }

    // System: Web search instructions
    const selectedProvider = useProviderStore.getState().getProviderForModel(selectedModel);
    if (webSearchEnabled && selectedProvider?.supportsWebSearch) {
      entries.push({
        message: {
          role: 'system',
          content:
            "You have access to real-time internet search via the $web_search tool. Use it whenever you need up-to-date information or are unsure about recent events (like 'Vem vann Melodifestivalen 2024?').",
        },
        sourceLabel: 'Web Search Instructions',
      });
    }

    // System: Ask-user clarification instructions
    if (useAuthStore.getState().askUserEnabled) {
      entries.push({
        message: { role: 'system', content: ASK_USER_INSTRUCTIONS },
        sourceLabel: 'Ask User Instructions',
      });
    }

    // System: Message retrieval instructions
    if (useAuthStore.getState().messageRetrievalEnabled) {
      entries.push({
        message: { role: 'system', content: MESSAGE_RETRIEVAL_INSTRUCTIONS },
        sourceLabel: 'Message Retrieval Instructions',
      });
    }

    // System: Predefined prompts
    const selectedPromptIds = topic?.selectedPromptIds ?? [];
    if (selectedPromptIds.length > 0) {
      const allPrompts = useAuthStore.getState().predefinedPrompts;
      const selectedPrompts = allPrompts.filter((p) => selectedPromptIds.includes(p.id));
      for (const p of selectedPrompts) {
        entries.push({ message: { role: 'system', content: p.content }, sourceLabel: `Predefined Prompt: ${p.name}` });
      }
    }

    // Conversation messages
    for (const m of existingContext) {
      const role: LlmMessage['role'] = m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : 'system';
      const isRag = m.id === '__rag_context__';
      let sourceLabel: string;
      if (isRag) {
        sourceLabel = 'RAG Retrieved Context';
      } else if (m.type === 'aiNote') {
        sourceLabel = 'AI Note';
      } else if (m.includeInContext) {
        sourceLabel = `Pinned ${m.type === 'user' ? 'User' : 'Assistant'} Message`;
      } else {
        sourceLabel = `Recent ${m.type === 'user' ? 'User' : 'Assistant'} Message`;
      }
      entries.push({
        message: {
          role,
          content: m.content,
          ...(role === 'assistant'
            ? { reasoning_content: m.reasoning ?? 'Thinking process hidden or not provided.' }
            : m.reasoning !== undefined && { reasoning_content: m.reasoning }),
        },
        sourceLabel,
        messageId: isRag ? undefined : m.id,
        messageType: m.type,
        isConversationMessage: !isRag && (m.type === 'user' || m.type === 'assistant'),
        isRagRetrieved: isRag,
      });
    }

    // Current user message preview
    if (userMessagePreview?.trim()) {
      entries.push({
        message: { role: 'user', content: userMessagePreview.trim() },
        sourceLabel: 'Current User Message (Preview)',
      });
    }

    return entries;
  },

  setTemperature: (temp): void => set({ temperature: temp }),
  setSending: (value): void => set({ sending: value }),

  increaseVisibleMessageCount: (): void => set((state) => ({ visibleMessageCount: state.visibleMessageCount + 10 })),

  toggleShowAllMessages: (): void => set((state) => ({ showAllMessages: !state.showAllMessages })),

  resetVisibleMessageCount: (): void => set({ visibleMessageCount: 10 }),

  setInitialLoad: (value: boolean): void => set({ isInitialLoad: value }),

  setSelectedModel: (model: ChatModel): void => {
    localStorage.setItem('athena_selected_model', model.id);
    set({ selectedModel: model });
  },

  deleteMessage: async (id): Promise<void> => {
    const { currentTopicId, messagesByTopic } = get();
    if (!currentTopicId) return;

    const messages = messagesByTopic[currentTopicId] ?? [];
    const targetIndex = messages.findIndex((m) => m.id === id);
    const target = targetIndex >= 0 ? messages[targetIndex] : undefined;

    // If deleting an assistant message, clear includeInContext on its paired user message
    // to avoid sending orphaned context references to the LLM.
    const pairedUserMessageId = target?.type === 'assistant' && target.parentMessageId ? target.parentMessageId : null;

    // If deleting a user message, also delete its active assistant reply (looked up by
    // parentMessageId rather than array position, to correctly handle aiNote/system
    // messages that may appear between the user and assistant messages).
    const pairedAssistantId = target?.type === 'user' ? (messages.find((m) => m.type === 'assistant' && m.parentMessageId === id)?.id ?? null) : null;

    const idsToDelete = [id, ...(pairedAssistantId ? [pairedAssistantId] : [])];

    try {
      await athenaDb.transaction('rw', athenaDb.messages, async () => {
        await athenaDb.messages.bulkDelete(idsToDelete);
        if (pairedUserMessageId) {
          await athenaDb.messages.update(pairedUserMessageId, { includeInContext: false });
        }
      });
    } catch (err) {
      console.error('Failed to delete message(s) from database:', err);
      throw err;
    }

    set((state) => ({
      messagesByTopic: {
        ...state.messagesByTopic,
        [currentTopicId]: (state.messagesByTopic[currentTopicId] ?? [])
          .filter((m) => !idsToDelete.includes(m.id))
          .map((m) => (m.id === pairedUserMessageId ? { ...m, includeInContext: false } : m)),
      },
    }));
  },

  fetchMessages: async (topicId: string, forkId?: string): Promise<void> => {
    const topic = useTopicStore.getState().topics.find((t) => t.id === topicId);
    const activeForkId = forkId ?? topic?.activeForkId ?? 'main';

    // Reject any dangling ask_user promise from the previous topic
    const pending = get().pendingUserQuestion;
    if (pending) {
      pending.reject(new DOMException('Topic switched', 'AbortError'));
      set({ pendingUserQuestion: null });
    }

    // If already cached and on the main fork, just switch to it instantly
    const cached = get().messagesByTopic[topicId];
    if (cached !== undefined && !forkId) {
      set({ currentTopicId: topicId, isInitialLoad: true, visibleMessageCount: 10 });
      return;
    }

    const all = await athenaDb.messages
      .where('topicId')
      .equals(topicId)
      .and((m) => m.forkId === activeForkId)
      .sortBy('created');

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

    const updated = (messagesByTopic[currentTopicId] ?? []).map((m) => (m.id === id ? { ...m, includeInContext: include } : m));

    set({ messagesByTopic: { ...messagesByTopic, [currentTopicId]: updated } });
  },

  addMessage: async (message: Message): Promise<void> => {
    const { topicId, id } = message;

    const existing = await athenaDb.messages.get(id);
    if (existing) return;

    await athenaDb.messages.add(message);

    // Fire-and-forget embedding
    if (embeddingService.isReady && message.content.trim()) {
      void embeddingService.generateEmbedding(message.content).then((vector) => athenaDb.messages.update(id, { embedding: vector }));
    }

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

    // Fire-and-forget summarization
    void get().maybeSummarize(id, message.content);
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

    // Summarize new messages if needed
    for (const msg of newMessages) {
      void get().maybeSummarize(msg.id, msg.content);
    }
  },

  updateMessage: async (id, patch): Promise<void> => {
    try {
      await athenaDb.messages.update(id, patch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to update message', msg);
      throw err;
    }

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

    try {
      await Promise.all(updates.map(({ id, patch }) => athenaDb.messages.update(id, patch)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Failed to update messages', msg);
      throw err;
    }

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

  sendMessageStream: async (content: string, topicId: string, messageId?: string, attachments?: Attachment[]): Promise<void> => {
    // Guard against concurrent sends (e.g. rapid double-tap)
    if (get().sending) return;

    // Clear any pending suggestions when a new message is sent
    set({ pendingSuggestions: null, isSuggestionsLoading: false });

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
    const activeForkId = topic?.activeForkId ?? 'main';

    // 1. Handle User Message
    if (isRetry) {
      const existing = await athenaDb.messages.get(messageId);
      if (!existing) throw new Error('Original message not found for retry.');
      userMessage = existing;
    } else {
      userMessage = {
        id: crypto.randomUUID(),
        topicId,
        forkId: activeForkId,
        type: 'user',
        content: content.trim(),
        created: now,
        model: undefined,
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
        attachments: attachments,
      };
    }

    // 2. Build Context
    const existingContext = await topicStoreState.getTopicContext(topicId, isRetry ? messageId : undefined, content.trim());

    const llmContext: LlmMessage[] = existingContext.map((m) => {
      const role = m.type === 'user' ? 'user' : m.type === 'assistant' ? 'assistant' : 'system';
      if (m.attachments && m.attachments.length > 0 && (selectedModel.supportsVision || selectedModel.supportsFiles)) {
        const parts: LlmContentPart[] = [{ type: 'text', text: m.content }];
        for (const att of m.attachments) {
          if (att.type.startsWith('image/') && selectedModel.supportsVision) {
            parts.push({ type: 'image_url', image_url: { url: att.data } });
          }
        }
        return {
          role,
          content: parts,
          ...(role === 'assistant'
            ? { reasoning_content: m.reasoning ?? 'Thinking process hidden or not provided.' }
            : m.reasoning !== undefined && { reasoning_content: m.reasoning }),
        };
      }
      return {
        role,
        content: m.content,
        ...(role === 'assistant'
          ? { reasoning_content: m.reasoning ?? 'Thinking process hidden or not provided.' }
          : m.reasoning !== undefined && { reasoning_content: m.reasoning }),
      };
    });

    const systems: LlmMessage[] = [];
    const rawScratchpadRules = (topic?.scratchpad ? useAuthStore.getState().scratchpadRules : SHORT_SCRATCHPAD_RULES).replace(
      '{{SCRATCHPAD_LIMIT}}',
      String(SCRATCHPAD_LIMIT),
    );
    const scratchpadRules = topic?.scratchpad ? `${rawScratchpadRules}\n\n[Current Scratchpad Content]:\n${topic.scratchpad}` : rawScratchpadRules;

    if (selectedModel.supportsTools) {
      systems.push({ role: 'system', content: scratchpadRules });
    } else {
      systems.push({
        role: 'system',
        content: `${scratchpadRules}\n\nTo update the scratchpad without tools, include \`<!-- persist: your note here -->\` to append or \`<!-- replace: your new content here -->\` to overwrite.`,
      });
    }

    const selectedProvider = useProviderStore.getState().getProviderForModel(selectedModel);
    if (get().webSearchEnabled && selectedProvider?.supportsWebSearch) {
      systems.push({
        role: 'system',
        content:
          "You have access to real-time internet search via the $web_search tool. Use it whenever you need up-to-date information or are unsure about recent events (like 'Vem vann Melodifestivalen 2024?').",
      });
    }

    const selectedPromptIds = topic?.selectedPromptIds ?? [];
    if (selectedPromptIds.length > 0) {
      const allPrompts = useAuthStore.getState().predefinedPrompts;
      const selectedPrompts = allPrompts.filter((p) => selectedPromptIds.includes(p.id));
      for (const p of selectedPrompts) {
        systems.push({ role: 'system', content: p.content });
      }
    }

    llmContext.unshift(...systems);

    // Add current user message to context before calling loop
    if (userMessage.attachments && userMessage.attachments.length > 0 && (selectedModel.supportsVision || selectedModel.supportsFiles)) {
      const parts: LlmContentPart[] = [{ type: 'text', text: userMessage.content }];
      for (const att of userMessage.attachments) {
        if (att.type.startsWith('image/') && selectedModel.supportsVision) {
          parts.push({ type: 'image_url', image_url: { url: att.data } });
        }
      }
      llmContext.push({ role: 'user', content: parts });
    } else {
      llmContext.push({ role: 'user', content: userMessage.content });
    }

    // 3. Prepare Assistant Message
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      topicId,
      forkId: activeForkId,
      type: 'assistant',
      content: '',
      created: new Date().toISOString(),
      model: selectedModel.apiModelId,
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      parentMessageId: userMessage.id,
    };

    if (get().imageGenerationEnabled) {
      try {
        await athenaDb.transaction('rw', athenaDb.messages, async () => {
          if (isRetry) {
            await athenaDb.messages.update(userMessage.id, { failed: false });
          } else {
            await athenaDb.messages.add(userMessage);
          }
          await athenaDb.messages.add(assistantMessage);
        });

        set((state) => {
          const existing = state.messagesByTopic[topicId] ?? [];
          const updated = [...existing];
          if (!isRetry) updated.push(userMessage);
          updated.push(assistantMessage);
          return {
            messagesByTopic: { ...state.messagesByTopic, [topicId]: sortMessages(updated) },
            currentRequestMessageIds: { userMessageId: userMessage.id, assistantMessageId: assistantId },
          };
        });

        void topicStoreState.updateTopicTimestamp(topicId);

        const { content: resultContent, attachment, model: resultModel } = await generateImage(content, controller.signal);
        const finalizedAssistant: Partial<Message> = {
          content: resultContent,
          attachments: [attachment],
          model: resultModel,
          failed: false,
        };

        await athenaDb.messages.update(assistantId, finalizedAssistant);
        get().updateMessageStateOnly(assistantId, finalizedAssistant);
        set({ imageGenerationEnabled: false }); // Auto-disable after use

        // Finalize topic state (naming and summarization)
        if (!isRetry) {
          void get().maybeSummarize(userMessage.id, userMessage.content);
        }
        void get().maybeSummarize(assistantId, finalizedAssistant.content ?? '', undefined, [
          ...llmContext,
          { role: 'assistant', content: finalizedAssistant.content ?? '' },
        ]);
        void topicStoreState.generateTopicName(topicId, content);
      } catch (err) {
        console.error('Image generation failed:', err);
        const errorPatch = { content: `Error: ${err instanceof Error ? err.message : String(err)}`, failed: true };
        await athenaDb.messages.update(assistantId, errorPatch);
        get().updateMessageStateOnly(assistantId, errorPatch);
      } finally {
        set({ sending: false, abortController: null });
      }
      return;
    }

    if (get().musicGenerationEnabled) {
      try {
        await athenaDb.transaction('rw', athenaDb.messages, async () => {
          if (isRetry) {
            await athenaDb.messages.update(userMessage.id, { failed: false });
          } else {
            await athenaDb.messages.add(userMessage);
          }
          await athenaDb.messages.add(assistantMessage);
        });

        set((state) => {
          const existing = state.messagesByTopic[topicId] ?? [];
          const updated = [...existing];
          if (!isRetry) updated.push(userMessage);
          updated.push(assistantMessage);
          return {
            messagesByTopic: { ...state.messagesByTopic, [topicId]: sortMessages(updated) },
            currentRequestMessageIds: { userMessageId: userMessage.id, assistantMessageId: assistantId },
          };
        });

        void topicStoreState.updateTopicTimestamp(topicId);

        const { content: resultContent, attachment, model: resultModel } = await generateMusic(content, controller.signal);
        const finalizedAssistant: Partial<Message> = {
          content: resultContent,
          attachments: [attachment],
          model: resultModel,
          failed: false,
        };

        await athenaDb.messages.update(assistantId, finalizedAssistant);
        get().updateMessageStateOnly(assistantId, finalizedAssistant);
        set({ musicGenerationEnabled: false });

        // Finalize topic state (naming and summarization)
        if (!isRetry) {
          void get().maybeSummarize(userMessage.id, userMessage.content);
        }
        void get().maybeSummarize(assistantId, finalizedAssistant.content ?? '', undefined, [
          ...llmContext,
          { role: 'assistant', content: finalizedAssistant.content ?? '' },
        ]);
        void topicStoreState.generateTopicName(topicId, content);
      } catch (err) {
        console.error('Music generation failed:', err);
        const errorPatch = { content: `Error: ${err instanceof Error ? err.message : String(err)}`, failed: true };
        await athenaDb.messages.update(assistantId, errorPatch);
        get().updateMessageStateOnly(assistantId, errorPatch);
      } finally {
        set({ sending: false, abortController: null });
      }
      return;
    }

    try {
      // Create initial DB state in a single transaction
      await athenaDb.transaction('rw', athenaDb.messages, async () => {
        if (isRetry) {
          await athenaDb.messages.update(userMessage.id, { failed: false });
        } else {
          await athenaDb.messages.add(userMessage);
        }
        await athenaDb.messages.add(assistantMessage);
        await athenaDb.messages.update(userMessage.id, { activeResponseId: assistantId });
      });

      // Fire-and-forget embedding for the new user message (not a retry)
      if (!isRetry && embeddingService.isReady && userMessage.content.trim()) {
        void embeddingService
          .generateEmbedding(userMessage.content)
          .then((vector) => athenaDb.messages.update(userMessage.id, { embedding: vector }));
      }

      // Update state once for both messages
      set((state) => {
        const existingMessages = state.messagesByTopic[topicId] ?? [];
        let updated = [...existingMessages];

        if (isRetry) {
          updated = updated.map((m) => (m.id === userMessage.id ? { ...m, failed: false, activeResponseId: assistantId } : m));
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

      void topicStoreState.updateTopicTimestamp(topicId);

      const loopStartTime = Date.now();
      let streamedContent = '';
      let lastContentRenderTime = 0;
      const RENDER_THROTTLE_MS = 64; // ~15fps for smooth but efficient UI

      const onTokenCallback = (chunk: string): void => {
        streamedContent += chunk;
        const now = Date.now();
        if (now - lastContentRenderTime > RENDER_THROTTLE_MS) {
          const displayContent = streamedContent
            .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, '')
            .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, '');
          get().updateMessageStateOnly(assistantId, { content: displayContent });
          lastContentRenderTime = now;
        }
      };

      let streamedThinking = '';
      let lastThinkingRenderTime = 0;

      const onReasoningCallback = (token: string): void => {
        streamedThinking += token;
        const now = Date.now();
        if (now - lastThinkingRenderTime > RENDER_THROTTLE_MS) {
          get().updateMessageStateOnly(assistantId, { reasoning: streamedThinking.trim() });
          lastThinkingRenderTime = now;
        }
      };

      const onToolLogCallback = (log: string): void => {
        streamedThinking += log;
        get().updateMessageStateOnly(assistantId, { reasoning: streamedThinking.trim() });
      };

      // 4. Call the Orchestrator for the Primary Model
      const primaryResult = await orchestrateLlmLoop(
        selectedModel,
        get().temperature,
        llmContext,
        onTokenCallback,
        onReasoningCallback,
        async (aiNote: string, action: 'append' | 'replace') => {
          const currentScratchpad = useTopicStore.getState().topics.find((t) => t.id === topicId)?.scratchpad ?? '';
          let updatedScratchpad = '';
          if (action === 'replace') {
            updatedScratchpad = aiNote;
          } else {
            updatedScratchpad = currentScratchpad ? `${currentScratchpad}\n${aiNote}` : aiNote;
          }
          if (updatedScratchpad.length > SCRATCHPAD_LIMIT) {
            const cutoff = updatedScratchpad.lastIndexOf('\n', SCRATCHPAD_LIMIT);
            updatedScratchpad = updatedScratchpad.slice(0, cutoff > 0 ? cutoff : SCRATCHPAD_LIMIT);
            useNotificationStore.getState().addNotification('Scratchpad full', 'Content was trimmed to fit the character limit.');
          }
          await topicStoreState.updateTopicScratchpad(topicId, updatedScratchpad);
        },
        async (toolName, argsJson) => {
          if (toolName === 'read_messages') {
            try {
              const parsedArgs = JSON.parse(argsJson) as { messages?: { messageId: string; startLine?: number; endLine?: number }[] };
              const messagesToRead = parsedArgs.messages ?? [];
              const results: string[] = [];

              if (messagesToRead.length === 0) {
                return 'Error: No messages array provided in arguments.';
              }

              const activeForkId = topic?.activeForkId ?? 'main';
              const allMessagesInTopic = await athenaDb.messages
                .where('topicId')
                .equals(topicId)
                .and((m) => m.forkId === activeForkId)
                .toArray();

              for (const req of messagesToRead) {
                if (!req.messageId) continue;
                // Find message by full ID first, then fall back to prefix match
                let target = allMessagesInTopic.find((m) => m.id === req.messageId);
                if (!target) {
                  const prefixMatches = allMessagesInTopic.filter((m) => m.id.startsWith(req.messageId));
                  if (prefixMatches.length > 1) {
                    results.push(
                      `Ambiguous ID prefix "${req.messageId}" matches ${prefixMatches.length} messages. Use a longer prefix or the full ID.`,
                    );
                    continue;
                  }
                  target = prefixMatches[0];
                }
                if (!target) {
                  results.push(`Message ${req.messageId} not found.`);
                  continue;
                }

                let content = target.content;
                if (req.startLine || req.endLine) {
                  const lines = content.split('\n');
                  const start = (req.startLine ?? 1) - 1;
                  const end = req.endLine ?? lines.length;
                  content = lines.slice(start, end).join('\n');
                }
                results.push(`[Message ${target.id}]\n${content}`);
              }
              return results.join('\n\n---\n\n');
            } catch (e) {
              return `Error reading messages: ${String(e)}`;
            }
          }
          if (toolName === 'list_messages') {
            try {
              const activeForkId = topic?.activeForkId ?? 'main';
              const allMessages = await athenaDb.messages
                .where('topicId')
                .equals(topicId)
                .and((m) => m.forkId === activeForkId)
                .sortBy('created');
              const lines = allMessages
                .filter((m) => !m.isDeleted && (m.type === 'user' || m.type === 'assistant'))
                .map((m) => {
                  const snippet = m.content.substring(0, 150).replace(/\n/g, ' ').trim();
                  return `[ID: ${m.id.slice(0, 8)}] ${m.type === 'user' ? 'User' : 'Assistant'}: "${snippet}..."`;
                });
              return `CHRONOLOGICAL DIRECTORY OF TOPIC "${topic?.name ?? 'Untitled'}":\n\n${lines.join('\n')}\n\nUse 'read_messages' with any of these IDs to see full content.`;
            } catch (e) {
              return `Error listing messages: ${String(e)}`;
            }
          }
          if (toolName === 'ask_user') {
            try {
              const parsedArgs = JSON.parse(argsJson) as { question?: string; context?: string };
              const question = parsedArgs.question ?? 'Could you clarify?';
              const context = parsedArgs.context ?? '';

              // Append the question to the assistant's visible content
              streamedContent += `\n\n${question}`;
              get().updateMessageStateOnly(assistantId, {
                content: streamedContent.replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, '').replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, ''),
              });

              // Return a Promise that resolves when the user submits an answer
              return new Promise<string>((resolve, reject) => {
                set({ pendingUserQuestion: { question, context, resolve, reject } });
              });
            } catch (e) {
              return `Error in ask_user: ${String(e)}`;
            }
          }
          return 'Tool not implemented.';
        },
        onToolLogCallback,
        ((): LlmTool[] => {
          const authState = useAuthStore.getState();
          const tools = [SCRATCHPAD_TOOL];
          if (authState.messageRetrievalEnabled) {
            tools.push(READ_MESSAGES_TOOL, LIST_MESSAGES_TOOL);
          }
          if (authState.askUserEnabled) {
            tools.push(ASK_USER_TOOL);
          }
          return tools;
        })(),
        get().webSearchEnabled,
        controller.signal,
      );

      const finalContent = primaryResult.finalContent;
      const totalPromptTokens = primaryResult.totalPromptTokens;
      const totalCompletionTokens = primaryResult.totalCompletionTokens;
      const lastResult = primaryResult.lastResult;
      const finalTotalCost = calculateCostSEK(selectedModel, totalPromptTokens, totalCompletionTokens, lastResult.promptTokensDetails);

      const debugPayload: LlmDebugPayload = {
        rawContent: lastResult.rawContent,
        responseId: lastResult.responseId,
        actualModel: lastResult.actualModel,
        systemFingerprint: lastResult.systemFingerprint,
        finishReason: lastResult.finishReason,
        usageDetails: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          cachedTokens: lastResult.promptTokensDetails?.cached_tokens,
          reasoningTokens: lastResult.completionTokensDetails?.reasoning_tokens,
          cacheCreationTokens: lastResult.cacheCreationTokens,
          cacheReadTokens: lastResult.cacheReadTokens,
        },
        toolLoopTrace: primaryResult.toolLoopTrace,
        timestamp: new Date().toISOString(),
      };

      // ── Verification: Main chat stream ──
      if (!finalContent.trim()) console.warn('[verify:chat] Assistant response was empty');
      if (totalPromptTokens === 0) console.warn('[verify:chat] promptTokens is 0 — possible usage tracking issue');
      if (totalCompletionTokens === 0) console.warn('[verify:chat] completionTokens is 0 — possible usage tracking issue');
      if (finalTotalCost <= 0) console.warn('[verify:chat] Calculated cost is 0 — model:', selectedModel.id);
      console.debug(
        '[verify:chat] model=%s prompt=%d completion=%d cost=%f latency=%dms context_messages=%d',
        selectedModel.id,
        totalPromptTokens,
        totalCompletionTokens,
        finalTotalCost,
        Date.now() - loopStartTime,
        llmContext.length,
      );

      // ── Fallback: detect inline clarification questions when ask_user tool wasn't called ──
      const askUserWasCalled = get().pendingUserQuestion != null;
      if (useAuthStore.getState().askUserEnabled && !askUserWasCalled && looksLikeClarificationQuestion(finalContent)) {
        console.debug('[ask_user:fallback] Detected inline clarification question — activating answer mode');
        const capturedTopicId = topicId;
        set({
          pendingUserQuestion: {
            question: finalContent.trim(),
            context: 'Fallback: model asked inline instead of using ask_user tool.',
            resolve: (answer: string) => {
              set({ pendingUserQuestion: null });
              void get().sendMessageStream(answer, capturedTopicId);
            },
            reject: () => {
              set({ pendingUserQuestion: null });
            },
          },
        });
      }

      // 5. Finalize DB Updates in atomic transaction
      const latencyMs = Date.now() - loopStartTime;
      const userPatch = {
        promptTokens: totalPromptTokens,
        totalCost: finalTotalCost,
        failed: false,
      };
      const assistantPatch = {
        content: finalContent
          .replace(/<!--\s*persist:\s*[\s\S]*?(-->|$)/gi, '')
          .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, '')
          .trim(),
        reasoning: streamedThinking.trim(),
        completionTokens: totalCompletionTokens,
        totalCost: finalTotalCost,
        failed: false,
        latencyMs,
        model: selectedModel.apiModelId,
        rawResponse: JSON.stringify(debugPayload),
      };

      await athenaDb.transaction('rw', athenaDb.messages, async () => {
        await athenaDb.messages.update(userMessage.id, userPatch);
        await athenaDb.messages.update(assistantId, assistantPatch);
      });

      // Fire-and-forget embedding for the finalized assistant response
      if (embeddingService.isReady && assistantPatch.content.trim()) {
        void embeddingService
          .generateEmbedding(assistantPatch.content)
          .then((vector) => athenaDb.messages.update(assistantId, { embedding: vector }));
      }

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

      // Fire-and-forget summarization for user and assistant messages
      if (!isRetry) {
        void get().maybeSummarize(userMessage.id, userMessage.content);
      }
      void get().maybeSummarize(assistantId, assistantPatch.content, undefined, [
        ...llmContext,
        { role: 'assistant', content: assistantPatch.content },
      ]);

      void topicStoreState.generateTopicName(topicId, content);

      // Generate reply predictions if enabled
      const { replyPredictionEnabled, replyPredictionModel } = useAuthStore.getState();
      if (replyPredictionEnabled) {
        set({ isSuggestionsLoading: true });
        void (async (): Promise<void> => {
          try {
            const suggestionContext: LlmMessage[] =
              replyPredictionModel === 'same'
                ? [
                    ...llmContext,
                    { role: 'assistant', content: assistantPatch.content },
                    {
                      role: 'user',
                      content:
                        'Based on this conversation, suggest exactly 3 short follow-up questions the user might want to ask next. Reply with ONLY a JSON array of 3 strings. No explanation, no markdown, just the raw JSON array.',
                    },
                  ]
                : [
                    { role: 'user', content },
                    { role: 'assistant', content: assistantPatch.content },
                    {
                      role: 'user',
                      content:
                        'Based on this conversation, suggest exactly 3 short follow-up questions the user might want to ask next. Reply with ONLY a JSON array of 3 strings. No explanation, no markdown, just the raw JSON array.',
                    },
                  ];

            let suggestions: string[] | null = null;

            if (replyPredictionModel === 'local') {
              // Use local LLM via llmSuggestionService with a full instruct prompt
              const prompt =
                `<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n` +
                `<|im_start|>user\nConversation summary:\nUser: ${content.slice(-300)}\nAssistant: ${assistantPatch.content.slice(-300)}\n\n` +
                `List exactly 3 short follow-up questions the user might ask next. Reply with ONLY a JSON array of 3 strings, e.g. ["Q1","Q2","Q3"].<|im_end|>\n` +
                `<|im_start|>assistant\n<think>\n</think>\n`;
              const raw = await (llmSuggestionService.getCompletion as (p: string, t: number) => Promise<string>)(prompt, 150);
              if (raw.trim()) {
                const jsonMatch = raw.match(/\[[\s\S]*?\]/);
                if (jsonMatch) {
                  try {
                    const parsed = JSON.parse(jsonMatch[0]) as unknown;
                    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
                      suggestions = (parsed as string[]).slice(0, 3);
                    }
                  } catch {
                    // fall through to line splitting
                  }
                }
                if (!suggestions) {
                  const lines = raw
                    .split(/\n|\d+[.)]/)
                    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
                    .filter((s) => s.length > 5)
                    .slice(0, 3);
                  if (lines.length > 0) suggestions = lines;
                }
              }
            } else {
              const targetModel =
                replyPredictionModel === 'same'
                  ? selectedModel
                  : (useProviderStore.getState().models.find((m) => m.id === replyPredictionModel || m.apiModelId === replyPredictionModel) ??
                    selectedModel);
              const result = await askLlm(targetModel, 0.7, suggestionContext);
              const raw = result.content.trim();
              const jsonMatch = raw.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as unknown;
                if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
                  suggestions = (parsed as string[]).slice(0, 3);
                }
              }

              // ── Verification: Reply prediction ──
              if (!jsonMatch) console.warn('[verify:replies] Failed to parse JSON array from response:', raw.slice(0, 200));
              else if (!suggestions || suggestions.length === 0)
                console.warn('[verify:replies] Parsed JSON but got 0 suggestions:', raw.slice(0, 200));
              else if (suggestions.length < 3) console.warn('[verify:replies] Expected 3 suggestions, got %d', suggestions.length);
              console.debug(
                '[verify:replies] model=%s prompt_tokens=%d context_messages=%d',
                targetModel.id,
                result.promptTokens,
                suggestionContext.length,
              );
            }

            if (suggestions && suggestions.length > 0) {
              set({ pendingSuggestions: suggestions, isSuggestionsLoading: false });
            } else {
              set({ isSuggestionsLoading: false });
            }
          } catch (err) {
            // Suggestion errors are non-critical; log for diagnostics but don't surface to the user
            console.warn('Failed to generate reply suggestions:', err);
            set({ isSuggestionsLoading: false });
          }
        })();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('LLM request failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('LLM request failed', msg);

      await get().updateMessage(userMessage.id, { failed: true });
      await get().updateMessage(assistantId, { isDeleted: true });
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
      .find((m) => m.type === 'user');

    if (!userMsg) return;

    // Call sendMessageStream with the user message content and ID as retry
    await get().sendMessageStream(userMsg.content, currentTopicId, userMsg.id);
  },
  stopSending: async (): Promise<string | null> => {
    const { abortController, currentRequestMessageIds, currentTopicId, messagesByTopic, pendingUserQuestion } = get();

    // Reject any pending ask_user promise before aborting
    if (pendingUserQuestion) {
      pendingUserQuestion.reject(new DOMException('Aborted', 'AbortError'));
      set({ pendingUserQuestion: null });
    }

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
          [currentTopicId]: (state.messagesByTopic[currentTopicId] ?? []).filter((m) => m.id !== userMessageId && m.id !== assistantMessageId),
        },
      }));

      return content;
    }

    set({ sending: false, abortController: null, currentRequestMessageIds: null });
    return null;
  },
  maybeSummarize: async (messageId: string, content: string, force = false, contextMessages?: LlmMessage[]): Promise<void> => {
    const { aiSummaryEnabled } = useAuthStore.getState();
    const { summarizingMessageIds } = get();
    if (!force && (!aiSummaryEnabled || content.length <= 250)) return;
    if (summarizingMessageIds.has(messageId)) return;

    set((state) => ({
      summarizingMessageIds: new Set(state.summarizingMessageIds).add(messageId),
    }));

    // Clear any previous failure state when retrying
    set((state) => {
      const next = new Set(state.failedSummaryMessageIds);
      next.delete(messageId);
      return { failedSummaryMessageIds: next };
    });
    summarizeQueue = summarizeQueue.then(() => get()._runSummarize(messageId, content, contextMessages ? [...contextMessages] : undefined));
    await summarizeQueue;
  },

  _runSummarize: async (messageId: string, content: string, contextMessages?: LlmMessage[]): Promise<void> => {
    const { llmModelSelected, llmModelDownloadStatus, summaryModel } = useAuthStore.getState();
    const isLocal = summaryModel === 'local';
    const { selectedModel } = get();
    const useCacheContext = !isLocal && contextMessages != null;

    if (isLocal) {
      const localModelId: string = llmModelSelected === 'qwen3.5-2b' ? 'onnx-community/Qwen3.5-2B-ONNX' : 'onnx-community/Qwen3.5-0.8B-ONNX';
      if (llmModelDownloadStatus[localModelId] !== 'downloaded') {
        useNotificationStore.getState().addNotification('Local LLM model not downloaded. Please go to Settings to download it.', 'warning');
        set((state) => {
          const next = new Set(state.summarizingMessageIds);
          next.delete(messageId);
          return { summarizingMessageIds: next };
        });
        return;
      }
    }

    try {
      // Always read from DB to get full content — message.content in context may be truncated
      const dbMessage = await athenaDb.messages.get(messageId);
      const fullContent = dbMessage?.content ?? content;
      const safeContent = fullContent.length > 1500 ? fullContent.slice(0, 1500) + '... (truncated)' : fullContent;

      const summaryWordLimit = Math.max(8, Math.min(30, Math.floor(fullContent.length / 20)));

      let rawSummary: string;

      if (isLocal) {
        // Pre-fill the assistant turn with an empty <think> block to force Qwen3
        // into non-thinking mode, skipping the reasoning phase entirely.
        const prompt =
          `<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n` +
          `<|im_start|>user\nProvide a short summary (about ${summaryWordLimit} words) of the following text:\n\n${safeContent}<|im_end|>\n` +
          `<|im_start|>assistant\n<think>\n</think>\n`;
        rawSummary = await llmSuggestionService.getCompletion(prompt, 50);
        // Strip Qwen3 <think>...</think> reasoning blocks from the output
        rawSummary = rawSummary
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<think>[\s\S]*/gi, '')
          .trim();
      } else {
        const cloudModel = selectedModel;
        const messages: LlmMessage[] = useCacheContext
          ? [
              ...contextMessages,
              { role: 'user', content: `Summarize your last reply in about ${summaryWordLimit} words. Just the summary, no explanation.` },
            ]
          : [
              { role: 'system', content: `Reply with a short summary of about ${summaryWordLimit} words. No explanation, just the summary.` },
              { role: 'user', content: `Summarize this:\n\n${safeContent}` },
            ];
        const result = await askLlm(cloudModel, 0.3, messages);
        rawSummary = result.content;

        // ── Verification: Summary generation ──
        if (!rawSummary.trim()) console.warn('[verify:summary] Cloud summary returned empty for message:', messageId);
        else if (rawSummary.trim().split(/\s+/).length > summaryWordLimit * 2)
          console.warn(
            '[verify:summary] Summary too long (%d words, limit was %d):',
            rawSummary.trim().split(/\s+/).length,
            summaryWordLimit,
            rawSummary,
          );
        if (useCacheContext) {
          console.debug('[verify:summary] Cache path — prompt_tokens=%d context_messages=%d', result.promptTokens, messages.length);
        } else {
          console.debug('[verify:summary] Standalone path — prompt_tokens=%d', result.promptTokens);
        }
      }

      if (rawSummary.trim()) {
        const cleanSummary = rawSummary
          .trim()
          .replace(/^Summary:\s*/i, '')
          .replace(/^Here is a summary:\s*/i, '')
          .replace(/^Assistant:\s*/i, '')
          .replace(/^"(.*)"$/, '$1')
          .trim();

        if (cleanSummary.length < 2) {
          useNotificationStore.getState().addNotification('Generated summary was empty or too short.', 'warning');
          return;
        }

        await athenaDb.messages.update(messageId, { summary: cleanSummary });

        set((state) => {
          const { currentTopicId, messagesByTopic } = state;
          // Remove from failed set on successful summarize to prevent unbounded growth
          const nextFailed = new Set(state.failedSummaryMessageIds);
          nextFailed.delete(messageId);
          if (!currentTopicId || !messagesByTopic[currentTopicId]) return { failedSummaryMessageIds: nextFailed };

          return {
            failedSummaryMessageIds: nextFailed,
            messagesByTopic: {
              ...messagesByTopic,
              [currentTopicId]: (messagesByTopic[currentTopicId] ?? []).map((m) => (m.id === messageId ? { ...m, summary: cleanSummary } : m)),
            },
          };
        });
      } else {
        useNotificationStore.getState().addNotification('AI returned an empty summary. Try again.', 'warning');
        set((state) => ({ failedSummaryMessageIds: new Set(state.failedSummaryMessageIds).add(messageId) }));
      }
    } catch (err) {
      console.warn('Failed to generate summary for message', messageId, err);
      set((state) => ({ failedSummaryMessageIds: new Set(state.failedSummaryMessageIds).add(messageId) }));
    } finally {
      set((state) => {
        const next = new Set(state.summarizingMessageIds);
        next.delete(messageId);
        return { summarizingMessageIds: next };
      });
    }
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
