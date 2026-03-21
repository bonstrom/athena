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
  const basePayload: LlmPayload = {
    model: model.id,
    messages: filtered,
    stream,
    temperature: 1,
  };

  if (model.supportsTemperature) {
    basePayload.temperature = model.provider === "openai" ? 0.7 : 1.3;
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
  const noteMatch = /<!--\s*persist:\s*(.*?)\s*-->/i.exec(content);

  return {
    content: content.replace(/<!--\s*persist:\s*(.*?)\s*-->/i, "").trim(),
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    aiNote: noteMatch?.[1]?.trim() ?? null,
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

  const match = /<!--\s*persist:\s*(.*?)\s*-->/i.exec(accumulated);
  return {
    content: accumulated.replace(/<!--\s*persist:\s*(.*?)\s*-->/i, "").trim(),
    promptTokens,
    completionTokens,
    aiNote: match?.[1]?.trim() ?? null,
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
