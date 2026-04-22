import { calculateCostSEK, ChatModel } from '../components/ModelSelector';
import { useAuthStore } from '../store/AuthStore';
import { useProviderStore } from '../store/ProviderStore';
import { getApiKey as getProviderApiKey, getPayloadOverrides, LlmProvider } from '../types/provider';
import { estimateTokens } from './estimateTokens';

export type LlmContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | LlmContentPart[] | null;
  reasoning_content?: string;
  tool_calls?: { id: string; type: 'function' | 'builtin_function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmResult {
  content: string;
  rawContent: string;
  promptTokens: number;
  completionTokens: number;
  aiNote?: string | null;
  aiNoteAction?: 'append' | 'replace';
  promptTokensDetails?: { cached_tokens?: number };
  completionTokensDetails?: { reasoning_tokens?: number };
  toolCalls?: { id: string; type: 'function' | 'builtin_function'; function: { name: string; arguments: string } }[];
  searchCount: number;
  finishReason?: string;
  reasoning?: string;
  // Provider metadata
  responseId?: string;
  actualModel?: string;
  systemFingerprint?: string;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface ToolLoopIteration {
  iteration: number;
  llmResponse: {
    content: string;
    reasoning?: string;
    toolCalls?: { id: string; type: 'function' | 'builtin_function'; function: { name: string; arguments: string } }[];
    finishReason?: string;
  };
  toolResults: { toolCallId: string; toolName: string; result: string }[];
}

export interface LlmDebugPayload {
  rawContent: string;
  responseId?: string;
  actualModel?: string;
  systemFingerprint?: string;
  finishReason?: string;
  usageDetails: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
  toolLoopTrace: ToolLoopIteration[];
  timestamp: string;
}

export const SCRATCHPAD_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'update_scratchpad',
    description: 'Store or update information in your private long-term memory scratchpad.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to store.' },
        action: {
          type: 'string',
          enum: ['append', 'replace'],
          description: "'append' to add to existing memory, 'replace' to overwrite everything.",
        },
      },
      required: ['content', 'action'],
    },
  },
};

export const READ_MESSAGES_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'read_messages',
    description:
      'Retrieve full content or specific lines of historical messages by their IDs. Use this when a snippet or a truncated message (typically truncated to 500 chars) is not enough. Tip: Store IDs of critical messages (like working configs) in your scratchpad for future reference.',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              messageId: { type: 'string', description: 'The ID of the message to retrieve.' },
              startLine: { type: 'number', description: 'Optional: Start line number (1-indexed).' },
              endLine: { type: 'number', description: 'Optional: End line number.' },
            },
            required: ['messageId'],
          },
        },
      },
      required: ['messages'],
    },
  },
};

export const LIST_MESSAGES_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'list_messages',
    description:
      'Get a chronological directory of all messages in this topic (ID, role, and a short snippet). Use this to find relevant message IDs when the recent context is not enough.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

export const ASK_USER_TOOL: LlmTool = {
  type: 'function',
  function: {
    name: 'ask_user',
    description:
      'Ask the user a follow-up question when you need clarification or additional information to proceed. Use this when the available context and message history are insufficient and you cannot reasonably infer the answer. Ask at most one question per turn.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The specific question to ask the user.' },
        context: { type: 'string', description: 'Brief explanation of why you need this information.' },
      },
      required: ['question'],
    },
  },
};

export interface LlmTool {
  type: 'function' | 'builtin_function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface LlmPayload {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  stream: boolean;
  stream_options?: { include_usage: boolean };
  tools?: LlmTool[];
  thinking?: { type: 'enabled' | 'disabled' };
  max_tokens?: number;
}

// ── Provider lookup (replaces hardcoded PROVIDERS / MODEL_OVERRIDES) ─────────
export type ProviderId = string;

const MAX_TOOL_LOOP_ITERATIONS = 5;

function resolveProvider(model: ChatModel): LlmProvider {
  const store = useProviderStore.getState();
  const provider = store.getProviderForModel(model);
  if (!provider) throw new Error(`No provider found for model: ${model.id} (providerId: ${model.providerId})`);
  return provider;
}

function resolveModelAndProvider(model: ChatModel): { model: ChatModel; provider: LlmProvider } {
  const store = useProviderStore.getState();
  const availableModels = store.getAvailableModels();
  const resolvedModel =
    store.models.find((m) => m.id === model.id) ?? store.models.find((m) => m.apiModelId === model.apiModelId) ?? availableModels.at(0);

  if (!resolvedModel) {
    throw new Error('No models are configured. Add a model in Settings.');
  }

  const provider = store.getProviderForModel(resolvedModel);
  if (!provider) {
    throw new Error(`No provider found for model: ${resolvedModel.id} (providerId: ${resolvedModel.providerId})`);
  }

  return { model: resolvedModel, provider };
}

function buildAuthHeaders(provider: LlmProvider): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = getProviderApiKey(provider);
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

/** Enforce strict user/assistant alternation (for models with enforceAlternatingRoles). */
function filterAlternatingRoles(messages: LlmMessage[]): LlmMessage[] {
  const filtered: LlmMessage[] = [];
  let foundUser = false;
  let lastRole: 'user' | 'assistant' | 'tool' | null = null;

  for (const msg of messages) {
    if (msg.role === 'system') {
      filtered.push(msg);
    } else if (!foundUser && msg.role === 'user') {
      foundUser = true;
      lastRole = 'user';
      filtered.push(msg);
    } else if (foundUser) {
      if (msg.role === lastRole) continue;
      filtered.push(msg);
      if (msg.role === 'user' || msg.role === 'assistant') lastRole = msg.role;
    }
  }

  const firstContent = filtered.find((m) => m.role !== 'system');
  if (!firstContent || firstContent.role !== 'user') {
    throw new Error('Model with enforceAlternatingRoles requires the first non-system message to be from the user.');
  }
  return filtered;
}

// ── Anthropic-format helpers ──────────────────────────────────────────────────

/** Convert internal OpenAI-style tool definitions to Anthropic's schema. */
function toAnthropicTools(tools: LlmTool[]): { name: string; description?: string; input_schema: Record<string, unknown> }[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters ?? { type: 'object', properties: {} },
  }));
}

/**
 * Convert messages that contain OpenAI-style tool calls / tool results
 * into the Anthropic content-block format expected by `/anthropic/v1/messages`.
 * Non-system messages that had `role: 'tool'` become `role: 'user'` with a
 * `tool_result` content block; assistant messages with `tool_calls` get their
 * calls expressed as `tool_use` content blocks.
 */
function toAnthropicMessages(messages: LlmMessage[]): { role: 'user' | 'assistant'; content: unknown }[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            },
          ],
        };
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        const blocks: unknown[] = [];
        if (m.content) {
          blocks.push({ type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) });
        }
        for (const tc of m.tool_calls) {
          let input: unknown = {};
          try {
            input = JSON.parse(tc.function.arguments);
          } catch {
            input = {};
          }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
        return { role: 'assistant' as const, content: blocks };
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
      };
    });
}

// ── Message Format Adapters ───────────────────────────────────────────────────
interface ToolCall {
  id: string;
  type: 'function' | 'builtin_function';
  function: { name: string; arguments: string };
}

interface OpenAiStreamChunk {
  id?: string;
  model?: string;
  system_fingerprint?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  choices?: {
    finish_reason?: string;
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      tool_calls?: {
        index?: number;
        id?: string;
        type?: 'function' | 'builtin_function';
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

interface AnthropicStreamChunk {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type: string; text?: string; thinking?: string; partial_json?: string; stop_reason?: string };
  message?: { id?: string; model?: string; usage: { input_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
  usage?: { output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

interface ParsedResponse {
  content: string;
  reasoning: string;
  promptTokens: number;
  completionTokens: number;
  promptTokensDetails?: { cached_tokens?: number };
  completionTokensDetails?: { reasoning_tokens?: number };
  toolCalls?: ToolCall[];
  finishReason?: string;
  responseId?: string;
  actualModel?: string;
  systemFingerprint?: string;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

interface StreamState {
  accumulated: string;
  reasoning: string;
  promptTokens: number;
  completionTokens: number;
  promptTokensDetails?: { cached_tokens?: number };
  completionTokensDetails?: { reasoning_tokens?: number };
  toolCalls?: ToolCall[];
  finishReason?: string;
  done: boolean;
  responseId?: string;
  actualModel?: string;
  systemFingerprint?: string;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

interface IMessageAdapter {
  buildBody(payload: LlmPayload, stream: boolean): string;
  parseResponse(data: unknown): ParsedResponse;
  handleStreamChunk(parsed: unknown, state: StreamState, onToken?: (t: string) => void, onReasoning?: (t: string) => void): void;
  buildAssistantContextMsg(result: LlmResult, provider: LlmProvider): LlmMessage;
  buildToolResultContextMsg(tc: ToolCall, toolResult: string): LlmMessage;
}

const OpenAiAdapter: IMessageAdapter = {
  buildBody(payload, _stream): string {
    return JSON.stringify(payload);
  },

  parseResponse(data: unknown): ParsedResponse {
    const d = data as {
      id?: string;
      model?: string;
      system_fingerprint?: string;
      choices: {
        finish_reason?: string;
        message: {
          content: string;
          reasoning_content?: string;
          reasoning?: string;
          tool_calls?: { id?: string; type?: 'function' | 'builtin_function'; function: { name: string; arguments: string } }[];
        };
      }[];
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: { cached_tokens?: number };
        prompt_cache_hit_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };
    const message = d.choices[0].message;
    const finishReason = d.choices[0].finish_reason;
    const toolCalls = message.tool_calls?.map((tc, i) => ({
      id: tc.id ?? `call_${i}`,
      type: tc.type ?? 'function',
      function: tc.function,
    }));
    const content = toolCalls && toolCalls.length > 0 ? message.content : message.content.trim();
    const reasoning = (message.reasoning_content ?? message.reasoning ?? '').trim();
    return {
      content,
      reasoning,
      promptTokens: d.usage.prompt_tokens,
      completionTokens: d.usage.completion_tokens,
      promptTokensDetails:
        d.usage.prompt_tokens_details ?? (d.usage.prompt_cache_hit_tokens != null ? { cached_tokens: d.usage.prompt_cache_hit_tokens } : undefined),
      completionTokensDetails: d.usage.completion_tokens_details,
      toolCalls,
      finishReason,
      responseId: d.id,
      actualModel: d.model,
      systemFingerprint: d.system_fingerprint,
    };
  },

  handleStreamChunk(parsed: unknown, state: StreamState, onToken, onReasoning): void {
    const p = parsed as OpenAiStreamChunk;
    if (p.id && !state.responseId) state.responseId = p.id;
    if (p.model && !state.actualModel) state.actualModel = p.model;
    if (p.system_fingerprint && !state.systemFingerprint) state.systemFingerprint = p.system_fingerprint;
    if (p.usage) {
      state.promptTokens = p.usage.prompt_tokens;
      state.completionTokens = p.usage.completion_tokens;
      state.promptTokensDetails = p.usage.prompt_tokens_details;
      state.completionTokensDetails = p.usage.completion_tokens_details;
    }
    const choice = p.choices?.[0];
    if (choice?.finish_reason) state.finishReason = choice.finish_reason;
    const delta = choice?.delta;
    const token = delta?.content ?? '';
    state.accumulated += token;
    if (onToken && token) onToken(token);
    if (delta && (delta.reasoning_content !== undefined || delta.reasoning !== undefined)) {
      const rToken = delta.reasoning_content ?? delta.reasoning ?? '';
      state.reasoning += rToken;
      if (onReasoning && rToken) onReasoning(rToken);
    }
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!state.toolCalls) state.toolCalls = [];
        let existing: ToolCall | undefined = state.toolCalls[idx];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!existing) {
          existing = { id: tc.id ?? '', type: tc.type ?? 'function', function: { name: '', arguments: '' } };
          state.toolCalls[idx] = existing;
        }
        if (tc.id) existing.id = tc.id;
        if (tc.type) existing.type = tc.type;
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
      }
    }
  },

  buildAssistantContextMsg(result: LlmResult, provider: LlmProvider): LlmMessage {
    return {
      role: 'assistant',
      content: result.content || null,
      reasoning_content: result.reasoning || (provider.requiresReasoningFallback ? 'Thinking process hidden or not provided.' : undefined), // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
      tool_calls: result.toolCalls?.map((tc) => ({ id: tc.id, type: tc.type, function: tc.function })),
    };
  },

  buildToolResultContextMsg(tc: ToolCall, toolResult: string): LlmMessage {
    return { role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: toolResult };
  },
};

const AnthropicAdapter: IMessageAdapter = {
  buildBody(payload, stream): string {
    const anthropicMessages = toAnthropicMessages(payload.messages);
    return JSON.stringify({
      model: payload.model,
      messages: anthropicMessages,
      system: payload.messages.find((m) => m.role === 'system')?.content,
      max_tokens: payload.max_tokens ?? 4096,
      temperature: payload.temperature,
      stream,
      ...(payload.tools && payload.tools.length > 0 && { tools: toAnthropicTools(payload.tools) }),
    });
  },

  parseResponse(data: unknown): ParsedResponse {
    const d = data as {
      id?: string;
      model?: string;
      stop_reason?: string;
      content: { type: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
      usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
    };
    const textBlock = d.content.find((c) => c.type === 'text');
    const thinkingBlock = d.content.find((c) => c.type === 'thinking');
    const toolUseBlocks = d.content.filter((c) => c.type === 'tool_use');
    const toolCalls =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((b) => ({
            id: b.id ?? '',
            type: 'function' as const,
            function: { name: b.name ?? '', arguments: JSON.stringify(b.input ?? {}) },
          }))
        : undefined;
    return {
      content: textBlock?.text?.trim() ?? '',
      reasoning: thinkingBlock?.thinking?.trim() ?? '',
      promptTokens: d.usage.input_tokens,
      completionTokens: d.usage.output_tokens,
      toolCalls,
      finishReason: d.stop_reason,
      responseId: d.id,
      actualModel: d.model,
      cacheCreationTokens: d.usage.cache_creation_input_tokens,
      cacheReadTokens: d.usage.cache_read_input_tokens,
    };
  },

  handleStreamChunk(parsed: unknown, state: StreamState, onToken, onReasoning): void {
    const p = parsed as AnthropicStreamChunk;
    if (p.type === 'content_block_start') {
      const block = p.content_block;
      if (block?.type === 'tool_use') {
        if (!state.toolCalls) state.toolCalls = [];
        state.toolCalls[p.index ?? 0] = { id: block.id ?? '', type: 'function', function: { name: block.name ?? '', arguments: '' } };
      }
    } else if (p.type === 'content_block_delta') {
      const delta = p.delta;
      if (delta?.type === 'text_delta') {
        const token = delta.text ?? '';
        state.accumulated += token;
        if (onToken) onToken(token);
      } else if (delta?.type === 'thinking_delta') {
        const rToken = delta.thinking ?? '';
        state.reasoning += rToken;
        if (onReasoning) onReasoning(rToken);
      } else if (delta?.type === 'input_json_delta') {
        const idx: number = p.index ?? 0;
        if (state.toolCalls?.[idx]) {
          state.toolCalls[idx].function.arguments += delta.partial_json ?? '';
        }
      }
    } else if (p.type === 'message_start') {
      state.promptTokens = p.message?.usage.input_tokens ?? 0;
      if (p.message?.id && !state.responseId) state.responseId = p.message.id;
      if (p.message?.model && !state.actualModel) state.actualModel = p.message.model;
      if (p.message?.usage.cache_creation_input_tokens != null) state.cacheCreationTokens = p.message.usage.cache_creation_input_tokens;
      if (p.message?.usage.cache_read_input_tokens != null) state.cacheReadTokens = p.message.usage.cache_read_input_tokens;
    } else if (p.type === 'message_delta') {
      state.completionTokens = p.usage?.output_tokens ?? 0;
      if (p.delta?.stop_reason) state.finishReason = p.delta.stop_reason;
      if (p.usage?.cache_creation_input_tokens != null) state.cacheCreationTokens = p.usage.cache_creation_input_tokens;
      if (p.usage?.cache_read_input_tokens != null) state.cacheReadTokens = p.usage.cache_read_input_tokens;
    }
  },

  buildAssistantContextMsg(result: LlmResult, _provider: LlmProvider): LlmMessage {
    const blocks: unknown[] = [];
    if (result.content) blocks.push({ type: 'text', text: result.content });
    for (const tc of result.toolCalls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        input = {};
      }
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
    return {
      role: 'assistant',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      content: blocks as any,
      ...(result.reasoning && { reasoning_content: result.reasoning }),
    };
  },

  buildToolResultContextMsg(tc: ToolCall, toolResult: string): LlmMessage {
    return {
      role: 'user',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      content: [{ type: 'tool_result', tool_use_id: tc.id, content: toolResult }] as any,
    };
  },
};

function getAdapter(provider: LlmProvider): IMessageAdapter {
  return provider.messageFormat === 'anthropic' ? AnthropicAdapter : OpenAiAdapter;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildPayload(
  model: ChatModel,
  messages: LlmMessage[],
  stream: boolean,
  temperature: number,
  tools?: LlmTool[],
  webSearch?: boolean,
): LlmPayload {
  const { model: resolvedModel, provider: providerConfig } = resolveModelAndProvider(model);
  const filtered = resolvedModel.enforceAlternatingRoles ? filterAlternatingRoles(messages) : messages;
  const auth = useAuthStore.getState();
  const customInstructions = auth.customInstructions.trim();

  const finalMessages = filtered.map((msg) => ({ ...msg }));

  if (customInstructions) {
    if (finalMessages.length > 0 && finalMessages[0].role === 'system') {
      finalMessages[0] = {
        ...finalMessages[0],
        content: `${customInstructions}\n\n${typeof finalMessages[0].content === 'string' ? finalMessages[0].content : ''}`,
      };
    } else {
      finalMessages.unshift({ role: 'system', content: customInstructions });
    }
  }

  // Safety cap: drop oldest non-system messages until tokens fit within the user's max context budget
  // Also respects the hard model context window (whichever is smaller)
  const userTokenBudget = useAuthStore.getState().maxContextTokens;
  const tokenBudget = Math.min(userTokenBudget, Math.floor(resolvedModel.contextWindow * 0.9));
  while (finalMessages.length > 1) {
    const { promptTokens } = estimateTokens(finalMessages);
    if (promptTokens <= tokenBudget) break;
    // Find and remove the oldest non-system message
    const oldestNonSystemIndex = finalMessages.findIndex((m) => m.role !== 'system');
    if (oldestNonSystemIndex === -1) break; // all system messages — nothing safe to drop
    finalMessages.splice(oldestNonSystemIndex, 1);
  }

  const finalTools = [...(tools ?? [])];
  if (webSearch && providerConfig.supportsWebSearch) {
    finalTools.push({
      type: 'builtin_function',
      function: {
        name: '$web_search',
        description: "Search the internet for real-time information with Moonshot AI's built-in search.",
      },
    });
  }

  const resolvedTemperature = resolvedModel.forceTemperature != null ? resolvedModel.forceTemperature : temperature;

  const payloadOverrides = getPayloadOverrides(providerConfig);

  return {
    model: resolvedModel.apiModelId,
    messages: finalMessages.map((m) => ({
      role: m.role,
      content: m.content as string | (LlmContentPart & { type: 'text' | 'image_url' })[] | null,
      ...(m.role === 'assistant' && m.reasoning_content && { reasoning_content: m.reasoning_content }),
      ...(m.role !== 'assistant' && m.reasoning_content !== undefined && { reasoning_content: m.reasoning_content }),
      ...(m.tool_calls && { tool_calls: m.tool_calls }),
      ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      ...(m.name && { name: m.name }),
    })),
    stream,
    ...(resolvedModel.supportsTemperature && { temperature: resolvedTemperature }),
    ...(stream && { stream_options: { include_usage: true } }),
    ...payloadOverrides,
    ...(resolvedModel.supportsTools && finalTools.length > 0 && { tools: finalTools }),
    ...(resolvedModel.maxTokensOverride != null && { max_tokens: resolvedModel.maxTokensOverride }),
  };
}

export function filterMessagesForModel(model: ChatModel, messages: LlmMessage[]): LlmMessage[] {
  return model.enforceAlternatingRoles ? filterAlternatingRoles(messages) : messages;
}

export async function generateMinimaxImage(prompt: string, aspectRatio = '1:1', signal?: AbortSignal): Promise<{ base64: string }> {
  const url = 'https://api.minimax.io/v1/image_generation';
  const minimaxProvider = useProviderStore.getState().providers.find((p) => p.id === 'builtin-minimax');
  const key = minimaxProvider ? getProviderApiKey(minimaxProvider) : '';

  const payload = {
    model: 'image-01',
    prompt: prompt,
    aspect_ratio: aspectRatio,
    response_format: 'base64',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Minimax Image Error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { data: { image_base64: string[] } };
  return { base64: data.data.image_base64[0] };
}

export async function generateMinimaxMusic(prompt: string, lyrics = '', signal?: AbortSignal): Promise<{ audioHex: string }> {
  const url = 'https://api.minimax.io/v1/music_generation';
  const minimaxProvider = useProviderStore.getState().providers.find((p) => p.id === 'builtin-minimax');
  const key = minimaxProvider ? getProviderApiKey(minimaxProvider) : '';

  const payload = {
    model: 'music-2.6',
    prompt: prompt,
    lyrics: lyrics,
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3',
    },
    output_format: 'hex',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Minimax Music Error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { base_resp?: { status_code: number; status_msg?: string }; data?: { audio?: string }; audio?: string };
  console.debug('[Minimax Music] API Response:', data);

  if (data.base_resp?.status_code !== 0) {
    throw new Error(`Minimax API Error: ${String(data.base_resp?.status_msg ?? 'Unknown error')}`);
  }

  const audioHex = data.data?.audio ?? data.audio;

  if (!audioHex) {
    throw new Error(`Minimax Music Error: No audio data found in response. Data: ${JSON.stringify(data)}`);
  }

  return { audioHex };
}

// ── Think-tag stream splitter ──────────────────────────────────────────────────
/**
 * Wraps onToken/onReasoning callbacks to intercept inline think tags (e.g. <think>…</think>)
 * streamed as part of regular content. Characters before/between tags go to onToken; characters
 * inside tags go to onReasoning. Handles tags split across chunk boundaries via a lookahead buffer.
 *
 * Usage:
 *   const splitter = new ThinkTagStreamSplitter('<think>', '</think>', onToken, onReasoning);
 *   // replace onToken / onReasoning with:
 *   //   splitter.handleToken   and   undefined (reasoning is routed internally)
 *   // After stream ends, call splitter.flush() to drain any buffered content.
 *   // Then read splitter.contentAccumulated and splitter.reasoningAccumulated for the final split.
 */
class ThinkTagStreamSplitter {
  private readonly openTag: string;
  private readonly closeTag: string;
  private readonly onContent: (t: string) => void;
  private readonly onReasoning: ((t: string) => void) | undefined;

  private inThinking = false;
  /** Partial-match lookahead buffer — holds characters that might be the start of a tag. */
  private buffer = '';

  contentAccumulated = '';
  reasoningAccumulated = '';

  constructor(openTag: string, closeTag: string, onContent: (t: string) => void, onReasoning?: (t: string) => void) {
    this.openTag = openTag.toLowerCase();
    this.closeTag = closeTag.toLowerCase();
    this.onContent = onContent;
    this.onReasoning = onReasoning;
  }

  /** Feed raw incoming text tokens from the adapter. */
  handleToken(token: string): void {
    this.processChunk(this.buffer + token);
    this.buffer = '';
  }

  /** Call once after the stream ends to flush any remaining buffered characters. */
  flush(): void {
    if (this.buffer) {
      this.emit(this.buffer);
      this.buffer = '';
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private emit(text: string): void {
    if (!text) return;
    if (this.inThinking) {
      this.reasoningAccumulated += text;
      if (this.onReasoning) this.onReasoning(text);
    } else {
      this.contentAccumulated += text;
      this.onContent(text);
    }
  }

  private processChunk(text: string): void {
    const tag = this.inThinking ? this.closeTag : this.openTag;
    let pos = 0;

    while (pos < text.length) {
      const remaining = text.slice(pos);
      const lowerRemaining = remaining.toLowerCase();

      // Look for an exact match of the active tag
      const matchIdx = lowerRemaining.indexOf(tag);

      if (matchIdx === -1) {
        // Tag not found — but the tail of remaining might be a partial tag prefix.
        const partialLen = this.longestPrefixMatch(lowerRemaining, tag);
        if (partialLen > 0) {
          // Emit everything before the potential partial prefix, then buffer the rest.
          this.emit(remaining.slice(0, remaining.length - partialLen));
          this.buffer = remaining.slice(remaining.length - partialLen);
        } else {
          this.emit(remaining);
        }
        return;
      }

      // Emit content before the tag
      this.emit(remaining.slice(0, matchIdx));
      // Skip past the tag, toggle mode, continue
      pos += matchIdx + tag.length;
      this.inThinking = !this.inThinking;
    }
  }

  /** Returns the length of the longest suffix of `text` that is a prefix of `tag`. */
  private longestPrefixMatch(text: string, tag: string): number {
    for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }
}

/**
 * Post-process a completed (non-streaming) response to extract tag-based thinking.
 * Strips all open/close tag pairs from content and concatenates the inner text as reasoning.
 */
function extractThinkTags(content: string, openTag: string, closeTag: string): { content: string; reasoning: string } {
  const open = openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const close = closeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${open}([\\s\\S]*?)(?:${close}|$)`, 'gi');
  const reasoningParts: string[] = [];
  const strippedContent = content.replace(regex, (_match, inner: string) => {
    reasoningParts.push(inner.trim());
    return '';
  });
  return {
    content: strippedContent.trim(),
    reasoning: reasoningParts.join('\n\n').trim(),
  };
}

// ── Shared result builder ─────────────────────────────────────────────────────
function buildLlmResult(parsed: ParsedResponse): LlmResult {
  let aiNote: string | null = null;
  let aiNoteAction: 'append' | 'replace' | undefined;
  const toolCalls = parsed.toolCalls;

  if (toolCalls && toolCalls.length > 0) {
    const scratchpadTool = toolCalls.find((tc) => tc.function.name === 'update_scratchpad');
    if (scratchpadTool) {
      try {
        const args = JSON.parse(scratchpadTool.function.arguments) as { content: string; action: 'append' | 'replace' };
        aiNote = args.content;
        aiNoteAction = args.action;
      } catch (e) {
        console.warn('Failed to parse tool call arguments:', e);
      }
    }
  }

  const persistMatch = /<!--\s*persist:\s*([\s\S]*?)\s*-->/i.exec(parsed.content);
  const replaceMatch = /<!--\s*replace:\s*([\s\S]*?)\s*-->/i.exec(parsed.content);

  if (!aiNote) {
    if (replaceMatch) {
      aiNote = replaceMatch[1].trim();
      aiNoteAction = 'replace';
    } else if (persistMatch) {
      aiNote = persistMatch[1].trim();
      aiNoteAction = 'append';
    }
  } else if (persistMatch || replaceMatch) {
    console.warn('[buildLlmResult] Scratchpad updated via native tool call; HTML comment fallback was ignored.');
  }

  const strippedContent = parsed.content
    .replace(/<!--\s*persist:\s*[\s\S]*?\s*-->/gi, '')
    .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, '')
    .trim();

  return {
    content: strippedContent,
    rawContent: parsed.content,
    promptTokens: parsed.promptTokens,
    completionTokens: parsed.completionTokens,
    promptTokensDetails: parsed.promptTokensDetails,
    completionTokensDetails: parsed.completionTokensDetails,
    reasoning: parsed.reasoning.trim(),
    aiNote,
    aiNoteAction,
    toolCalls,
    searchCount: toolCalls?.filter((tc) => tc.function.name === '$web_search').length ?? 0, // toolCalls may be undefined
    finishReason: parsed.finishReason,
    responseId: parsed.responseId,
    actualModel: parsed.actualModel,
    systemFingerprint: parsed.systemFingerprint,
    cacheCreationTokens: parsed.cacheCreationTokens,
    cacheReadTokens: parsed.cacheReadTokens,
  };
}

export async function askLlm(
  model: ChatModel,
  temperature: number,
  messages: LlmMessage[],
  tools?: LlmTool[],
  webSearch?: boolean,
  signal?: AbortSignal,
): Promise<LlmResult> {
  const { provider: providerConfig, model: resolvedModel } = resolveModelAndProvider(model);
  const payload = buildPayload(model, messages, false, temperature, tools, webSearch);
  const adapter = getAdapter(providerConfig);

  const res = await fetch(providerConfig.baseUrl, {
    method: 'POST',
    headers: buildAuthHeaders(providerConfig),
    body: adapter.buildBody(payload, false),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`LLM Error ${res.status}: ${text}`);
  }

  const parsed = adapter.parseResponse(await res.json());

  const parseMode = resolvedModel.thinkingParseMode ?? 'api-native';
  if (parseMode === 'tag-based') {
    const open = resolvedModel.thinkingOpenTag ?? '<think>';
    const close = resolvedModel.thinkingCloseTag ?? '</think>';
    const extracted = extractThinkTags(parsed.content, open, close);
    parsed.content = extracted.content;
    parsed.reasoning = extracted.reasoning;
  } else if (parseMode === 'none') {
    parsed.reasoning = '';
  }

  return buildLlmResult(parsed);
}
export async function askLlmStream(
  model: ChatModel,
  temperature: number,
  messages: LlmMessage[],
  onToken?: (token: string) => void,
  onReasoning?: (token: string) => void,
  tools?: LlmTool[],
  webSearch?: boolean,
  signal?: AbortSignal,
): Promise<LlmResult> {
  const { provider: providerConfig, model: resolvedModel } = resolveModelAndProvider(model);
  const payload = buildPayload(model, messages, true, temperature, tools, webSearch);
  const adapter = getAdapter(providerConfig);

  const res = await fetch(providerConfig.baseUrl, {
    method: 'POST',
    headers: buildAuthHeaders(providerConfig),
    body: adapter.buildBody(payload, true),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`LLM Error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  // Set up think-tag splitting for tag-based mode
  const parseMode = resolvedModel.thinkingParseMode ?? 'api-native';
  let splitter: ThinkTagStreamSplitter | null = null;
  let activeOnToken = onToken;
  let activeOnReasoning = onReasoning;

  if (parseMode === 'tag-based' && onToken) {
    const open = resolvedModel.thinkingOpenTag ?? '<think>';
    const close = resolvedModel.thinkingCloseTag ?? '</think>';
    const streamSplitter = new ThinkTagStreamSplitter(open, close, onToken, onReasoning);
    splitter = streamSplitter;
    // Route all raw tokens through the splitter; it calls onToken/onReasoning internally.
    activeOnToken = (t: string): void => streamSplitter.handleToken(t);
    activeOnReasoning = undefined; // splitter handles routing
  } else if (parseMode === 'none') {
    activeOnReasoning = undefined;
  }

  const state: StreamState = { accumulated: '', reasoning: '', promptTokens: 0, completionTokens: 0, done: false };

  const onAbort = (): void => {
    reader.cancel().catch((err) => {
      console.warn('Reader cancel failed:', err);
    });
  };
  signal?.addEventListener('abort', onAbort);

  try {
    while (!state.done) {
      if (signal?.aborted) break;
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;
      if (signal?.aborted) break;

      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const json = trimmed.slice(6);
        if (json === '[DONE]') {
          state.done = true;
          break;
        }
        try {
          adapter.handleStreamChunk(JSON.parse(json) as unknown, state, activeOnToken, activeOnReasoning);
        } catch (e) {
          console.warn('Invalid stream chunk:', trimmed, e);
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  // Flush any buffered partial-tag characters and reconcile split state with stream state
  if (splitter) {
    splitter.flush();
    // The adapter accumulated raw text (including tags) in state.accumulated.
    // Replace with the splitter's clean content/reasoning split.
    state.accumulated = splitter.contentAccumulated;
    state.reasoning = splitter.reasoningAccumulated;
  } else if (parseMode === 'none') {
    state.reasoning = '';
  }

  // Fallback to estimation if usage was not provided in the stream
  if (state.promptTokens === 0 && state.completionTokens === 0) {
    const estimated = estimateStreamedTokens(model, messages, state.accumulated);
    state.promptTokens = estimated.promptTokens;
    state.completionTokens = estimated.completionTokens;
  }

  return buildLlmResult({
    content: state.accumulated,
    reasoning: state.reasoning,
    promptTokens: state.promptTokens,
    completionTokens: state.completionTokens,
    promptTokensDetails: state.promptTokensDetails,
    completionTokensDetails: state.completionTokensDetails,
    toolCalls: state.toolCalls,
    finishReason: state.finishReason,
    responseId: state.responseId,
    actualModel: state.actualModel,
    systemFingerprint: state.systemFingerprint,
    cacheCreationTokens: state.cacheCreationTokens,
    cacheReadTokens: state.cacheReadTokens,
  });
}

export interface OrchestrateResult {
  finalContent: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalSearchCount: number;
  lastResult: LlmResult;
  toolLoopTrace: ToolLoopIteration[];
}

export async function orchestrateLlmLoop(
  model: ChatModel,
  temperature: number,
  messages: LlmMessage[],
  onToken?: (token: string) => void,
  onReasoning?: (token: string) => void,
  onScratchpadUpdate?: (content: string, action: 'append' | 'replace') => Promise<void>,
  onExecuteTool?: (toolName: string, args: string) => Promise<string>,
  onToolLog?: (log: string) => void,
  tools: LlmTool[] = [SCRATCHPAD_TOOL],
  webSearch?: boolean,
  signal?: AbortSignal,
): Promise<OrchestrateResult> {
  const { model: resolvedModel } = resolveModelAndProvider(model);
  const llmContext = [...messages];
  let loopCount = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalSearchCount = 0;
  let finalContent = '';
  let lastResult: LlmResult | null = null;
  const toolLoopTrace: ToolLoopIteration[] = [];

  while (loopCount < MAX_TOOL_LOOP_ITERATIONS) {
    loopCount++;
    // Cache tool results within a single iteration to avoid calling the same tool twice
    // in one round-trip. A fresh cache each iteration ensures state changes between
    // iterations are not masked by a stale result.
    const toolResultCache = new Map<string, string>();
    const result = resolvedModel.streaming
      ? await askLlmStream(resolvedModel, temperature, llmContext, onToken, onReasoning, tools, webSearch, signal)
      : await askLlm(resolvedModel, temperature, llmContext, tools, webSearch, signal);

    if (!resolvedModel.streaming && result.reasoning && onReasoning) {
      onReasoning(result.reasoning);
    }

    lastResult = result;
    totalPromptTokens += result.promptTokens;
    totalCompletionTokens += result.completionTokens;
    totalSearchCount += result.searchCount;

    if (loopCount === 1) {
      finalContent = result.content;
    } else if (result.content) {
      finalContent = finalContent ? `${finalContent}\n\n${result.content}` : result.content;
    } // Process AI Note (Scratchpad)
    if (result.aiNote && onScratchpadUpdate) {
      // If the update came from the regex fallback (not a native tool call), log it so the user sees visual feedback
      const isNativeToolCall = result.toolCalls?.some((tc) => tc.function.name === 'update_scratchpad');
      if (!isNativeToolCall && onToolLog) {
        onToolLog(
          `\n\n**Executing Tool**: \`update_scratchpad\` *(via fallback syntax)*\n> \`\`\`json\n> ${JSON.stringify({ content: result.aiNote, action: result.aiNoteAction ?? 'append' }, null, 2).replace(/\n/g, '\n> ')}\n> \`\`\`\n`,
        );
      }
      await onScratchpadUpdate(result.aiNote, result.aiNoteAction ?? 'append');
    }

    // Handle Tool Calls Loop
    if (result.toolCalls && result.toolCalls.length > 0) {
      const providerConfig = resolveProvider(resolvedModel);
      const adapter = getAdapter(providerConfig);

      // Add assistant tool calls to context
      llmContext.push(adapter.buildAssistantContextMsg(result, providerConfig));

      // Collect tool results for this iteration's trace
      const iterationToolResults: ToolLoopIteration['toolResults'] = [];

      // Add tool results to context
      for (const tc of result.toolCalls) {
        const isWebSearch = tc.function.name === '$web_search';
        const isScratchpad = tc.function.name === 'update_scratchpad';
        let toolResult = 'Updated.';

        if (onToolLog) {
          onToolLog(`\n\n**Executing Tool**: \`${tc.function.name}\`\n> \`\`\`json\n> ${tc.function.arguments}\n> \`\`\`\n`);
        }

        if (isWebSearch) {
          // $web_search is a Moonshot builtin — echo the query back as the tool
          // result so the API can fulfil the search and continue the response.
          toolResult = tc.function.arguments;
        } else if (!isScratchpad && onExecuteTool) {
          const cacheKey = `${tc.function.name}:${tc.function.arguments}`;
          const cached = toolResultCache.get(cacheKey);
          if (cached !== undefined) {
            toolResult = cached;
          } else {
            try {
              toolResult = await onExecuteTool(tc.function.name, tc.function.arguments);
              toolResultCache.set(cacheKey, toolResult);
            } catch (e) {
              toolResult = `Error executing tool: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
        }

        // Cap tool result size to prevent tool output from crowding out conversation context
        const TOOL_RESULT_CHAR_LIMIT = 8000;
        if (toolResult.length > TOOL_RESULT_CHAR_LIMIT) {
          toolResult = toolResult.slice(0, TOOL_RESULT_CHAR_LIMIT) + `\n\n[TRUNCATED: result exceeded ${TOOL_RESULT_CHAR_LIMIT} chars]`;
        }

        if (onToolLog) {
          const summary = toolResult.length > 500 ? toolResult.slice(0, 500) + '... *(display truncated — full content sent to LLM)*' : toolResult;
          onToolLog(`**Tool Result**: \`${tc.function.name}\`\n> ${summary.replace(/\n/g, '\n> ')}\n\n`);
        }

        iterationToolResults.push({ toolCallId: tc.id, toolName: tc.function.name, result: toolResult });
        llmContext.push(adapter.buildToolResultContextMsg(tc, toolResult));
      }

      toolLoopTrace.push({
        iteration: loopCount,
        llmResponse: { content: result.content, reasoning: result.reasoning, toolCalls: result.toolCalls, finishReason: result.finishReason },
        toolResults: iterationToolResults,
      });
      continue;
    }
    break;
  }

  if (!lastResult) throw new Error('No result from LLM');

  return {
    finalContent,
    totalPromptTokens,
    totalCompletionTokens,
    totalSearchCount,
    lastResult,
    toolLoopTrace,
  };
}

export function estimateStreamedTokens(
  model: ChatModel,
  messages: LlmMessage[],
  response: string,
): Pick<LlmResult, 'promptTokens' | 'completionTokens'> & { costSEK: number } {
  const { promptTokens, completionTokens } = estimateTokens(messages, response);
  const costSEK = calculateCostSEK(model, promptTokens, completionTokens);
  return { promptTokens, completionTokens, costSEK };
}

interface MoonshotBalanceResponse {
  status: boolean;
  data: {
    available_balance: number;
    voucher_balance: number;
    cash_balance: number;
  };
}

export async function getMoonshotBalance(): Promise<{ available_balance: number } | null> {
  const moonshotProvider = useProviderStore.getState().providers.find((p) => p.id === 'builtin-moonshot');
  const key = moonshotProvider ? getProviderApiKey(moonshotProvider) : '';
  if (!key) return null;

  try {
    const res = await fetch('https://api.moonshot.ai/v1/users/me/balance', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as MoonshotBalanceResponse;
    if (data.status) {
      return data.data;
    }
    return null;
  } catch (e) {
    console.error('Failed to fetch Moonshot balance:', e);
    return null;
  }
}

interface DeepSeekBalanceResponse {
  is_available: boolean;
  balance_infos: {
    currency: string;
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }[];
}

export async function getDeepSeekBalance(): Promise<{ balance: number; currency: string } | null> {
  const deepseekProvider = useProviderStore.getState().providers.find((p) => p.id === 'builtin-deepseek');
  const key = deepseekProvider ? getProviderApiKey(deepseekProvider) : '';
  if (!key) return null;

  try {
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as DeepSeekBalanceResponse;
    if (data.is_available && data.balance_infos.length > 0) {
      const info = data.balance_infos[0];
      return {
        balance: parseFloat(info.total_balance),
        currency: info.currency,
      };
    }
    return null;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch DeepSeek balance:', e);
    }
    return null;
  }
}
