import { athenaDb } from '../database/AthenaDb';
import type { LlmOperationType, LlmOperationUsage } from '../database/AthenaDb';
import { useProviderStore } from '../store/ProviderStore';
import {
  getLegacyBuiltInAttribution,
  getProviderAttribution,
  UserChatModel,
} from '../types/provider';
import type { LlmProvider } from '../types/provider';
import { idleDeferredRollup } from './analyticsRollupService';

export interface OperationUsageInput {
  topicId: string;
  operationType: LlmOperationType;
  /** Configured model, when the caller has one. */
  model?: Pick<UserChatModel, 'apiModelId' | 'providerId'>;
  /** API model ID for operations that do not correspond to a configured model (e.g. media). */
  apiModelId?: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  totalCost?: number;
  searchCount?: number;
  latencyMs?: number;
  failed?: boolean;
  rawResponse?: string;
  /** DeepSeek peak-price multiplier for this call, when applicable. */
  peakMultiplier?: number;
  /** True when the provider does not report token/cost usage (e.g. MiniMax media). */
  usageUnknown?: boolean;
}

/**
 * Build a persistable operation-usage record. Attribution prefers the
 * model's configured provider and falls back to the built-in alias map.
 */
export function buildOperationUsage(
  input: OperationUsageInput,
  providers: LlmProvider[],
): LlmOperationUsage {
  const apiModelId = input.model?.apiModelId ?? input.apiModelId;
  const attribution =
    (input.model ? getProviderAttribution(input.model.providerId, providers) : null) ??
    getLegacyBuiltInAttribution(apiModelId);

  return {
    id: crypto.randomUUID(),
    topicId: input.topicId,
    operationType: input.operationType,
    created: new Date().toISOString(),
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    totalCost: input.totalCost ?? 0,
    failed: input.failed ?? false,
    ...(apiModelId ? { model: apiModelId } : {}),
    ...(input.cachedTokens !== undefined ? { cachedTokens: input.cachedTokens } : {}),
    ...(input.cacheCreationTokens !== undefined ? { cacheCreationTokens: input.cacheCreationTokens } : {}),
    ...(input.searchCount !== undefined ? { searchCount: input.searchCount } : {}),
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(input.rawResponse ? { rawResponse: input.rawResponse } : {}),
    ...(attribution
      ? {
          providerId: attribution.providerId,
          providerName: attribution.providerName,
          providerFormat: attribution.providerFormat,
        }
      : {}),
    ...(input.peakMultiplier !== undefined ? { peakMultiplier: input.peakMultiplier } : {}),
    ...(input.usageUnknown ? { usageUnknown: true } : {}),
  };
}

/**
 * Record a non-message LLM/media operation. Analytics failures must never
 * break the feature that triggered them, so writes are best-effort.
 */
export async function trackOperationUsage(input: OperationUsageInput): Promise<void> {
  try {
    const providers = useProviderStore.getState().providers;
    await athenaDb.llmOperationUsages.add(buildOperationUsage(input, providers));
    idleDeferredRollup();
  } catch (err) {
    console.warn('[usage-tracking] Failed to record LLM operation', input.operationType, err);
  }
}

/** Record failed requests separately; their provider-reported usage is unavailable. */
export async function trackOperationFailure<T>(input: OperationUsageInput, request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (err) {
    void trackOperationUsage({ ...input, failed: true, usageUnknown: true });
    throw err;
  }
}
