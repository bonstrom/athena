import { athenaDb, AnalyticsSnapshot } from '../database/AthenaDb';
import { useProviderStore } from '../store/ProviderStore';

const ROLLUP_MARKER_KEY = 'analyticsRollupMarker';
const ROLLUP_LAST_ID_KEY = 'analyticsRollupLastId';
const MAX_LATENCY_SAMPLES = 300;

function getDateString(iso: string): string {
  return iso.slice(0, 10);
}

function getRollupMarker(): string {
  try {
    return localStorage.getItem(ROLLUP_MARKER_KEY) ?? '';
  } catch {
    return '';
  }
}

function getRollupLastId(): string {
  try {
    return localStorage.getItem(ROLLUP_LAST_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

function setRollupState(marker: string, lastId: string): void {
  try {
    localStorage.setItem(ROLLUP_MARKER_KEY, marker);
    localStorage.setItem(ROLLUP_LAST_ID_KEY, lastId);
  } catch {
    // non-critical
  }
}

export function resolveProviderName(modelApiId: string | undefined): string {
  if (!modelApiId) return 'unknown';
  const { models, providers } = useProviderStore.getState();
  const model = models.find((m) => m.apiModelId === modelApiId);
  if (!model) return 'unknown';
  const provider = providers.find((p) => p.id === model.providerId);
  return provider?.name ?? 'unknown';
}

function parseToolUsage(rawResponse: string | undefined): Record<string, { calls: number; successCount: number }> {
  const result: Record<string, { calls: number; successCount: number }> = {};
  if (!rawResponse) return result;

  try {
    const parsed: unknown = JSON.parse(rawResponse);
    if (typeof parsed !== 'object' || parsed === null) return result;
    const obj = parsed as Record<string, unknown>;
    const trace = obj.toolLoopTrace;
    if (!Array.isArray(trace)) return result;

    for (const iteration of trace) {
      const iterObj = iteration as Record<string, unknown>;
      const toolResults = iterObj.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const tr of toolResults) {
        const trObj = tr as Record<string, unknown>;
        const toolName = trObj.toolName;
        const resultStr = trObj.result;
        if (typeof toolName !== 'string') continue;

        result[toolName] = result[toolName] ?? { calls: 0, successCount: 0 };
        result[toolName].calls++;
        if (typeof resultStr !== 'string' || !resultStr.startsWith('Error')) {
          result[toolName].successCount++;
        }
      }
    }
  } catch {
    // rawResponse may not be valid JSON (e.g. older messages)
  }

  return result;
}

function mergeSnapshots(existing: AnalyticsSnapshot, incoming: AnalyticsSnapshot): AnalyticsSnapshot {
  const mergedLatency = [...(existing.latencySamples ?? []), ...(incoming.latencySamples ?? [])];
  if (mergedLatency.length > MAX_LATENCY_SAMPLES) {
    mergedLatency.length = MAX_LATENCY_SAMPLES;
  }

  const mergedProviderStats: Record<string, { cost: number; tokens: number; messageCount: number }> = { ...existing.providerStats ?? {} };
  for (const [key, val] of Object.entries(incoming.providerStats ?? {})) {
    mergedProviderStats[key] = mergedProviderStats[key] ?? { cost: 0, tokens: 0, messageCount: 0 };
    mergedProviderStats[key].cost += val.cost;
    mergedProviderStats[key].tokens += val.tokens;
    mergedProviderStats[key].messageCount += val.messageCount;
  }

  const mergedToolStats: Record<string, { calls: number; successCount: number }> = { ...existing.toolStats ?? {} };
  for (const [key, val] of Object.entries(incoming.toolStats ?? {})) {
    mergedToolStats[key] = mergedToolStats[key] ?? { calls: 0, successCount: 0 };
    mergedToolStats[key].calls += val.calls;
    mergedToolStats[key].successCount += val.successCount;
  }

  return {
    date: existing.date,
    messageCount: existing.messageCount + incoming.messageCount,
    failedCount: existing.failedCount + incoming.failedCount,
    promptTokens: existing.promptTokens + incoming.promptTokens,
    completionTokens: existing.completionTokens + incoming.completionTokens,
    cost: existing.cost + incoming.cost,
    latencySamples: mergedLatency,
    providerStats: mergedProviderStats,
    toolStats: mergedToolStats,
  };
}

export async function rollupAnalytics(): Promise<void> {
  const marker = getRollupMarker();
  const lastId = getRollupLastId();

  const messages = marker
    ? await athenaDb.messages.where('created').aboveOrEqual(marker).toArray()
    : await athenaDb.messages.toArray();

  const filtered = marker
    ? messages.filter((m) => !(m.created === marker && lastId !== '' && m.id <= lastId))
    : messages;

  if (filtered.length === 0) return;

  let latestCreated = marker;
  let latestId = lastId;

  const groupedByDate = new Map<string, AnalyticsSnapshot>();

  for (const m of filtered) {
    const date = getDateString(m.created);
    if (m.created > latestCreated || (m.created === latestCreated && m.id > latestId)) {
      latestCreated = m.created;
      latestId = m.id;
    }

    let snap = groupedByDate.get(date);
    if (!snap) {
      snap = {
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
      groupedByDate.set(date, snap);
    }

    snap.messageCount++;
    if (m.failed) snap.failedCount++;
    snap.promptTokens += m.promptTokens;
    snap.completionTokens += m.completionTokens;
    snap.cost += m.totalCost;

    if (m.latencyMs != null && m.latencyMs > 0) {
      snap.latencySamples.push(m.latencyMs);
      if (snap.latencySamples.length > MAX_LATENCY_SAMPLES) {
        snap.latencySamples.length = MAX_LATENCY_SAMPLES;
      }
    }

    const providerName = resolveProviderName(m.model);
    const pStat = snap.providerStats[providerName] ?? { cost: 0, tokens: 0, messageCount: 0 };
    pStat.cost += m.totalCost;
    pStat.tokens += m.promptTokens + m.completionTokens;
    pStat.messageCount++;
    snap.providerStats[providerName] = pStat;

    const toolUsage = parseToolUsage(m.rawResponse);
    for (const [toolName, stats] of Object.entries(toolUsage)) {
      const existing = snap.toolStats[toolName] ?? { calls: 0, successCount: 0 };
      existing.calls += stats.calls;
      existing.successCount += stats.successCount;
      snap.toolStats[toolName] = existing;
    }
  }

  for (const snap of groupedByDate.values()) {
    const existing = await athenaDb.analyticsSnapshots.get(snap.date);
    const merged = existing ? mergeSnapshots(existing, snap) : snap;
    await athenaDb.analyticsSnapshots.put(merged);
  }

  setRollupState(latestCreated, latestId);
}

export function idleDeferredRollup(): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      void rollupAnalytics();
    });
  } else {
    setTimeout(() => {
      void rollupAnalytics();
    }, 500);
  }
}
