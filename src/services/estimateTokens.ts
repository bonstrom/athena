import { encode } from 'gpt-tokenizer';
import { LlmMessage } from './llmService';

const promptCache = new Map<string, number>();

export function estimateTokens(
  messages: LlmMessage[],
  reply?: string,
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const contentToString = (content: LlmMessage['content']): string => {
    if (content === null) return '';
    if (typeof content === 'string') return content;
    return content
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join(' ');
  };

  const promptKey = messages.map((m) => `${m.role}:${contentToString(m.content)}:${m.reasoning_content ?? ''}`).join('|');
  let promptTokens = promptCache.get(promptKey);
  if (promptTokens === undefined) {
    const prompt = messages
      .map((m) => `${m.role}: ${contentToString(m.content)}${m.reasoning_content ? `\nreasoning: ${m.reasoning_content}` : ''}`)
      .join('\n');
    promptTokens = encode(prompt).length;

    // Limit cache size to 100 entries (LRU: evict least-recently-used first)
    if (promptCache.size >= 100) {
      const firstKey = promptCache.keys().next().value as string | undefined;
      if (firstKey !== undefined) promptCache.delete(firstKey);
    }
    promptCache.set(promptKey, promptTokens);
  } else {
    // Refresh LRU position: remove and re-insert to mark as recently used
    promptCache.delete(promptKey);
    promptCache.set(promptKey, promptTokens);
  }
  const completionTokens = reply ? encode(reply).length : 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
