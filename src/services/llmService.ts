import { calculateCostSEK, ChatModel } from "../components/ModelSelector";
import { useAuthStore } from "../store/AuthStore";
import { estimateTokens } from "./estimateTokens";

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface LlmMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | LlmContentPart[] | null;
  reasoning_content?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface LlmResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  aiNote?: string | null;
  aiNoteAction?: "append" | "replace";
  promptTokensDetails?: { cached_tokens?: number };
  completionTokensDetails?: { reasoning_tokens?: number };
  toolCalls?: { id: string; function: { name: string; arguments: string } }[];
  finishReason?: string;
  reasoning?: string;
}

export const SCRATCHPAD_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "update_scratchpad",
    description: "Store or update information in your private long-term memory scratchpad.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to store." },
        action: {
          type: "string",
          enum: ["append", "replace"],
          description: "'append' to add to existing memory, 'replace' to overwrite everything.",
        },
      },
      required: ["content", "action"],
    },
  },
};

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface LlmPayload {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  stream: boolean;
  stream_options?: { include_usage: boolean };
  tools?: LlmTool[];
}

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  moonshot: "https://api.moonshot.ai/v1/chat/completions",
};

function buildPayload(
  model: ChatModel,
  messages: LlmMessage[],
  stream: boolean,
  temperature: number,
  tools?: LlmTool[],
): LlmPayload {
  const filtered = filterMessagesForModel(model, messages);
  const auth = useAuthStore.getState();
  const customInstructions = auth.customInstructions.trim();

  const finalMessages = filtered.map((msg) => {
    const m = { ...msg };
    if (m.role === "assistant" && !m.reasoning_content) {
      // Ensure we don't send empty reasoning_content if not needed,
      // but some APIs might require it if it's a reasoning model.
      // For now, only include if present.
    }
    return m;
  });

  if (customInstructions) {
    if (finalMessages.length > 0 && finalMessages[0].role === "system") {
      finalMessages[0] = {
        ...finalMessages[0],
        content: `${customInstructions}\n\n${typeof finalMessages[0].content === "string" ? finalMessages[0].content : ""}`,
      };
    } else {
      finalMessages.unshift({ role: "system", content: customInstructions });
    }
  }

  return {
    model: model.id,
    messages: finalMessages.map((m) => ({
      role: m.role,
      content: m.content as string | (LlmContentPart & { type: "text" | "image_url" })[] | null,
      ...(typeof m.reasoning_content === "string" && { reasoning_content: m.reasoning_content }),
      ...(m.tool_calls && { tool_calls: m.tool_calls }),
      ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
    })),
    stream,
    ...(model.supportsTemperature && { temperature }),
    ...(stream && { stream_options: { include_usage: true } }),
    ...(model.supportsTools && tools && tools.length > 0 && { tools }),
  };
}

export function filterMessagesForModel(model: ChatModel, messages: LlmMessage[]): LlmMessage[] {
  if (model.id !== "deepseek-reasoner") return messages;

  const filtered: LlmMessage[] = [];
  let foundUser = false;
  let lastRole: "user" | "assistant" | "tool" | null = null;

  for (const msg of messages) {
    if (msg.role === "system") {
      filtered.push(msg);
    } else if (!foundUser && msg.role === "user") {
      foundUser = true;
      lastRole = "user";
      filtered.push(msg);
    } else if (foundUser) {
      if (msg.role === lastRole) {
        continue;
      }
      filtered.push(msg);
      if (msg.role === "user" || msg.role === "assistant") {
        lastRole = msg.role;
      }
    }
  }

  const firstContent = filtered.find((m) => m.role !== "system");
  if (!firstContent || firstContent.role !== "user") {
    throw new Error("Deepseek Reasoner requires the first non-system message to be from the user.");
  }

  return filtered;
}

export async function askLlm(
  model: ChatModel,
  temperature: number,
  messages: LlmMessage[],
  tools?: LlmTool[],
  signal?: AbortSignal,
): Promise<LlmResult> {
  const url = PROVIDER_URLS[model.provider];
  const key = getApiKey(model);

  const payload = buildPayload(model, messages, false, temperature, tools);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`LLM Error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: {
      message: {
        content: string;
        reasoning_content?: string;
        reasoning?: string;
        tool_calls?: { id?: string; function: { name: string; arguments: string } }[];
      };
    }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const message = data.choices[0].message;
  const finishReason = (data.choices[0] as { finish_reason?: string }).finish_reason;
  const toolCallsData = message.tool_calls;
  const toolCalls = toolCallsData?.map((tc, index) => ({
    id: tc.id ?? `call_${index}`,
    function: tc.function,
  }));
  const content = (toolCalls && toolCalls.length > 0 ? message.content : message.content.trim()) || "";
  const reasoning = message.reasoning_content ?? message.reasoning ?? "";

  const persistMatch = /<!--\s*persist:\s*([\s\S]*?)\s*-->/i.exec(content);
  const replaceMatch = /<!--\s*replace:\s*([\s\S]*?)\s*-->/i.exec(content);

  let aiNote = null;
  let aiNoteAction: "append" | "replace" | undefined;

  // Handle Tool Calls
  if (toolCalls && toolCalls.length > 0) {
    const scratchpadTool = toolCalls.find((tc) => tc.function.name === "update_scratchpad");
    if (scratchpadTool) {
      try {
        const args = JSON.parse(scratchpadTool.function.arguments) as { content: string; action: "append" | "replace" };
        aiNote = args.content;
        aiNoteAction = args.action;
      } catch (e) {
        console.warn("Failed to parse tool call arguments:", e);
      }
    }
  }

  // Fallback to regex if no tool call was processed
  if (!aiNote) {
    if (replaceMatch) {
      aiNote = replaceMatch[1].trim();
      aiNoteAction = "replace";
    } else if (persistMatch) {
      aiNote = persistMatch[1].trim();
      aiNoteAction = "append";
    }
  }

  const result = {
    content: content
      .replace(/<!--\s*persist:\s*[\s\S]*?\s*-->/gi, "")
      .replace(/<!--\s*replace:\s*[\s\S]*?\s*-->/gi, "")
      .trim(),
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    promptTokensDetails: (data.usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details,
    completionTokensDetails: (data.usage as { completion_tokens_details?: { reasoning_tokens?: number } })
      .completion_tokens_details,
    aiNote,
    aiNoteAction,
    toolCalls,
    finishReason,
    reasoning: reasoning.trim(),
  };

  if (!result.content && result.aiNote) {
    result.content = "*(Updated scratchpad)*";
  }

  return result;
}

export async function askLlmStream(
  model: ChatModel,
  temperature: number,
  messages: LlmMessage[],
  onToken?: (token: string) => void,
  onReasoning?: (token: string) => void,
  tools?: LlmTool[],
  signal?: AbortSignal,
): Promise<LlmResult> {
  const url = PROVIDER_URLS[model.provider];
  const key = getApiKey(model);

  const payload = buildPayload(model, messages, true, temperature, tools);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`LLM Error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let promptTokens = 0;
  let completionTokens = 0;
  let promptTokensDetails: { cached_tokens?: number } | undefined;
  let completionTokensDetails: { reasoning_tokens?: number } | undefined;
  let accumulated = "";
  let toolCallStarted = false;
  let toolCalls: { id: string; function: { name: string; arguments: string } }[] | undefined;
  let finishReason: string | undefined;
  let reasoning = "";
  let done = false;

  const onAbort = (): void => {
    reader.cancel().catch((err) => {
      console.warn("Reader cancel failed:", err);
    });
  };
  signal?.addEventListener("abort", onAbort);

  try {
    while (!done) {
      if (signal?.aborted) {
        break;
      }
      const result = await reader.read();
      done = result.done;
      if (done) break;

      if (signal?.aborted) {
        break;
      }

      const chunk = decoder.decode(result.value);
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const json = trimmed.slice(6);
        if (json === "[DONE]") {
          done = true;
          break;
        }

        try {
          const parsed = JSON.parse(json) as {
            choices?: {
              finish_reason?: string;
              delta?: {
                content?: string;
                reasoning_content?: string;
                reasoning?: string;
                tool_calls?: {
                  id: string; // id only appears in the first chunk for a tool call usually
                  index: number;
                  function?: { name?: string; arguments?: string };
                }[];
              };
            }[];
            usage?: {
              prompt_tokens: number;
              completion_tokens: number;
              prompt_tokens_details?: { cached_tokens?: number };
              completion_tokens_details?: { reasoning_tokens?: number };
            };
          };

          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
            promptTokensDetails = parsed.usage.prompt_tokens_details;
            completionTokensDetails = parsed.usage.completion_tokens_details;
          }

          const choice = parsed.choices?.[0];
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }

          const delta = choice?.delta;
          const token = delta?.content ?? "";
          accumulated += token;
          if (onToken && token) onToken(token);

          if (delta?.reasoning_content || delta?.reasoning) {
            const rToken = delta.reasoning_content ?? delta.reasoning ?? "";
            reasoning += rToken;
            if (onReasoning && rToken) onReasoning(rToken);
          }

          if (delta?.tool_calls) {
            if (!toolCallStarted) {
              toolCallStarted = true;
              if (!accumulated && onToken) {
                const statusMsg = "*(Updating scratchpad...)*\n\n";
                accumulated += statusMsg;
                onToken(statusMsg);
              }
            }
            for (const tc of delta.tool_calls) {
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              const idx = tc.index ?? 0;
              if (!toolCalls) toolCalls = [];
              let existing: { id: string; function: { name: string; arguments: string } } | undefined = toolCalls[idx];
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (!existing) {
                existing = { id: tc.id || "", function: { name: "", arguments: "" } };
                toolCalls[idx] = existing;
              }
              if (tc.id) {
                existing.id = tc.id;
              }
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) {
                existing.function.arguments += tc.function.arguments;
              }
            }
          }
        } catch (e) {
          console.warn("Invalid stream chunk:", trimmed, e);
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }

  // Fallback to estimation if usage was not provided in the stream
  if (promptTokens === 0 && completionTokens === 0) {
    const estimated = estimateStreamedTokens(model, messages, accumulated);
    promptTokens = estimated.promptTokens;
    completionTokens = estimated.completionTokens;
  }

  let aiNote: string | null = null;
  let aiNoteAction: "append" | "replace" | undefined;

  if (toolCalls && toolCalls.length > 0) {
    const scratchpadTool = toolCalls.find((tc) => tc.function.name === "update_scratchpad");
    if (scratchpadTool?.function.arguments) {
      try {
        const args = JSON.parse(scratchpadTool.function.arguments) as { content: string; action: "append" | "replace" };
        aiNote = args.content;
        aiNoteAction = args.action;
      } catch (e) {
        console.warn("Failed to parse streamed tool call arguments:", e);
      }
    }
  }

  const persistMatch = /<!--\s*persist:\s*([\s\S]*?)\s*-->/i.exec(accumulated);
  const replaceMatch = /<!--\s*replace:\s*([\s\S]*?)\s*-->/i.exec(accumulated);

  // Fallback to regex
  if (!aiNote) {
    if (replaceMatch) {
      aiNote = replaceMatch[1].trim();
      aiNoteAction = "replace";
    } else if (persistMatch) {
      aiNote = persistMatch[1].trim();
      aiNoteAction = "append";
    }
  }

  const result: LlmResult = {
    content: accumulated
      .replace(/<!--\s*persist:\s*[\s\S]*?\s*-->/gi, "")
      .replace(/<!--\s*replace:\s*[\s\S]*?(-->|$)/gi, "")
      .trim(),
    promptTokens,
    completionTokens,
    promptTokensDetails,
    completionTokensDetails,
    aiNote,
    aiNoteAction,
    toolCalls,
    finishReason,
    reasoning: reasoning.trim(),
  };

  if (!result.content && result.aiNote) {
    result.content = "*(Updated scratchpad)*";
  }

  return result;
}

export interface OrchestrateResult {
  finalContent: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  lastResult: LlmResult;
}

export async function orchestrateLlmLoop(
  model: ChatModel,
  temperature: number,
  messages: LlmMessage[],
  onToken?: (token: string) => void,
  onReasoning?: (token: string) => void,
  onScratchpadUpdate?: (content: string, action: "append" | "replace") => Promise<void>,
  signal?: AbortSignal,
): Promise<OrchestrateResult> {
  const llmContext = [...messages];
  let loopCount = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finalContent = "";
  let lastResult: LlmResult | null = null;

  while (loopCount < 5) {
    loopCount++;
    const result = model.streaming
      ? await askLlmStream(model, temperature, llmContext, onToken, onReasoning, [SCRATCHPAD_TOOL], signal)
      : await askLlm(model, temperature, llmContext, [SCRATCHPAD_TOOL], signal);

    lastResult = result;
    totalPromptTokens += result.promptTokens;
    totalCompletionTokens += result.completionTokens;

    if (loopCount === 1) {
      finalContent = result.content;
    } else if (result.content) {
      finalContent = finalContent ? `${finalContent}\n\n${result.content}` : result.content;
    } // Process AI Note (Scratchpad)
    if (result.aiNote && onScratchpadUpdate) {
      await onScratchpadUpdate(result.aiNote, result.aiNoteAction ?? "append");
    }

    // Handle Tool Calls Loop
    if (result.toolCalls && result.toolCalls.length > 0 && result.finishReason === "tool_calls") {
      // Add assistant tool calls to context
      llmContext.push({
        role: "assistant",
        content: result.content || null,
        reasoning_content: result.reasoning ?? "",
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: tc.function,
        })),
      });

      // Add tool results to context
      for (const tc of result.toolCalls) {
        llmContext.push({
          role: "tool",
          tool_call_id: tc.id,
          content: "Updated.",
        });
      }
      continue;
    }
    break;
  }

  if (!lastResult) throw new Error("No result from LLM");

  return {
    finalContent,
    totalPromptTokens,
    totalCompletionTokens,
    lastResult,
  };
}

function getApiKey(model: ChatModel): string {
  const auth = useAuthStore.getState();
  switch (model.provider) {
    case "openai":
      return auth.openAiKey;
    case "deepseek":
      return auth.deepSeekKey;
    case "google":
      return auth.googleApiKey;
    case "moonshot":
      return auth.moonshotApiKey;
    default:
      throw new Error(`No API key found for provider "${String(model.provider)}"`);
  }
}

export function estimateStreamedTokens(
  model: ChatModel,
  messages: LlmMessage[],
  response: string,
): Pick<LlmResult, "promptTokens" | "completionTokens"> & { costSEK: number } {
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
    const res = await fetch("https://api.moonshot.ai/v1/users/me/balance", {
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
    console.error("Failed to fetch Moonshot balance:", e);
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
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
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
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch DeepSeek balance:", e);
    }
    return null;
  }
}
