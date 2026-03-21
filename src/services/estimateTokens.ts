import { encode } from "gpt-tokenizer";
import { LlmMessage } from "./llmService";

export function estimateTokens(
  messages: LlmMessage[],
  reply?: string,
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const promptTokens = encode(prompt).length;
  const completionTokens = reply ? encode(reply).length : 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
