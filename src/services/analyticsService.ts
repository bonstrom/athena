import { athenaDb } from '../database/AthenaDb';
import type { AnalyticsSnapshot, LlmOperationUsage, Message } from '../database/AthenaDb';
import { useAuthStore } from '../store/AuthStore';
import { resolveProviderFormat, resolveProviderName } from './analyticsRollupService';

export type CacheFormat = 'openai' | 'anthropic';

export interface CacheFormatTotals {
  /** Number of local records attributed to this provider format. */
  recordCount: number;
  /** Provider-reported prompt/input tokens, using that format's convention. */
  promptTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
}

export type CacheByFormat = Record<CacheFormat, CacheFormatTotals>;

export interface AnalyticsStats {
  summaryGeneratedCount: number;
  summaryTotalCost: number;
  /** Sum of stored summary prompt+completion tokens (latest generation per message). */
  summaryTotalTokens: number;
  summaryTotalReadCount: number;
  summaryUniqueReadCount: number;
  totalMessages: number;
  messagesByType: Record<string, number>;
  messagesByModel: Record<string, number>;
  failedMessageCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalCacheCreationTokens: number;
  totalCost: number;
  messageSizeDistribution: Record<string, number>;
  userMessageSizeDistribution: Record<string, number>;
  assistantMessageSizeDistribution: Record<string, number>;
  totalAttachments: number;
  totalWebSearches: number;
  topicsWithScratchpad: number;
  totalForks: number;
  debateTopicCount: number;
  messagesWithReasoning: number;
  totalEmbeddings: number;
  totalLatencyMs: number;
  latencyCount: number;
  /**
   * Completion tokens from exactly the message records that contributed to
   * `totalLatencyMs`/`latencyCount`. Used for end-to-end throughput so the
   * numerator and denominator cover the same population. Optional so files
   * exported by older versions still import.
   */
  latencyCompletionTokens?: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  features: Record<string, string>;
  /**
   * Local records grouped by their provider's current message format. Cache
   * semantics differ by format, so rates are never blended. Optional so
   * analytics files exported by older versions still import.
   */
  cacheByFormat?: CacheByFormat;
  /**
   * Optional so analytics files exported by older versions still import.
   * New exports include provider-level message/cost/token totals.
   */
  providerBreakdown?: ProviderBreakdown[];
}

export interface AnalyticsExport {
  format: 'athena-analytics-v1' | 'athena-analytics-v2';
  deviceId: string;
  userId: string;
  exportedAt: string;
  appVersion: string;
  stats: AnalyticsStats;
}

/**
 * UI copy describing what an analytics export contains. Kept next to the
 * payload definition so the disclosure cannot drift from the actual data.
 */
export const ANALYTICS_EXPORT_PRIVACY_NOTE =
  'Aggregate usage statistics only. Includes message and token counts, message-size distributions, cost, latency, model and provider usage, web-search and attachment counts, summary usage, counts of forks, debate topics, scratchpads, reasoning messages, and embeddings, first/last activity timestamps, feature settings, your user name, a random device ID, the app version, and the export time. It does not include conversations, message content, topic names, prompts, attachments, scratchpads, or API keys.';

export interface TrendRow {
  date: string;
  messageCount: number;
  cost: number;
  tokens: number;
  failPercent: number;
  p50Latency: number | null;
  p95Latency: number | null;
}

export interface ProviderBreakdown {
  provider: string;
  messages: number;
  cost: number;
  tokens: number;
}

export interface ToolUsageRow {
  tool: string;
  calls: number;
  successRate: number;
  errors: string[];
}

export interface LatencyPercentiles {
  p50: number | null;
  p95: number | null;
}

const SIZE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0-100', min: 0, max: 100 },
  { label: '101-500', min: 101, max: 500 },
  { label: '501-1000', min: 501, max: 1000 },
  { label: '1001-2000', min: 1001, max: 2000 },
  { label: '2001-4000', min: 2001, max: 4000 },
  { label: '4000-8000', min: 4001, max: 8000 },
  { label: '8000+', min: 8001, max: Infinity },
];

function bucketSize(length: number): string {
  for (const bucket of SIZE_BUCKETS) {
    if (length >= bucket.min && length <= bucket.max) return bucket.label;
  }
  return '8000+';
}

function createEmptyCacheFormatTotals(): CacheFormatTotals {
  return { recordCount: 0, promptTokens: 0, cachedTokens: 0, cacheCreationTokens: 0 };
}

export function createEmptyCacheByFormat(): CacheByFormat {
  return {
    openai: createEmptyCacheFormatTotals(),
    anthropic: createEmptyCacheFormatTotals(),
  };
}

/**
 * Nearest-rank percentile.
 *
 * Definition: sort the samples ascending, compute rank = ceil(p / 100 * n),
 * and return the value at 1-based rank (clamped to the sample size). No
 * interpolation is performed. This is the definition used by both trend rows
 * and the pooled latency summary.
 *
 * Returns null for an empty sample or a non-finite percentile.
 */
export function percentileNearestRank(samples: readonly number[], p: number): number | null {
  if (samples.length === 0 || !Number.isFinite(p)) return null;
  const clamped = Math.min(100, Math.max(0, p));
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((clamped / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

/**
 * Cache-read share for a provider message format.
 *
 * OpenAI-style `prompt_tokens` already includes cached tokens, so the
 * denominator is the prompt total. Anthropic-style `input_tokens` excludes
 * cache reads and cache creation, so both must be added to the denominator.
 */
export function cacheHitRateForFormat(format: CacheFormat, totals: CacheFormatTotals): number | null {
  if (format === 'openai') {
    return totals.promptTokens > 0 ? totals.cachedTokens / totals.promptTokens : null;
  }
  const denominator = totals.promptTokens + totals.cachedTokens + totals.cacheCreationTokens;
  return denominator > 0 ? totals.cachedTokens / denominator : null;
}

function addCacheUsage(
  cache: CacheByFormat,
  model: string | undefined,
  promptTokens: number,
  cachedTokens: number,
  cacheCreationTokens: number,
): void {
  const format = resolveProviderFormat(model);
  if (!format) return;
  const entry = cache[format];
  entry.recordCount++;
  entry.promptTokens += promptTokens;
  entry.cachedTokens += cachedTokens;
  entry.cacheCreationTokens += cacheCreationTokens;
}

function aggregateProviderBreakdown(
  messages: Message[],
  operationUsages: LlmOperationUsage[],
): ProviderBreakdown[] {
  const merged: Record<string, { messages: number; cost: number; tokens: number }> = {};
  const addUsage = (provider: string): { messages: number; cost: number; tokens: number } => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    merged[provider] = merged[provider] ?? { messages: 0, cost: 0, tokens: 0 };
    return merged[provider];
  };

  // Message counts use the same records as messagesByModel so the provider
  // table and the model table always reconcile. Models that no longer resolve
  // to a configured provider are grouped under "Unknown" instead of dropped.
  for (const m of messages) {
    if (!m.model) continue;
    const entry = addUsage(resolveProviderName(m.model) ?? 'Unknown');
    entry.messages++;
    entry.cost += m.totalCost;
    entry.tokens += m.promptTokens + m.completionTokens;
  }

  // Background operations add real cost and tokens, but they are not chat
  // messages, so they must not inflate the message counts.
  for (const operation of operationUsages) {
    const entry = addUsage(resolveProviderName(operation.model) ?? 'Unknown');
    entry.cost += operation.totalCost;
    entry.tokens += operation.promptTokens + operation.completionTokens;
  }

  return Object.entries(merged)
    .map(([provider, stats]) => ({ provider, ...stats }))
    .sort((a, b) => b.cost - a.cost);
}

export async function computeLocalStats(): Promise<AnalyticsStats> {
  const messages = await athenaDb.messages.toArray();
  const operationUsages = await athenaDb.llmOperationUsages.toArray();
  const topics = await athenaDb.topics.toArray();
  const cacheByFormat = createEmptyCacheByFormat();

  const stats: AnalyticsStats = {
    summaryGeneratedCount: 0,
    summaryTotalCost: 0,
    summaryTotalTokens: 0,
    summaryTotalReadCount: 0,
    summaryUniqueReadCount: 0,
    totalMessages: messages.length,
    messagesByType: {},
    messagesByModel: {},
    failedMessageCount: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalCacheCreationTokens: 0,
    totalCost: 0,
    messageSizeDistribution: {},
    userMessageSizeDistribution: {},
    assistantMessageSizeDistribution: {},
    totalAttachments: 0,
    totalWebSearches: 0,
    topicsWithScratchpad: 0,
    totalForks: 0,
    debateTopicCount: 0,
    messagesWithReasoning: 0,
    totalEmbeddings: 0,
    totalLatencyMs: 0,
    latencyCount: 0,
    latencyCompletionTokens: 0,
    firstMessageAt: null,
    lastMessageAt: null,
    features: {},
    cacheByFormat,
  };

  for (const m of messages) {
    stats.messagesByType[m.type] = (stats.messagesByType[m.type] || 0) + 1;

    if (m.model) {
      stats.messagesByModel[m.model] = (stats.messagesByModel[m.model] || 0) + 1;
    }

    if (m.failed) stats.failedMessageCount++;

    stats.totalPromptTokens += m.promptTokens;
    stats.totalCompletionTokens += m.completionTokens;
    stats.totalCachedTokens += m.cachedTokens ?? 0;
    stats.totalCacheCreationTokens += m.cacheCreationTokens ?? 0;
    stats.totalCost += m.totalCost;

    const len = m.content.length;
    const bucket = bucketSize(len);
    stats.messageSizeDistribution[bucket] = (stats.messageSizeDistribution[bucket] || 0) + 1;
    if (m.type === 'user') {
      stats.userMessageSizeDistribution[bucket] = (stats.userMessageSizeDistribution[bucket] || 0) + 1;
    } else if (m.type === 'assistant') {
      stats.assistantMessageSizeDistribution[bucket] = (stats.assistantMessageSizeDistribution[bucket] || 0) + 1;
    }

    stats.totalAttachments += m.attachments?.length ?? 0;
    stats.totalWebSearches += m.searchCount ?? 0;

    if (m.reasoning) stats.messagesWithReasoning++;
    if (m.embedding) stats.totalEmbeddings++;

    if (m.latencyMs != null && m.latencyMs > 0) {
      stats.totalLatencyMs += m.latencyMs;
      stats.latencyCount++;
      stats.latencyCompletionTokens = (stats.latencyCompletionTokens ?? 0) + m.completionTokens;
    }

    addCacheUsage(cacheByFormat, m.model, m.promptTokens, m.cachedTokens ?? 0, m.cacheCreationTokens ?? 0);

    if (m.summary) {
      stats.summaryGeneratedCount++;
      stats.summaryTotalCost += m.summaryCost ?? 0;
      stats.summaryTotalTokens += m.summaryTokens ?? 0;
      const reads = m.summaryReadCount ?? 0;
      stats.summaryTotalReadCount += reads;
      if (reads > 0) stats.summaryUniqueReadCount++;
    }

    if (!stats.firstMessageAt || m.created < stats.firstMessageAt) {
      stats.firstMessageAt = m.created;
    }
    if (!stats.lastMessageAt || m.created > stats.lastMessageAt) {
      stats.lastMessageAt = m.created;
    }
  }

  // Non-message operations are persisted separately. They contribute usage,
  // but must not inflate chat-message/type counts or size distributions.
  for (const operation of operationUsages) {
    stats.totalPromptTokens += operation.promptTokens;
    stats.totalCompletionTokens += operation.completionTokens;
    stats.totalCachedTokens += operation.cachedTokens ?? 0;
    stats.totalCacheCreationTokens += operation.cacheCreationTokens ?? 0;
    stats.totalCost += operation.totalCost;
    stats.totalWebSearches += operation.searchCount ?? 0;
    addCacheUsage(
      cacheByFormat,
      operation.model,
      operation.promptTokens,
      operation.cachedTokens ?? 0,
      operation.cacheCreationTokens ?? 0,
    );
  }

  stats.providerBreakdown = aggregateProviderBreakdown(messages, operationUsages);

  for (const t of topics) {
    if (t.scratchpad) stats.topicsWithScratchpad++;
    stats.totalForks += t.forks?.length ?? 0;
    if (t.mode === 'debate') stats.debateTopicCount++;
  }

  const auth = useAuthStore.getState();
  stats.features = {
    messageRetrievalEnabled: auth.messageRetrievalEnabled ? 'ON' : 'OFF',
    aiSummaryEnabled: auth.aiSummaryEnabled ? 'ON' : 'OFF',
    summaryModel: auth.summaryModel,
    replyPredictionEnabled: auth.replyPredictionEnabled ? 'ON' : 'OFF',
    ragEnabled: auth.ragEnabled ? 'ON' : 'OFF',
    ttsEnabled: auth.ttsEnabled ? 'ON' : 'OFF',
    maxContextTokens: String(auth.maxContextTokens),
    defaultMaxContextMessages: String(auth.defaultMaxContextMessages),
  };

  return stats;
}

function getImportedSourcesRaw(): Record<string, AnalyticsExport> {
  try {
    const raw = localStorage.getItem('analyticsImportedSources');
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, AnalyticsExport>;
    }
    return {};
  } catch {
    return {};
  }
}

export function getImportedSources(): Record<string, AnalyticsExport> {
  return getImportedSourcesRaw();
}

export function saveImportedSource(source: AnalyticsExport): void {
  const sources = getImportedSourcesRaw();
  sources[source.deviceId] = source;
  localStorage.setItem('analyticsImportedSources', JSON.stringify(sources));
}

export function removeImportedSource(deviceId: string): void {
  const sources = getImportedSourcesRaw();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [deviceId]: _removed, ...rest } = sources;
  localStorage.setItem('analyticsImportedSources', JSON.stringify(rest));
}

const DAY_MS = 86_400_000;

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Shift a `YYYY-MM-DD` date by whole days in UTC. */
function shiftUtcDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function emptySnapshot(date: string): AnalyticsSnapshot {
  return {
    date,
    messageCount: 0,
    failedCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    cost: 0,
    latencySamples: [],
    providerStats: {},
    toolStats: {},
  };
}

function toTrendRow(snap: AnalyticsSnapshot): TrendRow {
  return {
    date: snap.date,
    messageCount: snap.messageCount,
    cost: snap.cost,
    tokens: snap.promptTokens + snap.completionTokens,
    // Error rates use two decimals so small failure counts are not shown as 0%.
    failPercent: snap.messageCount > 0 ? Math.round((snap.failedCount / snap.messageCount) * 10000) / 100 : 0,
    p50Latency: percentileNearestRank(snap.latencySamples ?? [], 50),
    p95Latency: percentileNearestRank(snap.latencySamples ?? [], 95),
  };
}

/**
 * Preset trends cover the last `days` calendar dates in UTC, ending on the
 * reference date's UTC date. Dates without a snapshot are included as zero
 * rows so the chart represents elapsed time rather than active days only.
 */
export async function computeTrends(days: number, now: Date = new Date()): Promise<TrendRow[]> {
  return computeTrendsRange(days, undefined, now);
}

export async function computeTrendsRange(
  maxDaysOrFrom?: number | string,
  toDate?: string,
  now: Date = new Date(),
): Promise<TrendRow[]> {
  const snapshots = await athenaDb.analyticsSnapshots.orderBy('date').reverse().toArray();

  if (typeof maxDaysOrFrom === 'number' && toDate === undefined) {
    const dayCount = Math.floor(maxDaysOrFrom);
    if (dayCount <= 0) return [];

    const byDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot]));
    const endDate = utcDateString(now);
    const startDate = shiftUtcDate(endDate, -(dayCount - 1));

    return Array.from({ length: dayCount }, (_, index) => {
      const date = shiftUtcDate(startDate, index);
      return toTrendRow(byDate.get(date) ?? emptySnapshot(date));
    });
  }

  // Custom range mode or "all time" — snapshots are descending, so reverse to
  // ascending. These modes still show recorded (active) dates only.
  const ascending = [...snapshots].reverse();
  const fromDate = typeof maxDaysOrFrom === 'string' ? maxDaysOrFrom : undefined;

  return ascending
    .filter((snapshot) => fromDate === undefined || snapshot.date >= fromDate)
    .filter((snapshot) => toDate === undefined || snapshot.date <= toDate)
    .map(toTrendRow);
}

export async function computeLatencyPercentiles(): Promise<LatencyPercentiles> {
  const snapshots = await athenaDb.analyticsSnapshots.toArray();
  const allSamples = snapshots.flatMap((s) => s.latencySamples ?? []);

  return {
    p50: percentileNearestRank(allSamples, 50),
    p95: percentileNearestRank(allSamples, 95),
  };
}

export async function computeProviderBreakdown(): Promise<ProviderBreakdown[]> {
  const [messages, operationUsages] = await Promise.all([
    athenaDb.messages.toArray(),
    athenaDb.llmOperationUsages.toArray(),
  ]);
  return aggregateProviderBreakdown(messages, operationUsages);
}

export async function computeToolUsageBreakdown(): Promise<ToolUsageRow[]> {
  const snapshots = await athenaDb.analyticsSnapshots.toArray();

  if (snapshots.length === 0) {
    return computeToolUsageFromMessages();
  }

  const merged: Record<string, { calls: number; successCount: number; errors: string[] }> = {};
  for (const snap of snapshots) {
    for (const [tool, stats] of Object.entries(snap.toolStats ?? {})) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      merged[tool] = merged[tool] ?? { calls: 0, successCount: 0, errors: [] };
      merged[tool].calls += stats.calls;
      merged[tool].successCount += stats.successCount;
      for (const err of stats.errors) {
        if (!merged[tool].errors.includes(err) && merged[tool].errors.length < 10) {
          merged[tool].errors.push(err);
        }
      }
    }
  }

  return Object.entries(merged)
    .map(([tool, stats]) => ({
      tool,
      calls: stats.calls,
      successRate: stats.calls > 0 ? Math.round((stats.successCount / stats.calls) * 100) : 0,
      errors: stats.errors,
    }))
    .sort((a, b) => b.calls - a.calls);
}

async function computeToolUsageFromMessages(): Promise<ToolUsageRow[]> {
  const messages = await athenaDb.messages.toArray();
  const operationUsages = await athenaDb.llmOperationUsages.toArray();
  const merged: Record<string, { calls: number; successCount: number; errors: string[] }> = {};

  const addToolUsage = (rawResponse: string | undefined): void => {
    if (!rawResponse) return;
    try {
      const parsed: unknown = JSON.parse(rawResponse);
      if (typeof parsed !== 'object' || parsed === null) return;
      const obj = parsed as Record<string, unknown>;
      const trace = obj.toolLoopTrace;
      if (!Array.isArray(trace)) return;

      for (const iteration of trace) {
        const iterObj = iteration as Record<string, unknown>;
        const toolResults = iterObj.toolResults;
        if (!Array.isArray(toolResults)) continue;

        for (const tr of toolResults) {
          const trObj = tr as Record<string, unknown>;
          const toolName = trObj.toolName;
          const resultStr = trObj.result;
          if (typeof toolName !== 'string') continue;

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          merged[toolName] = merged[toolName] ?? { calls: 0, successCount: 0, errors: [] };
          merged[toolName].calls++;
          if (typeof resultStr !== 'string' || !resultStr.startsWith('Error')) {
            merged[toolName].successCount++;
          } else {
            const errStr = typeof resultStr === 'string' ? resultStr : String(resultStr);
            if (!merged[toolName].errors.includes(errStr) && merged[toolName].errors.length < 10) {
              merged[toolName].errors.push(errStr);
            }
          }
        }
      }
    } catch {
      // skip invalid rawResponse
    }
  };

  for (const m of messages) addToolUsage(m.rawResponse);
  for (const operation of operationUsages) addToolUsage(operation.rawResponse);

  return Object.entries(merged)
    .map(([tool, stats]) => ({
      tool,
      calls: stats.calls,
      successRate: stats.calls > 0 ? Math.round((stats.successCount / stats.calls) * 100) : 0,
      errors: stats.errors,
    }))
    .sort((a, b) => b.calls - a.calls);
}

export function exportAnalytics(userId: string): Promise<void> {
  return computeLocalStats().then((stats) => {
    const data: AnalyticsExport = {
      format: 'athena-analytics-v2',
      deviceId: useAuthStore.getState().deviceId,
      userId,
      exportedAt: new Date().toISOString(),
      appVersion: process.env.REACT_APP_VERSION ?? 'unknown',
      stats,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `athena-analytics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

export function importAnalytics(file: File): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      try {
        const raw: unknown = JSON.parse(reader.result as string);
        if (typeof raw !== 'object' || raw === null) {
          resolve({ success: false, message: 'Invalid analytics file format.' });
          return;
        }
        const format = (raw as Record<string, unknown>).format;
        if (format !== 'athena-analytics-v1' && format !== 'athena-analytics-v2') {
          resolve({ success: false, message: 'Invalid analytics file format.' });
          return;
        }
        const sourceData = raw as Record<string, unknown>;
        if (typeof sourceData.deviceId !== 'string' || !sourceData.stats) {
          resolve({ success: false, message: 'Missing required fields in analytics file.' });
          return;
        }
        const source = raw as AnalyticsExport;
        saveImportedSource(source);
        resolve({ success: true, message: `Imported analytics from ${source.userId || source.deviceId}.` });
      } catch {
        resolve({ success: false, message: 'Failed to parse analytics file.' });
      }
    };
    reader.onerror = (): void => {
      resolve({ success: false, message: 'Failed to read file.' });
    };
    reader.readAsText(file);
  });
}

export function mergeStatNumbers(current: number, imported: number): number {
  return current + imported;
}

export interface CombinedStats {
  local: AnalyticsStats;
  imported: Record<string, AnalyticsExport>;
}

export function getCombinedStats(local?: AnalyticsStats): CombinedStats {
  return {
    local: local ?? {
      summaryGeneratedCount: 0,
      summaryTotalCost: 0,
      summaryTotalTokens: 0,
      summaryTotalReadCount: 0,
      summaryUniqueReadCount: 0,
      totalMessages: 0,
      messagesByType: {},
      messagesByModel: {},
      failedMessageCount: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCachedTokens: 0,
      totalCacheCreationTokens: 0,
      totalCost: 0,
      messageSizeDistribution: {},
      userMessageSizeDistribution: {},
      assistantMessageSizeDistribution: {},
      totalAttachments: 0,
      totalWebSearches: 0,
      topicsWithScratchpad: 0,
      totalForks: 0,
      debateTopicCount: 0,
      messagesWithReasoning: 0,
      totalEmbeddings: 0,
      totalLatencyMs: 0,
      latencyCount: 0,
      latencyCompletionTokens: 0,
      firstMessageAt: null,
      lastMessageAt: null,
      features: {},
      cacheByFormat: createEmptyCacheByFormat(),
    },
    imported: getImportedSourcesRaw(),
  };
}
