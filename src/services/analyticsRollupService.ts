import { athenaDb, AnalyticsSnapshot, LlmOperationUsage, Message } from '../database/AthenaDb';
import { useProviderStore } from '../store/ProviderStore';

const ROLLUP_MARKER_KEY = 'analyticsRollupMarker';
const ROLLUP_LAST_ID_KEY = 'analyticsRollupLastId';
const ROLLUP_LEDGER_KEY = 'analyticsRollupLedger';
const OWNERSHIP_REBUILT_FLAG = 'analyticsOwnershipRebuilt';
const MAX_LATENCY_SAMPLES = 300;

function getDateString(iso: string): string {
  return iso.slice(0, 10);
}

function readStringSetting(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface RecordContribution {
  date: string;
  failed: boolean;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  latencyMs?: number;
  providerName: string | null;
  toolUsage: Record<string, { calls: number; successCount: number; errors: string[] }>;
}

interface ContributionLedgerEntry {
  fingerprint: string;
  contribution: RecordContribution;
}

type ContributionLedger = Record<string, ContributionLedgerEntry | undefined>;

type RollupSourceRecord = Pick<
  Message & LlmOperationUsage,
  'id' | 'created' | 'failed' | 'promptTokens' | 'completionTokens' | 'totalCost' | 'latencyMs' | 'model' | 'rawResponse'
>;

function readLedger(value: unknown): ContributionLedger {
  if (typeof value === 'string') {
    if (!value) return {};
    try {
      return readLedger(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: ContributionLedger = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as { fingerprint?: unknown; contribution?: unknown };
    if (typeof candidate.fingerprint !== 'string') continue;
    if (typeof candidate.contribution !== 'object' || candidate.contribution === null) continue;
    result[key] = candidate as unknown as ContributionLedgerEntry;
  }
  return result;
}

async function getRollupState(): Promise<{ marker: string; lastId: string; ledger: ContributionLedger }> {
  // Fail closed: treating an unreadable checkpoint as a first run would replay
  // every source record into snapshots that already contain those records.
  const [markerSetting, lastIdSetting, ledgerSetting] = await Promise.all([
    athenaDb.userSettings.get(ROLLUP_MARKER_KEY),
    athenaDb.userSettings.get(ROLLUP_LAST_ID_KEY),
    athenaDb.userSettings.get(ROLLUP_LEDGER_KEY),
  ]);
  return {
    marker: readStringSetting(markerSetting?.value),
    lastId: readStringSetting(lastIdSetting?.value),
    ledger: readLedger(ledgerSetting?.value),
  };
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

function cloneSnapshot(snapshot: AnalyticsSnapshot): PopulatedSnapshot {
  return {
    ...snapshot,
    latencySamples: [...(snapshot.latencySamples ?? [])],
    providerStats: Object.fromEntries(
      Object.entries(snapshot.providerStats ?? {}).map(([key, stats]) => [key, { ...stats }]),
    ),
    toolStats: Object.fromEntries(
      Object.entries(snapshot.toolStats ?? {}).map(([key, stats]) => [key, { ...stats, errors: [...stats.errors] }]),
    ),
  };
}

function buildContribution(record: RollupSourceRecord): RecordContribution {
  return {
    date: getDateString(record.created),
    failed: record.failed,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalCost: record.totalCost,
    ...(record.latencyMs != null && record.latencyMs > 0 && { latencyMs: record.latencyMs }),
    providerName: resolveProviderName(record.model),
    toolUsage: parseToolUsage(record.rawResponse),
  };
}

function fingerprintContribution(record: RollupSourceRecord, contribution: RecordContribution): string {
  return JSON.stringify([record.created, contribution]);
}

function hasOtherErrorContribution(
  ledger: ContributionLedger,
  excludedKey: string,
  date: string,
  toolName: string,
  error: string,
): boolean {
  return Object.entries(ledger).some(([key, entry]) => {
    if (key === excludedKey || entry?.contribution.date !== date) return false;
    const stats = (entry.contribution.toolUsage as Record<string, { errors: string[] } | undefined>)[toolName];
    return stats?.errors.includes(error) ?? false;
  });
}

/** Add (`sign` 1) or remove (`sign` -1) one record's contribution. */
function applyContribution(snapshot: PopulatedSnapshot, contribution: RecordContribution, sign: 1 | -1): void {
  snapshot.messageCount += sign;
  if (contribution.failed) snapshot.failedCount += sign;
  snapshot.promptTokens += sign * contribution.promptTokens;
  snapshot.completionTokens += sign * contribution.completionTokens;
  snapshot.cost += sign * contribution.totalCost;

  if (contribution.latencyMs != null) {
    if (sign > 0) {
      snapshot.latencySamples.push(contribution.latencyMs);
      if (snapshot.latencySamples.length > MAX_LATENCY_SAMPLES) {
        snapshot.latencySamples.length = MAX_LATENCY_SAMPLES;
      }
    } else {
      const index = snapshot.latencySamples.indexOf(contribution.latencyMs);
      if (index >= 0) snapshot.latencySamples.splice(index, 1);
    }
  }

  if (contribution.providerName !== null) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const pStat = snapshot.providerStats[contribution.providerName] ?? { cost: 0, tokens: 0, messageCount: 0 };
    pStat.cost += sign * contribution.totalCost;
    pStat.tokens += sign * (contribution.promptTokens + contribution.completionTokens);
    pStat.messageCount += sign;
    snapshot.providerStats[contribution.providerName] = pStat;
  }

  for (const [toolName, stats] of Object.entries(contribution.toolUsage)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const existing = snapshot.toolStats[toolName] ?? { calls: 0, successCount: 0, errors: [] as string[] };
    existing.calls += sign * stats.calls;
    existing.successCount += sign * stats.successCount;
    if (sign > 0) {
      for (const err of stats.errors) {
        if (!existing.errors.includes(err) && existing.errors.length < 10) {
          existing.errors.push(err);
        }
      }
    } else {
      for (const err of stats.errors) {
        const index = existing.errors.indexOf(err);
        if (index >= 0) existing.errors.splice(index, 1);
      }
    }
    snapshot.toolStats[toolName] = existing;
  }
}

async function runRollup(): Promise<void> {
  const { marker, lastId, ledger } = await getRollupState();

  // Full scans are required: a record can be imported or committed with a
  // timestamp behind the cursor. The contribution ledger, not sort order,
  // decides whether each record is new or revised.
  const messages = await athenaDb.messages.toArray();
  const operationUsages = await athenaDb.llmOperationUsages.toArray();
  const records: { key: string; record: RollupSourceRecord }[] = [
    ...messages.map((record) => ({ key: `message:${record.id}`, record })),
    ...operationUsages.map((record) => ({ key: `operation:${record.id}`, record })),
  ];

  const hasLedger = Object.keys(ledger).length > 0;
  const legacyCursor = !hasLedger && marker !== '';
  // A legacy cursor plus existing snapshots cannot be safely migrated
  // incrementally: older records may have been omitted by the old cursor. Rebuild
  // those derived aggregates from the complete source once, then continue with
  // the ledger.
  const rebuildFromScratch = legacyCursor && (await athenaDb.analyticsSnapshots.toArray()).length > 0;
  const pending: {
    key: string;
    fingerprint: string;
    contribution: RecordContribution;
  }[] = [];
  const seeded: { key: string; fingerprint: string; contribution: RecordContribution }[] = [];
  let latestCreated = rebuildFromScratch ? '' : marker;
  let latestId = rebuildFromScratch ? '' : lastId;

  for (const { key, record } of records) {
    const contribution = buildContribution(record);
    const fingerprint = fingerprintContribution(record, contribution);
    const previous = ledger[key];
    if (!rebuildFromScratch && previous?.fingerprint === fingerprint) continue;

    const atOrBeforeLegacyCursor =
      marker !== '' && (record.created < marker || (record.created === marker && lastId !== '' && record.id <= lastId));
    if (!rebuildFromScratch && !previous && !hasLedger && atOrBeforeLegacyCursor) {
      // Seed the ledger so the next run does not treat these as newly imported.
      seeded.push({ key, fingerprint, contribution });
      continue;
    }

    pending.push({ key, fingerprint, contribution });
    if (record.created > latestCreated || (record.created === latestCreated && record.id > latestId)) {
      latestCreated = record.created;
      latestId = record.id;
    }
  }

  if (pending.length === 0 && seeded.length === 0 && !rebuildFromScratch) return;

  // Commit snapshots, the contribution ledger, and the legacy cursor in one
  // transaction. The ledger is re-read here so two independent instances that
  // selected the same batch cannot both add it.
  await athenaDb.transaction('rw', [athenaDb.analyticsSnapshots, athenaDb.userSettings], async () => {
    const [ledgerSetting, markerSetting, lastIdSetting] = await Promise.all([
      athenaDb.userSettings.get(ROLLUP_LEDGER_KEY),
      athenaDb.userSettings.get(ROLLUP_MARKER_KEY),
      athenaDb.userSettings.get(ROLLUP_LAST_ID_KEY),
    ]);
    const committedLedger = readLedger(ledgerSetting?.value);
    const committedMarker = readStringSetting(markerSetting?.value);
    const committedLastId = readStringSetting(lastIdSetting?.value);

    // Another instance may have completed the legacy migration after this run
    // prepared its rebuild. Its newer snapshot/ledger pair is authoritative;
    // clearing it here could omit records this preparation did not observe.
    if (rebuildFromScratch && Object.keys(committedLedger).length > 0) return;

    const snapshotsByDate = new Map<string, PopulatedSnapshot>();
    const snapshotFor = async (date: string): Promise<PopulatedSnapshot> => {
      const cached = snapshotsByDate.get(date);
      if (cached) return cached;
      const existing = rebuildFromScratch ? undefined : await athenaDb.analyticsSnapshots.get(date);
      const snap = existing ? cloneSnapshot(existing) : createEmptySnapshot(date);
      snapshotsByDate.set(date, snap);
      return snap;
    };

    let changed = false;
    for (const item of pending) {
      const committed = committedLedger[item.key];
      if (!rebuildFromScratch && committed?.fingerprint === item.fingerprint) continue;
      // Apply corrections to the existing aggregate, not a delta snapshot.
      // This lets latency samples and error strings actually be removed.
      if (!rebuildFromScratch && committed) {
        const previousSnapshot = await snapshotFor(committed.contribution.date);
        const retainedErrors: { toolName: string; errors: string[] }[] = [];
        for (const [toolName, stats] of Object.entries(committed.contribution.toolUsage)) {
          const shared = stats.errors.filter((error) =>
            hasOtherErrorContribution(
              committedLedger,
              item.key,
              committed.contribution.date,
              toolName,
              error,
            ),
          );
          if (shared.length > 0) retainedErrors.push({ toolName, errors: shared });
        }
        applyContribution(previousSnapshot, committed.contribution, -1);
        for (const { toolName, errors } of retainedErrors) {
          const toolStats = (
            previousSnapshot.toolStats as Record<string, { calls: number; successCount: number; errors: string[] } | undefined>
          )[toolName];
          if (!toolStats) continue;
          for (const error of errors) {
            if (!toolStats.errors.includes(error) && toolStats.errors.length < 10) toolStats.errors.push(error);
          }
        }
      }
      applyContribution(await snapshotFor(item.contribution.date), item.contribution, 1);
      committedLedger[item.key] = { fingerprint: item.fingerprint, contribution: item.contribution };
      changed = true;
    }

    let ledgerChanged = false;
    for (const item of seeded) {
      if (committedLedger[item.key]) continue;
      committedLedger[item.key] = { fingerprint: item.fingerprint, contribution: item.contribution };
      ledgerChanged = true;
    }
    if (!changed && !ledgerChanged && !rebuildFromScratch) return;

    if (rebuildFromScratch) {
      await athenaDb.analyticsSnapshots.clear();
    }
    for (const snap of snapshotsByDate.values()) {
      await athenaDb.analyticsSnapshots.put(snap);
    }

    const useIncomingCursor =
      rebuildFromScratch || latestCreated > committedMarker || (latestCreated === committedMarker && latestId > committedLastId);
    await athenaDb.userSettings.put({
      id: ROLLUP_MARKER_KEY,
      value: useIncomingCursor ? latestCreated : committedMarker,
    });
    await athenaDb.userSettings.put({
      id: ROLLUP_LAST_ID_KEY,
      value: useIncomingCursor ? latestId : committedLastId,
    });
    await athenaDb.userSettings.put({ id: ROLLUP_LEDGER_KEY, value: JSON.stringify(committedLedger) });
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
      .filter((m) => m.type === 'user' && (m.totalCost !== 0 || m.cachedTokens !== undefined || m.cacheCreationTokens !== undefined))
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
      await athenaDb.userSettings.put({ id: ROLLUP_LEDGER_KEY, value: '' });
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
