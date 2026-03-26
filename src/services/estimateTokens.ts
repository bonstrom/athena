import { encode } from "gpt-tokenizer";
import { LlmMessage } from "./llmService";

const promptCache = new Map<string, number>();

export function estimateTokens(
  messages: LlmMessage[],
  reply?: string,
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const promptKey = messages
    .map((m) => `${m.role}:${m.content?.length ?? 0}:${m.reasoning_content?.length ?? 0}`)
    .join("|");
  let promptTokens = promptCache.get(promptKey);
  if (promptTokens === undefined) {
    const prompt = messages
      .map((m) => `${m.role}: ${m.content ?? ""}${m.reasoning_content ? `\nreasoning: ${m.reasoning_content}` : ""}`)
      .join("\n");
    promptTokens = encode(prompt).length;
    promptCache.set(promptKey, promptTokens);

    // Limit cache size to 100 entries
    if (promptCache.size > 100) {
      const firstKey = promptCache.keys().next().value as string | undefined;
      if (firstKey !== undefined) promptCache.delete(firstKey);
    }
  }
  const completionTokens = reply ? encode(reply).length : 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
