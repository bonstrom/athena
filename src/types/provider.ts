import { SecurityUtils } from '../utils/security';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LlmProvider {
  id: string;
  name: string;
  baseUrl: string;
  messageFormat: 'openai' | 'anthropic';
  /** Encrypted API key (use SecurityUtils.decode before sending). */
  apiKeyEncrypted: string;
  supportsWebSearch: boolean;
  requiresReasoningFallback: boolean;
  /** Extra payload fields merged in on every request, serialized as JSON string. */
  payloadOverridesJson: string;
  /** Whether this provider was shipped as a built-in default. */
  isBuiltIn: boolean;
}

export interface UserChatModel {
  id: string;
  label: string;
  /** The model string sent to the API (e.g. "gpt-5.4-nano"). */
  apiModelId: string;
  providerId: string;
  input: number;
  cachedInput: number;
  output: number;
  streaming: boolean;
  supportsTemperature: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsFiles: boolean;
  contextWindow: number;
  /** Force this temperature value on every request (null = use user value). */
  forceTemperature: number | null;
  /** Enforce strict user/assistant alternation after the first system messages (for DeepSeek Reasoner). */
  enforceAlternatingRoles: boolean;
  /** Override max_tokens in the payload (null = provider/model default). */
  maxTokensOverride: number | null;
  /** Whether this model was shipped as a built-in default. */
  isBuiltIn: boolean;
  /** Whether this model is selectable in the chat. Defaults to true. */
  enabled: boolean;
  /**
   * Controls how thinking/reasoning content is extracted from the model's output.
   * - 'api-native' (default): Use the adapter's built-in extraction (reasoning_content / thinking blocks).
   * - 'tag-based': Strip configurable inline tags (e.g. <think>...</think>) from text content.
   * - 'none': Never extract reasoning; treat all output as regular content.
   */
  thinkingParseMode?: 'api-native' | 'tag-based' | 'none';
  /** Opening tag for 'tag-based' mode. Defaults to '<think>'. */
  thinkingOpenTag?: string;
  /** Closing tag for 'tag-based' mode. Defaults to '</think>'. */
  thinkingCloseTag?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getApiKey(provider: LlmProvider): string {
  return SecurityUtils.decode(provider.apiKeyEncrypted);
}

export function encodeApiKey(rawKey: string): string {
  return SecurityUtils.encode(rawKey);
}

export function getPayloadOverrides(provider: LlmProvider): Record<string, unknown> {
  if (!provider.payloadOverridesJson) return {};
  try {
    return JSON.parse(provider.payloadOverridesJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Default Providers ─────────────────────────────────────────────────────────

export const DEFAULT_PROVIDERS: Omit<LlmProvider, 'apiKeyEncrypted'>[] = [
  {
    id: 'builtin-openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    messageFormat: 'openai',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: true,
  },
  {
    id: 'builtin-deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    messageFormat: 'openai',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: true,
  },
  {
    id: 'builtin-google',
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    messageFormat: 'openai',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: true,
  },
  {
    id: 'builtin-moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
    messageFormat: 'openai',
    supportsWebSearch: true,
    requiresReasoningFallback: true,
    payloadOverridesJson: '',
    isBuiltIn: true,
  },
  {
    id: 'builtin-minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/anthropic/v1/messages',
    messageFormat: 'anthropic',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: JSON.stringify({ max_tokens: 4096 }),
    isBuiltIn: true,
  },
];

// ── Default Models ────────────────────────────────────────────────────────────

export const DEFAULT_MODELS: UserChatModel[] = [
  {
    id: 'builtin-deepseek-chat',
    label: 'Deepseek Chat',
    apiModelId: 'deepseek-chat',
    providerId: 'builtin-deepseek',
    input: 0.28,
    cachedInput: 0.028,
    output: 0.42,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    contextWindow: 64_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-deepseek-reasoner',
    label: 'Deepseek R',
    apiModelId: 'deepseek-reasoner',
    providerId: 'builtin-deepseek',
    input: 0.28,
    cachedInput: 0.028,
    output: 0.42,
    streaming: true,
    supportsTemperature: true,
    supportsTools: false,
    supportsVision: false,
    supportsFiles: false,
    contextWindow: 64_000,
    forceTemperature: null,
    enforceAlternatingRoles: true,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-gpt-5-4-nano',
    label: 'GPT-5.4 Nano',
    apiModelId: 'gpt-5.4-nano',
    providerId: 'builtin-openai',
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25,
    streaming: true,
    supportsTemperature: false,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-gemini-3-flash',
    label: 'Gemini 3 Flash Preview',
    apiModelId: 'gemini-3-flash-preview',
    providerId: 'builtin-google',
    input: 0.5,
    cachedInput: 0.05,
    output: 3,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 1_000_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-kimi-k2-5',
    label: 'Kimi 2.5',
    apiModelId: 'kimi-k2.5',
    providerId: 'builtin-moonshot',
    input: 0.6,
    cachedInput: 0.1,
    output: 3,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128_000,
    forceTemperature: 1,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-kimi-k2-6',
    label: 'Kimi 2.6',
    apiModelId: 'kimi-k2.6',
    providerId: 'builtin-moonshot',
    input: 0.95,
    cachedInput: 0.16,
    output: 4.0,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 262_144,
    forceTemperature: 1,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-gpt-5-4-mini',
    label: 'GPT-5.4 Mini',
    apiModelId: 'gpt-5.4-mini',
    providerId: 'builtin-openai',
    input: 0.75,
    cachedInput: 0.075,
    output: 4.5,
    streaming: true,
    supportsTemperature: false,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-kimi-k2-turbo',
    label: 'Kimi K2 Turbo Preview',
    apiModelId: 'kimi-k2-turbo-preview',
    providerId: 'builtin-moonshot',
    input: 1.15,
    cachedInput: 0.15,
    output: 8,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128_000,
    forceTemperature: 1,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-moonshot-v1-8k',
    label: 'Kimi v1 8k',
    apiModelId: 'moonshot-v1-8k',
    providerId: 'builtin-moonshot',
    input: 0.15,
    cachedInput: 0.015,
    output: 0.3,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    contextWindow: 8_000,
    forceTemperature: 0.6,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-gpt-5-4',
    label: 'GPT-5.4',
    apiModelId: 'gpt-5.4',
    providerId: 'builtin-openai',
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
    streaming: true,
    supportsTemperature: false,
    supportsTools: true,
    supportsVision: true,
    supportsFiles: true,
    contextWindow: 128_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
  {
    id: 'builtin-minimax-m2-7',
    label: 'MiniMax M2.7',
    apiModelId: 'MiniMax-M2.7',
    providerId: 'builtin-minimax',
    input: 0.3,
    cachedInput: 0.06,
    output: 1.2,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    contextWindow: 128_000,
    forceTemperature: null,
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: true,
    enabled: true,
  },
];
