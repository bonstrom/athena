import { calculateCostSEK, ChatModel } from "../components/ModelSelector";
import { useAuthStore } from "../store/AuthStore";
import { useChatStore } from "../store/ChatStore";
import { estimateTokens } from "./estimateTokens";

export interface LlmMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  aiNote?: string | null;
  aiNoteAction?: "append" | "replace";
}

interface LlmPayload {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  stream: boolean;
}

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
};

function buildPayload(model: ChatModel, messages: LlmMessage[], stream: boolean): LlmPayload {
  const filtered = filterMessagesForModel(model, messages);
  const auth = useAuthStore.getState();
  const customInstructions = auth.customInstructions.trim();

  const finalMessages = [...filtered];

  if (customInstructions) {
    if (finalMessages.length > 0 && finalMessages[0].role === "system") {
      finalMessages[0] = {
        ...finalMessages[0],
        content: `${customInstructions}\n\n${finalMessages[0].content}`,
      };
    } else {
      finalMessages.unshift({ role: "system", content: customInstructions });
    }
  }

  const basePayload: LlmPayload = {
    model: model.id,
    messages: finalMessages,
    stream,
    temperature: 1,
  };

  if (model.supportsTemperature) {
    basePayload.temperature = useChatStore.getState().temperature;
  } else {
    delete basePayload.temperature;
  }

  return basePayload;
}

export function filterMessagesForModel(model: ChatModel, messages: LlmMessage[]): LlmMessage[] {
  if (model.id !== "deepseek-reasoner") return messages;

  const filtered: LlmMessage[] = [];
  let foundUser = false;
  let lastRole: "user" | "assistant" | null = null;

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
      lastRole = msg.role;
    }
  }

  const firstContent = filtered.find((m) => m.role !== "system");
  if (!firstContent || firstContent.role !== "user") {
    throw new Error("Deepseek Reasoner requires the first non-system message to be from the user.");
  }

  return filtered;
}

export async function askLlm(messages: LlmMessage[]): Promise<LlmResult> {
  const { selectedModel } = useChatStore.getState();
  const url = PROVIDER_URLS[selectedModel.provider];
  const key = getApiKey(selectedModel);

  const payload = buildPayload(selectedModel, messages, false);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(await res.text());

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  const content = data.choices[0].message.content.trim();

  const persistMatch = /<!--\s*persist:\s*([\s\S]*?)\s*-->/i.exec(content);
  const replaceMatch = /<!--\s*replace:\s*([\s\S]*?)\s*-->/i.exec(content);

  let aiNote = null;
  let aiNoteAction: "append" | "replace" | undefined;

  if (replaceMatch) {
    aiNote = replaceMatch[1].trim();
    aiNoteAction = "replace";
  } else if (persistMatch) {
    aiNote = persistMatch[1].trim();
    aiNoteAction = "append";
  }

  return {
    content: content
      .replace(/<!--\s*persist:\s*[\s\S]*?\s*-->/gi, "")
      .replace(/<!--\s*replace:\s*[\s\S]*?\s*-->/gi, "")
      .trim(),
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    aiNote,
    aiNoteAction,
  };
}

export async function askLlmStream(messages: LlmMessage[], onToken?: (token: string) => void): Promise<LlmResult> {
  const { selectedModel } = useChatStore.getState();
  const url = PROVIDER_URLS[selectedModel.provider];
  const key = getApiKey(selectedModel);

  const payload = buildPayload(selectedModel, messages, true);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) throw new Error(await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let accumulated = "";

  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (done) break;

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
        const parsed = JSON.parse(json) as { choices?: { delta?: { content?: string } }[] };
        const token = parsed.choices?.[0]?.delta?.content ?? "";
        accumulated += token;
        if (onToken && token) onToken(token);
      } catch (e) {
        console.warn("Invalid stream chunk:", trimmed, e);
      }
    }
  }

  const { promptTokens, completionTokens } = estimateStreamedTokens(messages, accumulated);

  const persistMatch = /<!--\s*persist:\s*([\s\S]*?)\s*-->/i.exec(accumulated);
  const replaceMatch = /<!--\s*replace:\s*([\s\S]*?)\s*-->/i.exec(accumulated);

  let aiNote = null;
  let aiNoteAction: "append" | "replace" | undefined;

  if (replaceMatch) {
    aiNote = replaceMatch[1].trim();
    aiNoteAction = "replace";
  } else if (persistMatch) {
    aiNote = persistMatch[1].trim();
    aiNoteAction = "append";
  }

  return {
    content: accumulated
      .replace(/<!--\s*persist:\s*[\s\S]*?\s*-->/gi, "")
      .replace(/<!--\s*replace:\s*[\s\S]*?\s*-->/gi, "")
      .trim(),
    promptTokens,
    completionTokens,
    aiNote,
    aiNoteAction,
  };
}

function getApiKey(model: ChatModel): string {
  const auth = useAuthStore.getState();
  switch (model.provider) {
    case "openai":
      return auth.openAiKey;
    case "deepseek":
      return auth.deepSeekKey;
    default:
      throw new Error(`No API key found for provider "${String(model.provider)}"`);
  }
}

export function estimateStreamedTokens(
  messages: LlmMessage[],
  response: string,
): Pick<LlmResult, "promptTokens" | "completionTokens"> & { costSEK: number } {
  const { promptTokens, completionTokens } = estimateTokens(messages, response);
  const { selectedModel } = useChatStore.getState();
  const costSEK = calculateCostSEK(selectedModel, promptTokens, completionTokens);
  return { promptTokens, completionTokens, costSEK };
}
