import { create } from 'zustand';
import { athenaDb, DebatePhase, Message } from '../database/AthenaDb';
import { ChatModel, calculateCostSEK, getAvailableModels, getDefaultModel } from '../components/ModelSelector';
import { askLlmStream, LlmMessage } from '../services/llmService';
import { useTopicStore } from './TopicStore';
import { useNotificationStore } from './NotificationStore';
import { useAuthStore } from './AuthStore';
import { useChatStore } from './ChatStore';

interface DebateState {
  debateModelA: ChatModel | null;
  debateModelB: ChatModel | null;
  debateSending: boolean;
  currentPhase: 'idle' | DebatePhase;
  abortController: AbortController | null;
  streamingContentA: string;
  streamingContentB: string;
  streamingConsensus: string;

  setDebateModelA: (model: ChatModel, topicId: string) => void;
  setDebateModelB: (model: ChatModel, topicId: string) => void;
  initDebateModels: (topicId: string) => void;
  sendDebateRound: (question: string, topicId: string) => Promise<void>;
  continueDebate: (topicId: string) => Promise<void>;
  stopDebate: () => void;
}

const DEBATE_TEMPERATURE = 1.0;

function buildSystemMessage(customInstructions: string): LlmMessage | null {
  const trimmed = customInstructions.trim();
  if (!trimmed) return null;
  return { role: 'system', content: trimmed };
}

async function persistMessage(msg: Message): Promise<void> {
  await athenaDb.messages.add(msg);
}

async function updateMessage(id: string, patch: Partial<Message>): Promise<void> {
  await athenaDb.messages.update(id, patch);
}

async function refreshDebateMessages(topicId: string): Promise<void> {
  const all = await athenaDb.messages
    .where('topicId')
    .equals(topicId)
    .and((m) => m.forkId === 'main')
    .sortBy('created');
  useChatStore.setState((state) => ({
    messagesByTopic: { ...state.messagesByTopic, [topicId]: all },
  }));
}

async function runDebatePhase(
  phase: DebatePhase,
  messagesA: LlmMessage[],
  messagesB: LlmMessage[],
  parentIdA: string,
  parentIdB: string,
  debateModelA: ChatModel,
  debateModelB: ChatModel,
  topicId: string,
  controller: AbortController,
  setStore: (partial: Partial<DebateState>) => void,
): Promise<{ msgIdA: string; msgIdB: string; contentA: string; contentB: string }> {
  const msgIdA = crypto.randomUUID();
  const msgIdB = crypto.randomUUID();
  const phaseNow = new Date().toISOString();

  const placeholderA: Message = {
    id: msgIdA,
    topicId,
    forkId: 'main',
    type: 'assistant',
    content: '',
    created: phaseNow,
    isDeleted: false,
    includeInContext: false,
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    model: debateModelA.apiModelId,
    debateSide: 'left',
    debatePhase: phase,
    parentMessageId: parentIdA,
  };
  const placeholderB: Message = {
    id: msgIdB,
    topicId,
    forkId: 'main',
    type: 'assistant',
    content: '',
    created: phaseNow,
    isDeleted: false,
    includeInContext: false,
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    model: debateModelB.apiModelId,
    debateSide: 'right',
    debatePhase: phase,
    parentMessageId: parentIdB,
  };

  await Promise.all([persistMessage(placeholderA), persistMessage(placeholderB)]);

  let accA = '';
  let accB = '';

  const [resultA, resultB] = await Promise.all([
    askLlmStream(
      debateModelA,
      DEBATE_TEMPERATURE,
      messagesA,
      (token) => {
        accA += token;
        setStore({ streamingContentA: accA });
      },
      undefined,
      undefined,
      false,
      controller.signal,
    ),
    askLlmStream(
      debateModelB,
      DEBATE_TEMPERATURE,
      messagesB,
      (token) => {
        accB += token;
        setStore({ streamingContentB: accB });
      },
      undefined,
      undefined,
      false,
      controller.signal,
    ),
  ]);

  const costA = calculateCostSEK(debateModelA, resultA.promptTokens, resultA.completionTokens, resultA.promptTokensDetails);
  const costB = calculateCostSEK(debateModelB, resultB.promptTokens, resultB.completionTokens, resultB.promptTokensDetails);

  await Promise.all([
    updateMessage(msgIdA, {
      content: resultA.content,
      promptTokens: resultA.promptTokens,
      completionTokens: resultA.completionTokens,
      totalCost: costA,
      reasoning: resultA.reasoning,
    }),
    updateMessage(msgIdB, {
      content: resultB.content,
      promptTokens: resultB.promptTokens,
      completionTokens: resultB.completionTokens,
      totalCost: costB,
      reasoning: resultB.reasoning,
    }),
  ]);

  return { msgIdA, msgIdB, contentA: resultA.content, contentB: resultB.content };
}

export const useDebateStore = create<DebateState>((set, get) => ({
  debateModelA: null,
  debateModelB: null,
  debateSending: false,
  currentPhase: 'idle',
  abortController: null,
  streamingContentA: '',
  streamingContentB: '',
  streamingConsensus: '',

  setDebateModelA: (model, topicId): void => {
    set({ debateModelA: model });
    void athenaDb.topics.update(topicId, { debateModelAId: model.id });
    useTopicStore.setState((s) => ({
      topics: s.topics.map((t) => (t.id === topicId ? { ...t, debateModelAId: model.id } : t)),
    }));
  },

  setDebateModelB: (model, topicId): void => {
    set({ debateModelB: model });
    void athenaDb.topics.update(topicId, { debateModelBId: model.id });
    useTopicStore.setState((s) => ({
      topics: s.topics.map((t) => (t.id === topicId ? { ...t, debateModelBId: model.id } : t)),
    }));
  },

  initDebateModels: (topicId): void => {
    const topic = useTopicStore.getState().topics.find((t) => t.id === topicId);
    const available = getAvailableModels();
    if (available.length === 0) return;

    const defaultModel = getDefaultModel();
    const findModel = (id: string | undefined): ChatModel => (id ? available.find((m) => m.id === id) : undefined) ?? defaultModel;

    set({
      debateModelA: findModel(topic?.debateModelAId),
      debateModelB: findModel(topic?.debateModelBId),
    });
  },

  sendDebateRound: async (question, topicId): Promise<void> => {
    if (get().debateSending) return;

    const { debateModelA, debateModelB } = get();
    if (!debateModelA || !debateModelB) return;

    const controller = new AbortController();
    set({ debateSending: true, abortController: controller, streamingContentA: '', streamingContentB: '', streamingConsensus: '' });

    const now = new Date().toISOString();
    const customInstructions = useAuthStore.getState().customInstructions;
    const systemMsg = buildSystemMessage(customInstructions);

    const userMessageId = crypto.randomUUID();
    const userMessage: Message = {
      id: userMessageId,
      topicId,
      forkId: 'main',
      type: 'user',
      content: question.trim(),
      created: now,
      isDeleted: false,
      includeInContext: false,
      failed: false,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    };
    await persistMessage(userMessage);

    // Update topic store so UI sees the new message immediately
    useTopicStore.setState((s) => ({
      topics: s.topics.map((t) => (t.id === topicId ? { ...t, updatedOn: now } : t)),
    }));

    const runPhase = (
      phase: DebatePhase,
      messagesA: LlmMessage[],
      messagesB: LlmMessage[],
      parentIdA: string,
      parentIdB: string,
    ): Promise<{ msgIdA: string; msgIdB: string; contentA: string; contentB: string }> =>
      runDebatePhase(phase, messagesA, messagesB, parentIdA, parentIdB, debateModelA, debateModelB, topicId, controller, set);

    try {
      const baseMessages = (msgs: LlmMessage[]): LlmMessage[] => (systemMsg ? [systemMsg, ...msgs] : msgs);

      // Refresh messages so the user message is visible immediately
      await refreshDebateMessages(topicId);

      // --- Phase 1: Answer ---
      set({ currentPhase: 'answer' });
      const questionMsg: LlmMessage = { role: 'user', content: question.trim() };
      const {
        msgIdA: answerIdA,
        msgIdB: answerIdB,
        contentA: answerA,
        contentB: answerB,
      } = await runPhase('answer', baseMessages([questionMsg]), baseMessages([questionMsg]), userMessageId, userMessageId);
      set({ streamingContentA: '', streamingContentB: '' });
      await refreshDebateMessages(topicId);

      // --- Phase 2: Review (each model reviews the other's answer) ---
      set({ currentPhase: 'review' });
      const reviewPromptA: LlmMessage = {
        role: 'user',
        content: `Here is the original question:\n\n${question.trim()}\n\nAnother AI model gave this answer:\n\n${answerB}\n\nPlease critically review this answer. Point out any errors, weaknesses, or areas for improvement.`,
      };
      const reviewPromptB: LlmMessage = {
        role: 'user',
        content: `Here is the original question:\n\n${question.trim()}\n\nAnother AI model gave this answer:\n\n${answerA}\n\nPlease critically review this answer. Point out any errors, weaknesses, or areas for improvement.`,
      };
      const {
        msgIdA: reviewIdA,
        msgIdB: reviewIdB,
        contentA: reviewForB,
        contentB: reviewForA,
      } = await runPhase('review', baseMessages([reviewPromptA]), baseMessages([reviewPromptB]), answerIdA, answerIdB);
      set({ streamingContentA: '', streamingContentB: '' });
      await refreshDebateMessages(topicId);

      // --- Phase 3: Final answer (each model incorporates the review it received) ---
      set({ currentPhase: 'final' });
      const finalPromptA: LlmMessage = {
        role: 'user',
        content: `Here is the original question:\n\n${question.trim()}\n\nYour initial answer was:\n\n${answerA}\n\nAnother AI reviewed your answer and said:\n\n${reviewForA}\n\nConsidering this review, please provide your final answer. If you find the review helpful, incorporate the feedback. If you disagree, explain why and maintain your position.`,
      };
      const finalPromptB: LlmMessage = {
        role: 'user',
        content: `Here is the original question:\n\n${question.trim()}\n\nYour initial answer was:\n\n${answerB}\n\nAnother AI reviewed your answer and said:\n\n${reviewForB}\n\nConsidering this review, please provide your final answer. If you find the review helpful, incorporate the feedback. If you disagree, explain why and maintain your position.`,
      };
      await runPhase('final', baseMessages([finalPromptA]), baseMessages([finalPromptB]), reviewIdA, reviewIdB);
      set({ streamingContentA: '', streamingContentB: '' });
      await refreshDebateMessages(topicId);

      // --- Phase 4: Consensus ---
      set({ currentPhase: 'consensus' });
      const allFinalMsgs = await athenaDb.messages
        .where('topicId')
        .equals(topicId)
        .and((m) => m.debatePhase === 'final' && !m.isDeleted)
        .sortBy('created');
      const latestFinalA = allFinalMsgs.filter((m) => m.debateSide === 'left').pop();
      const latestFinalB = allFinalMsgs.filter((m) => m.debateSide === 'right').pop();
      const finalTextA = latestFinalA?.content ?? answerA;
      const finalTextB = latestFinalB?.content ?? answerB;

      const consensusId = crypto.randomUUID();
      const consensusPlaceholder: Message = {
        id: consensusId,
        topicId,
        forkId: 'main',
        type: 'assistant',
        content: '',
        created: new Date().toISOString(),
        isDeleted: false,
        includeInContext: false,
        failed: false,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
        model: debateModelA.apiModelId,
        debatePhase: 'consensus',
        parentMessageId: userMessageId,
      };
      await persistMessage(consensusPlaceholder);

      let accConsensus = '';
      const consensusPrompt: LlmMessage = {
        role: 'user',
        content: `Here is the original question:\n\n${question.trim()}\n\nTwo AI models debated this question. Here are their final answers:\n\n**Model A's final answer:**\n${finalTextA}\n\n**Model B's final answer:**\n${finalTextB}\n\nCan these two answers be reconciled into a short consensus? If the models largely agree, provide a brief (3-5 line) consensus answer. If they fundamentally disagree on important points, briefly state where they diverge and note that both full answers should be read for the complete picture. Keep your response concise.`,
      };
      const consensusResult = await askLlmStream(
        debateModelA,
        DEBATE_TEMPERATURE,
        baseMessages([consensusPrompt]),
        (token) => {
          accConsensus += token;
          set({ streamingConsensus: accConsensus });
        },
        undefined,
        undefined,
        false,
        controller.signal,
      );
      const consensusCost = calculateCostSEK(
        debateModelA,
        consensusResult.promptTokens,
        consensusResult.completionTokens,
        consensusResult.promptTokensDetails,
      );
      await updateMessage(consensusId, {
        content: consensusResult.content,
        promptTokens: consensusResult.promptTokens,
        completionTokens: consensusResult.completionTokens,
        totalCost: consensusCost,
        reasoning: consensusResult.reasoning,
      });
      set({ streamingConsensus: '' });
      await refreshDebateMessages(topicId);

      // Update topic timestamp and generate name
      const doneNow = new Date().toISOString();
      await athenaDb.topics.update(topicId, { updatedOn: doneNow });
      const topicStoreState = useTopicStore.getState();
      useTopicStore.setState((s) => ({
        topics: s.topics.map((t) => (t.id === topicId ? { ...t, updatedOn: doneNow } : t)),
      }));

      // Generate topic name from the user's question (only for the first round)
      const topic = topicStoreState.topics.find((t) => t.id === topicId);
      if (topic?.name === 'New Debate') {
        void topicStoreState.generateTopicName(topicId, question.trim());
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Debate round failed', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Debate failed', message);
    } finally {
      set({ debateSending: false, currentPhase: 'idle', abortController: null });
    }
  },

  continueDebate: async (topicId): Promise<void> => {
    if (get().debateSending) return;

    const { debateModelA, debateModelB } = get();
    if (!debateModelA || !debateModelB) return;

    // Load all messages for this topic's last round
    const allMessages = await athenaDb.messages
      .where('topicId')
      .equals(topicId)
      .and((m) => m.forkId === 'main' && !m.isDeleted)
      .sortBy('created');
    const userMessages = allMessages.filter((m) => m.type === 'user');
    if (userMessages.length === 0) return;

    const lastUserMsg = userMessages[userMessages.length - 1];
    const question = lastUserMsg.content;
    const userMessageId = lastUserMsg.id;

    // Get assistant messages for this round (after the last user message)
    const lastUserIdx = allMessages.findIndex((m) => m.id === lastUserMsg.id);
    const roundMessages = allMessages.slice(lastUserIdx + 1).filter((m) => m.type === 'assistant');

    // Helpers to check phase completion
    const phaseMessages = (phase: DebatePhase): Message[] => roundMessages.filter((m) => m.debatePhase === phase && m.content.trim() !== '');
    const isPairedDone = (phase: DebatePhase): boolean => {
      const msgs = phaseMessages(phase);
      return msgs.some((m) => m.debateSide === 'left') && msgs.some((m) => m.debateSide === 'right');
    };

    const answerDone = isPairedDone('answer');
    const reviewDone = isPairedDone('review');
    const finalDone = isPairedDone('final');
    const consensusDone = phaseMessages('consensus').length > 0;

    if (answerDone && reviewDone && finalDone && consensusDone) return;

    // Delete messages from the first incomplete phase onward (dependent phases are invalid)
    const allPhases: DebatePhase[] = ['answer', 'review', 'final', 'consensus'];
    const doneFlags = [answerDone, reviewDone, finalDone, consensusDone];
    const firstIncomplete = doneFlags.indexOf(false);
    const phasesToClean = new Set<string>(allPhases.slice(firstIncomplete));
    const msgsToDelete = roundMessages.filter((m) => m.debatePhase != null && phasesToClean.has(m.debatePhase));
    await Promise.all(msgsToDelete.map((m) => athenaDb.messages.delete(m.id)));

    const controller = new AbortController();
    set({
      debateSending: true,
      abortController: controller,
      streamingContentA: '',
      streamingContentB: '',
      streamingConsensus: '',
    });

    const customInstructions = useAuthStore.getState().customInstructions;
    const systemMsg = buildSystemMessage(customInstructions);
    const baseMessages = (msgs: LlmMessage[]): LlmMessage[] => (systemMsg ? [systemMsg, ...msgs] : msgs);

    const runPhase = (
      phase: DebatePhase,
      msgsA: LlmMessage[],
      msgsB: LlmMessage[],
      parentA: string,
      parentB: string,
    ): Promise<{ msgIdA: string; msgIdB: string; contentA: string; contentB: string }> =>
      runDebatePhase(phase, msgsA, msgsB, parentA, parentB, debateModelA, debateModelB, topicId, controller, set);

    // Extract data from completed phases
    const answerLeft = phaseMessages('answer').find((m) => m.debateSide === 'left');
    const answerRight = phaseMessages('answer').find((m) => m.debateSide === 'right');
    const reviewLeft = phaseMessages('review').find((m) => m.debateSide === 'left');
    const reviewRight = phaseMessages('review').find((m) => m.debateSide === 'right');

    let answerA = answerLeft?.content ?? '';
    let answerB = answerRight?.content ?? '';
    let answerIdA = answerLeft?.id ?? userMessageId;
    let answerIdB = answerRight?.id ?? userMessageId;
    let reviewForA = reviewRight?.content ?? ''; // B reviewed A
    let reviewForB = reviewLeft?.content ?? ''; // A reviewed B
    let reviewIdA = reviewLeft?.id ?? answerIdA;
    let reviewIdB = reviewRight?.id ?? answerIdB;

    try {
      await refreshDebateMessages(topicId);

      if (!answerDone) {
        set({ currentPhase: 'answer' });
        const questionMsg: LlmMessage = { role: 'user', content: question.trim() };
        const result = await runPhase('answer', baseMessages([questionMsg]), baseMessages([questionMsg]), userMessageId, userMessageId);
        answerA = result.contentA;
        answerB = result.contentB;
        answerIdA = result.msgIdA;
        answerIdB = result.msgIdB;
        set({ streamingContentA: '', streamingContentB: '' });
        await refreshDebateMessages(topicId);
      }

      if (!reviewDone) {
        set({ currentPhase: 'review' });
        const reviewPromptA: LlmMessage = {
          role: 'user',
          content: `Here is the original question:\n\n${question.trim()}\n\nAnother AI model gave this answer:\n\n${answerB}\n\nPlease critically review this answer. Point out any errors, weaknesses, or areas for improvement.`,
        };
        const reviewPromptB: LlmMessage = {
          role: 'user',
          content: `Here is the original question:\n\n${question.trim()}\n\nAnother AI model gave this answer:\n\n${answerA}\n\nPlease critically review this answer. Point out any errors, weaknesses, or areas for improvement.`,
        };
        const result = await runPhase('review', baseMessages([reviewPromptA]), baseMessages([reviewPromptB]), answerIdA, answerIdB);
        reviewForB = result.contentA;
        reviewForA = result.contentB;
        reviewIdA = result.msgIdA;
        reviewIdB = result.msgIdB;
        set({ streamingContentA: '', streamingContentB: '' });
        await refreshDebateMessages(topicId);
      }

      if (!finalDone) {
        set({ currentPhase: 'final' });
        const finalPromptA: LlmMessage = {
          role: 'user',
          content: `Here is the original question:\n\n${question.trim()}\n\nYour initial answer was:\n\n${answerA}\n\nAnother AI reviewed your answer and said:\n\n${reviewForA}\n\nConsidering this review, please provide your final answer. If you find the review helpful, incorporate the feedback. If you disagree, explain why and maintain your position.`,
        };
        const finalPromptB: LlmMessage = {
          role: 'user',
          content: `Here is the original question:\n\n${question.trim()}\n\nYour initial answer was:\n\n${answerB}\n\nAnother AI reviewed your answer and said:\n\n${reviewForB}\n\nConsidering this review, please provide your final answer. If you find the review helpful, incorporate the feedback. If you disagree, explain why and maintain your position.`,
        };
        await runPhase('final', baseMessages([finalPromptA]), baseMessages([finalPromptB]), reviewIdA, reviewIdB);
        set({ streamingContentA: '', streamingContentB: '' });
        await refreshDebateMessages(topicId);
      }

      if (!consensusDone) {
        set({ currentPhase: 'consensus' });
        const allFinalMsgs = await athenaDb.messages
          .where('topicId')
          .equals(topicId)
          .and((m) => m.debatePhase === 'final' && !m.isDeleted)
          .sortBy('created');
        const latestFinalA = allFinalMsgs.filter((m) => m.debateSide === 'left').pop();
        const latestFinalB = allFinalMsgs.filter((m) => m.debateSide === 'right').pop();
        const finalTextA = latestFinalA?.content ?? answerA;
        const finalTextB = latestFinalB?.content ?? answerB;

        const consensusId = crypto.randomUUID();
        const consensusPlaceholder: Message = {
          id: consensusId,
          topicId,
          forkId: 'main',
          type: 'assistant',
          content: '',
          created: new Date().toISOString(),
          isDeleted: false,
          includeInContext: false,
          failed: false,
          promptTokens: 0,
          completionTokens: 0,
          totalCost: 0,
          model: debateModelA.apiModelId,
          debatePhase: 'consensus',
          parentMessageId: userMessageId,
        };
        await persistMessage(consensusPlaceholder);

        let accConsensus = '';
        const consensusPrompt: LlmMessage = {
          role: 'user',
          content: `Here is the original question:\n\n${question.trim()}\n\nTwo AI models debated this question. Here are their final answers:\n\n**Model A's final answer:**\n${finalTextA}\n\n**Model B's final answer:**\n${finalTextB}\n\nCan these two answers be reconciled into a short consensus? If the models largely agree, provide a brief (3-5 line) consensus answer. If they fundamentally disagree on important points, briefly state where they diverge and note that both full answers should be read for the complete picture. Keep your response concise.`,
        };
        const consensusResult = await askLlmStream(
          debateModelA,
          DEBATE_TEMPERATURE,
          baseMessages([consensusPrompt]),
          (token) => {
            accConsensus += token;
            set({ streamingConsensus: accConsensus });
          },
          undefined,
          undefined,
          false,
          controller.signal,
        );
        const consensusCost = calculateCostSEK(
          debateModelA,
          consensusResult.promptTokens,
          consensusResult.completionTokens,
          consensusResult.promptTokensDetails,
        );
        await updateMessage(consensusId, {
          content: consensusResult.content,
          promptTokens: consensusResult.promptTokens,
          completionTokens: consensusResult.completionTokens,
          totalCost: consensusCost,
          reasoning: consensusResult.reasoning,
        });
        set({ streamingConsensus: '' });
        await refreshDebateMessages(topicId);
      }

      // Update topic timestamp
      const doneNow = new Date().toISOString();
      await athenaDb.topics.update(topicId, { updatedOn: doneNow });
      useTopicStore.setState((s) => ({
        topics: s.topics.map((t) => (t.id === topicId ? { ...t, updatedOn: doneNow } : t)),
      }));
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Debate continuation failed', err);
      const message = err instanceof Error ? err.message : String(err);
      useNotificationStore.getState().addNotification('Debate continuation failed', message);
    } finally {
      set({ debateSending: false, currentPhase: 'idle', abortController: null });
    }
  },

  stopDebate: (): void => {
    const { abortController } = get();
    abortController?.abort();
    set({ debateSending: false, currentPhase: 'idle', abortController: null, streamingContentA: '', streamingContentB: '', streamingConsensus: '' });
  },
}));
