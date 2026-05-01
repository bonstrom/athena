import type { Fork, Message, MessageType, PredefinedPrompt, Topic } from '../database/AthenaDb';
import type { LlmProvider, UserChatModel } from '../types/provider';

export function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: 'msg-1',
    topicId: 'topic-1',
    forkId: 'main',
    type: 'user' as MessageType,
    content: 'Hello',
    isDeleted: false,
    includeInContext: false,
    created: '2026-01-01T00:00:00.000Z',
    failed: false,
    promptTokens: 0,
    completionTokens: 0,
    totalCost: 0,
    ...overrides,
  };
}

export function createTopic(overrides?: Partial<Topic>): Topic {
  return {
    id: 'topic-1',
    name: 'Test Topic',
    createdOn: '2026-01-01T00:00:00.000Z',
    updatedOn: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    ...overrides,
  };
}

export function createPredefinedPrompt(overrides?: Partial<PredefinedPrompt>): PredefinedPrompt {
  return {
    id: 'prompt-1',
    name: 'Test Prompt',
    content: 'You are a helpful assistant.',
    ...overrides,
  };
}

export function createUserChatModel(overrides?: Partial<UserChatModel>): UserChatModel {
  return {
    id: 'test-model',
    label: 'Test Model',
    apiModelId: 'test-model',
    providerId: 'test-provider',
    input: 0,
    cachedInput: 0,
    output: 0,
    streaming: false,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    supportsThinking: false,
    contextWindow: 128000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: false,
    enabled: true,
    ...overrides,
  };
}

export function createLlmProvider(overrides?: Partial<LlmProvider>): LlmProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    baseUrl: 'https://example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: '',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
    ...overrides,
  };
}

export function createFork(overrides?: Partial<Fork>): Fork {
  return {
    id: 'main',
    name: 'Main',
    createdOn: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
