/**
 * Shared strict-JSON parsing helpers for LLM structured output.
 *
 * These parse the *entire* response as JSON (after stripping one optional
 * ```json fence) and reject anything that doesn't match the expected shape.
 * Permissive alias handling (e.g. accepting legacy field names for old
 * persisted data) belongs in the callers that deal with historical records,
 * NOT here — new generations should fail strict and trigger a repair retry.
 */

export function stripJsonFence(content: string): string {
  let text = content.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  return text;
}

export function parseJsonValue(content: string): unknown {
  try {
    return JSON.parse(stripJsonFence(content)) as unknown;
  } catch {
    return null;
  }
}

export function parseJsonObject(content: string): Record<string, unknown> | null {
  const parsed = parseJsonValue(content);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

export function parseStringArray(content: string): string[] | null {
  const parsed = parseJsonValue(content);
  if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
    return parsed as string[];
  }
  return null;
}
