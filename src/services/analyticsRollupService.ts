import { athenaDb, AnalyticsSnapshot } from '../database/AthenaDb';
import { useProviderStore } from '../store/ProviderStore';

const ROLLUP_MARKER_KEY = 'analyticsRollupMarker';
const ROLLUP_LAST_ID_KEY = 'analyticsRollupLastId';
const OWNERSHIP_REBUILT_FLAG = 'analyticsOwnershipRebuilt';
const MAX_LATENCY_SAMPLES = 300;

function getDateString(iso: string): string {
  return iso.slice(0, 10);
}

function readStringSetting(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function getRollupState(): Promise<{ marker: string; lastId: string }> {
  try {
    const markerSetting = await athenaDb.userSettings.get(ROLLUP_MARKER_KEY);
    const lastIdSetting = await athenaDb.userSettings.get(ROLLUP_LAST_ID_KEY);
    return {
      marker: readStringSetting(markerSetting?.value),
      lastId: readStringSetting(lastIdSetting?.value),
    };
  } catch {
    return { marker: '', lastId: '' };
  }
}

// Serializes rollup/rebuild runs so overlapping invocations cannot process the
// same message window twice. Tasks are chained onto a promise queue that never
// rejects, so a failed run never wedges subsequent runs.
let rollupQueue: Promise<unknown> = Promise.resolve();

function enqueueRollup(task: () => Promise<void>): Promise<void> {
  const run = rollupQueue.then(task);
  rollupQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function resolveProviderName(modelApiId: string | undefined): string | null {
  if (!modelApiId) return null;
  const { models, providers } = useProviderStore.getState();
  const model = models.find((m) => m.apiModelId === modelApiId);
  if (!model) return null;
  const provider = providers.find((p) => p.id === model.providerId);
  return provider?.name ?? null;
}

function parseToolUsage(rawResponse: string | undefined): Record<string, { calls: number; successCount: number; errors: string[] }> {
  const result: Record<string, { calls: number; successCount: number; errors: string[] }> = {};
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

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        result[toolName] = result[toolName] ?? { calls: 0, successCount: 0, errors: [] };
        result[toolName].calls++;
        if (typeof resultStr !== 'string' || !resultStr.startsWith('Error')) {
          result[toolName].successCount++;
        } else {
          const errStr = typeof resultStr === 'string' ? resultStr : String(resultStr);
          if (!result[toolName].errors.includes(errStr)) {
            if (result[toolName].errors.length < 10) {
              result[toolName].errors.push(errStr);
            }
          }
        }
      }
    }
  } catch {
    // rawResponse may not be valid JSON (e.g. older messages)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return result as Record<string, { calls: number; successCount: number; errors: string[] }>;
}

function mergeSnapshots(existing: AnalyticsSnapshot, incoming: AnalyticsSnapshot): AnalyticsSnapshot {
  const mergedLatency = [...(existing.latencySamples ?? []), ...(incoming.latencySamples ?? [])];
  if (mergedLatency.length > MAX_LATENCY_SAMPLES) {
    mergedLatency.length = MAX_LATENCY_SAMPLES;
  }

  const mergedProviderStats: Record<string, { cost: number; tokens: number; messageCount: number }> = { ...existing.providerStats ?? {} };
  for (const [key, val] of Object.entries(incoming.providerStats ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    mergedProviderStats[key] = mergedProviderStats[key] ?? { cost: 0, tokens: 0, messageCount: 0 };
    mergedProviderStats[key].cost += val.cost;
    mergedProviderStats[key].tokens += val.tokens;
    mergedProviderStats[key].messageCount += val.messageCount;
  }

  const mergedToolStats: Record<string, { calls: number; successCount: number; errors: string[] }> = { ...existing.toolStats ?? {} };
  for (const [key, val] of Object.entries(incoming.toolStats ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    mergedToolStats[key] = mergedToolStats[key] ?? { calls: 0, successCount: 0, errors: [] };
    mergedToolStats[key].calls += val.calls;
    mergedToolStats[key].successCount += val.successCount;
    for (const err of val.errors) {
      if (!mergedToolStats[key].errors.includes(err) && mergedToolStats[key].errors.length < 10) {
        mergedToolStats[key].errors.push(err);
      }
    }
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

type PopulatedSnapshot = AnalyticsSnapshot & {
  latencySamples: number[];
  providerStats: Record<string, { cost: number; tokens: number; messageCount: number }>;
  toolStats: Record<string, { calls: number; successCount: number; errors: string[] }>;
};

function createEmptySnapshot(date: string): PopulatedSnapshot {
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

async function runRollup(): Promise<void> {
  const { marker, lastId } = await getRollupState();

  const messages = marker
    ? await athenaDb.messages.where('created').aboveOrEqual(marker).toArray()
    : await athenaDb.messages.toArray();

  const filtered = marker
    ? messages.filter((m) => !(m.created === marker && lastId !== '' && m.id <= lastId))
    : messages;

  if (filtered.length === 0) return;

  let latestCreated = marker;
  let latestId = lastId;

  const groupedByDate = new Map<string, PopulatedSnapshot>();

  for (const m of filtered) {
    const date = getDateString(m.created);
    if (m.created > latestCreated || (m.created === latestCreated && m.id > latestId)) {
      latestCreated = m.created;
      latestId = m.id;
    }

    let snap = groupedByDate.get(date);
    if (!snap) {
      snap = createEmptySnapshot(date);
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
    if (providerName !== null) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const pStat = snap.providerStats[providerName] ?? { cost: 0, tokens: 0, messageCount: 0 };
      pStat.cost += m.totalCost;
      pStat.tokens += m.promptTokens + m.completionTokens;
      pStat.messageCount++;
      snap.providerStats[providerName] = pStat;
    }

    const toolUsage = parseToolUsage(m.rawResponse);
    for (const [toolName, stats] of Object.entries(toolUsage)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const existing = snap.toolStats[toolName] ?? { calls: 0, successCount: 0, errors: [] as string[] };
      existing.calls += stats.calls;
      existing.successCount += stats.successCount;
      for (const err of stats.errors) {
        if (!existing.errors.includes(err) && existing.errors.length < 10) {
          existing.errors.push(err);
        }
      }
      snap.toolStats[toolName] = existing;
    }
  }

  // Commit snapshots and advance the marker in a single transaction so the
  // marker can never move ahead of the snapshots it describes.
  await athenaDb.transaction('rw', [athenaDb.analyticsSnapshots, athenaDb.userSettings], async () => {
    for (const snap of groupedByDate.values()) {
      const existing = await athenaDb.analyticsSnapshots.get(snap.date);
      const merged = existing ? mergeSnapshots(existing, snap) : snap;
      await athenaDb.analyticsSnapshots.put(merged);
    }
    await athenaDb.userSettings.put({ id: ROLLUP_MARKER_KEY, value: latestCreated });
    await athenaDb.userSettings.put({ id: ROLLUP_LAST_ID_KEY, value: latestId });
  });
}

export function rollupAnalytics(): Promise<void> {
  return enqueueRollup(runRollup);
}

/**
 * One-time repair for the analytics ownership bug: user and assistant messages
 * used to both carry the request's cost/cache usage, inflating totals. This
 * zeroes cost/cache on user messages, rebuilds derived snapshots from scratch,
 * and resets the rollup marker. Guarded by a userSettings flag so it runs once.
 */
export async function rebuildAnalyticsOwnership(): Promise<void> {
  return enqueueRollup(async () => {
    let alreadyRebuilt = false;
    try {
      const flag = await athenaDb.userSettings.get(OWNERSHIP_REBUILT_FLAG);
      alreadyRebuilt = flag?.value === true;
    } catch {
      // If the flag can't be read, attempt the rebuild anyway.
    }

    if (alreadyRebuilt) return;

    // 1. Correct ownership: zero cost/cache on user messages (assistant owns them).
    await athenaDb.messages
      .filter(
        (m) =>
          m.type === 'user' &&
          (m.totalCost !== 0 || m.cachedTokens !== undefined || m.cacheCreationTokens !== undefined),
      )
      .modify((m) => {
        m.totalCost = 0;
        m.cachedTokens = 0;
        m.cacheCreationTokens = 0;
      });

    // 2. Reset derived snapshots + marker so the rollup rebuilds from scratch.
    await athenaDb.transaction('rw', [athenaDb.analyticsSnapshots, athenaDb.userSettings], async () => {
      await athenaDb.analyticsSnapshots.clear();
      await athenaDb.userSettings.put({ id: ROLLUP_MARKER_KEY, value: '' });
      await athenaDb.userSettings.put({ id: ROLLUP_LAST_ID_KEY, value: '' });
    });

    // Clear the legacy localStorage marker used before the Dexie migration.
    try {
      localStorage.removeItem('analyticsRollupMarker');
      localStorage.removeItem('analyticsRollupLastId');
    } catch {
      // non-critical
    }

    // 3. Rebuild derived snapshots from the corrected messages.
    await runRollup();

    // 4. Mark the rebuild complete (best-effort — retried on next startup if this fails).
    try {
      await athenaDb.userSettings.put({ id: OWNERSHIP_REBUILT_FLAG, value: true });
    } catch {
      // non-critical
    }
  });
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
