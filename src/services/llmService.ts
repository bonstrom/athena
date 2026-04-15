import { calculateCostSEK, ChatModel } from '../components/ModelSelector';
import { useAuthStore } from '../store/AuthStore';
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

// ── Provider Registry ────────────────────────────────────────────────────────
export type ProviderId = 'openai' | 'deepseek' | 'google' | 'moonshot' | 'minimax';

const MAX_TOOL_LOOP_ITERATIONS = 5;

type AuthState = ReturnType<typeof useAuthStore.getState>;

interface ProviderConfig {
  url: string;
  messageFormat: 'openai' | 'anthropic';
  getApiKey: (auth: AuthState) => string;
  /** Whether this provider supports a web-search builtin tool. */
  supportsWebSearch?: boolean;
  /** Whether assistant tool-call messages require a reasoning_content fallback. */
  requiresReasoningFallback?: boolean;
  /** Extra fields merged into the payload (may differ by stream mode). */
  payloadOverrides?: (stream: boolean) => Partial<LlmPayload>;
}

const PROVIDERS: Partial<Record<string, ProviderConfig>> = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    messageFormat: 'openai',
    getApiKey: (auth) => auth.openAiKey,
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    messageFormat: 'openai',
    getApiKey: (auth) => auth.deepSeekKey,
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    messageFormat: 'openai',
    getApiKey: (auth) => auth.googleApiKey,
  },
  moonshot: {
    url: 'https://api.moonshot.ai/v1/chat/completions',
    messageFormat: 'openai',
    getApiKey: (auth) => auth.moonshotApiKey,
    supportsWebSearch: true,
    requiresReasoningFallback: true,
    payloadOverrides: (stream) => (!stream ? { thinking: { type: 'disabled' } } : {}),
  },
  minimax: {
    url: 'https://api.minimax.io/anthropic/v1/messages',
    messageFormat: 'anthropic',
    getApiKey: (auth) => auth.minimaxKey,
    payloadOverrides: () => ({ max_tokens: 4096 }),
  },
};

// ── Model-specific overrides ──────────────────────────────────────────────────
interface ModelOverrides {
  /** Override temperature; receives the user-supplied value and stream flag. */
  temperatureOverride?: (temperature: number, stream: boolean) => number;
  /** Filter/validate messages before sending to the API. */
  filterMessages?: (messages: LlmMessage[]) => LlmMessage[];
}

const MODEL_OVERRIDES: Partial<Record<string, ModelOverrides>> = {
  'kimi-k2.5': {
    temperatureOverride: (temp, stream) => (!stream ? 0.6 : temp),
  },
  'deepseek-reasoner': {
    filterMessages: (messages) => {
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
        throw new Error('Deepseek Reasoner requires the first non-system message to be from the user.');
      }
      return filtered;
    },
  },
};

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
  delta?: { type: string; text?: string; thinking?: string; partial_json?: string };
  message?: { usage: { input_tokens: number } };
  usage?: { output_tokens: number };
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
}

interface IMessageAdapter {
  buildBody(payload: LlmPayload, stream: boolean): string;
  parseResponse(data: unknown): ParsedResponse;
  handleStreamChunk(parsed: unknown, state: StreamState, onToken?: (t: string) => void, onReasoning?: (t: string) => void): void;
  buildAssistantContextMsg(result: LlmResult, config: ProviderConfig): LlmMessage;
  buildToolResultContextMsg(tc: ToolCall, toolResult: string): LlmMessage;
}

const OpenAiAdapter: IMessageAdapter = {
  buildBody(payload, _stream): string {
    return JSON.stringify(payload);
  },

  parseResponse(data: unknown): ParsedResponse {
    const d = data as {
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
    };
  },

  handleStreamChunk(parsed: unknown, state: StreamState, onToken, onReasoning): void {
    const p = parsed as OpenAiStreamChunk;
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

  buildAssistantContextMsg(result: LlmResult, config: ProviderConfig): LlmMessage {
    return {
      role: 'assistant',
      content: result.content || null,
      reasoning_content: result.reasoning || (config.requiresReasoningFallback ? 'Thinking process hidden or not provided.' : undefined), // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
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
      content: { type: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
      usage: { input_tokens: number; output_tokens: number };
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
    } else if (p.type === 'message_delta') {
      state.completionTokens = p.usage?.output_tokens ?? 0;
    }
  },

  buildAssistantContextMsg(result: LlmResult, _config: ProviderConfig): LlmMessage {
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

function getAdapter(provider: ProviderId): IMessageAdapter {
  return PROVIDERS[provider]?.messageFormat === 'anthropic' ? AnthropicAdapter : OpenAiAdapter;
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
  const providerConfig = PROVIDERS[model.provider];
  const modelOverrides = MODEL_OVERRIDES[model.id];
  const filtered = modelOverrides?.filterMessages ? modelOverrides.filterMessages(messages) : messages;
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
  const tokenBudget = Math.min(userTokenBudget, Math.floor(model.contextWindow * 0.9));
  while (finalMessages.length > 1) {
    const { promptTokens } = estimateTokens(finalMessages);
    if (promptTokens <= tokenBudget) break;
    // Find and remove the oldest non-system message
    const oldestNonSystemIndex = finalMessages.findIndex((m) => m.role !== 'system');
    if (oldestNonSystemIndex === -1) break; // all system messages — nothing safe to drop
    finalMessages.splice(oldestNonSystemIndex, 1);
  }

  const finalTools = [...(tools ?? [])];
  if (webSearch && providerConfig?.supportsWebSearch) {
    finalTools.push({
      type: 'builtin_function',
      function: {
        name: '$web_search',
        description: "Search the internet for real-time information with Moonshot AI's built-in search.",
      },
    });
  }

  const resolvedTemperature = modelOverrides?.temperatureOverride ? modelOverrides.temperatureOverride(temperature, stream) : temperature;

  return {
    model: model.id,
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
    ...(model.supportsTemperature && { temperature: resolvedTemperature }),
    ...(stream && { stream_options: { include_usage: true } }),
    ...(model.supportsTools && finalTools.length > 0 && { tools: finalTools }),
    ...(providerConfig?.payloadOverrides?.(stream) ?? {}),
  };
}

export function filterMessagesForModel(model: ChatModel, messages: LlmMessage[]): LlmMessage[] {
  const overrides = MODEL_OVERRIDES[model.id];
  return overrides?.filterMessages?.(messages) ?? messages;
}

export async function generateMinimaxImage(prompt: string, aspectRatio = '1:1', signal?: AbortSignal): Promise<{ base64: string }> {
  const url = 'https://api.minimax.io/v1/image_generation';
  const key = useAuthStore.getState().minimaxKey;

  const payload = {
    model: 'image-01',
    prompt: prompt,
    aspect_ratio: aspectRatio,
    response_format: 'base64',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
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
  const key = useAuthStore.getState().minimaxKey;

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
      Authorization: `Bearer ${key}`,
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

  return {
    content: parsed.content
      .replace(/<!--\s*persist:\s*[\s\S]*?\s*-->/gi, '')
      .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, '')
      .trim(),
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
  const providerConfig = PROVIDERS[model.provider];
  if (!providerConfig) throw new Error(`Unknown provider: ${model.provider}`);

  const payload = buildPayload(model, messages, false, temperature, tools, webSearch);
  const adapter = getAdapter(model.provider);

  const res = await fetch(providerConfig.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.getApiKey(useAuthStore.getState())}`,
      'Content-Type': 'application/json',
    },
    body: adapter.buildBody(payload, false),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`LLM Error ${res.status}: ${text}`);
  }

  return buildLlmResult(adapter.parseResponse(await res.json()));
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
  const providerConfig = PROVIDERS[model.provider];
  if (!providerConfig) throw new Error(`Unknown provider: ${model.provider}`);

  const payload = buildPayload(model, messages, true, temperature, tools, webSearch);
  const adapter = getAdapter(model.provider);

  const res = await fetch(providerConfig.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerConfig.getApiKey(useAuthStore.getState())}`,
      'Content-Type': 'application/json',
    },
    body: adapter.buildBody(payload, true),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`LLM Error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

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
          adapter.handleStreamChunk(JSON.parse(json) as unknown, state, onToken, onReasoning);
        } catch (e) {
          console.warn('Invalid stream chunk:', trimmed, e);
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
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
  });
}

export interface OrchestrateResult {
  finalContent: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalSearchCount: number;
  lastResult: LlmResult;
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
  const llmContext = [...messages];
  let loopCount = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalSearchCount = 0;
  let finalContent = '';
  let lastResult: LlmResult | null = null;

  while (loopCount < MAX_TOOL_LOOP_ITERATIONS) {
    loopCount++;
    // Cache tool results within a single iteration to avoid calling the same tool twice
    // in one round-trip. A fresh cache each iteration ensures state changes between
    // iterations are not masked by a stale result.
    const toolResultCache = new Map<string, string>();
    const result = model.streaming
      ? await askLlmStream(model, temperature, llmContext, onToken, onReasoning, tools, webSearch, signal)
      : await askLlm(model, temperature, llmContext, tools, webSearch, signal);

    if (!model.streaming && result.reasoning && onReasoning) {
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
      const adapter = getAdapter(model.provider);
      const providerConfig = PROVIDERS[model.provider];
      if (!providerConfig) throw new Error(`Unknown provider: ${model.provider}`);

      // Add assistant tool calls to context
      llmContext.push(adapter.buildAssistantContextMsg(result, providerConfig));

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

        llmContext.push(adapter.buildToolResultContextMsg(tc, toolResult));
      }
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
  const auth = useAuthStore.getState();
  const key = auth.moonshotApiKey;
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
  const auth = useAuthStore.getState();
  const key = auth.deepSeekKey;
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
