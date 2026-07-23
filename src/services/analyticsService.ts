import { athenaDb } from '../database/AthenaDb';
import { useAuthStore } from '../store/AuthStore';

export interface AnalyticsStats {
  summaryGeneratedCount: number;
  summaryTotalCost: number;
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
  totalAttachments: number;
  totalWebSearches: number;
  topicsWithScratchpad: number;
  totalForks: number;
  debateTopicCount: number;
  messagesWithReasoning: number;
  totalEmbeddings: number;
  totalLatencyMs: number;
  latencyCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  features: Record<string, string>;
}

export interface AnalyticsExport {
  format: 'athena-analytics-v1';
  deviceId: string;
  userId: string;
  exportedAt: string;
  appVersion: string;
  stats: AnalyticsStats;
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

export async function computeLocalStats(): Promise<AnalyticsStats> {
  const messages = await athenaDb.messages.toArray();
  const topics = await athenaDb.topics.toArray();

  const stats: AnalyticsStats = {
    summaryGeneratedCount: 0,
    summaryTotalCost: 0,
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
    totalAttachments: 0,
    totalWebSearches: 0,
    topicsWithScratchpad: 0,
    totalForks: 0,
    debateTopicCount: 0,
    messagesWithReasoning: 0,
    totalEmbeddings: 0,
    totalLatencyMs: 0,
    latencyCount: 0,
    firstMessageAt: null,
    lastMessageAt: null,
    features: {},
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

    stats.totalAttachments += m.attachments?.length ?? 0;
    stats.totalWebSearches += m.searchCount ?? 0;

    if (m.reasoning) stats.messagesWithReasoning++;
    if (m.embedding) stats.totalEmbeddings++;

    if (m.latencyMs != null) {
      stats.totalLatencyMs += m.latencyMs;
      stats.latencyCount++;
    }

    if (m.summary) {
      stats.summaryGeneratedCount++;
      stats.summaryTotalCost += m.summaryCost ?? 0;
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

  for (const t of topics) {
    if (t.scratchpad) stats.topicsWithScratchpad++;
    stats.totalForks += (t.forks?.length ?? 0);
    if (t.mode === 'debate') stats.debateTopicCount++;
  }

  const auth = useAuthStore.getState();
  stats.features = {
    messageRetrievalEnabled: auth.messageRetrievalEnabled ? 'ON' : 'OFF',
    askUserEnabled: auth.askUserEnabled ? 'ON' : 'OFF',
    aiSummaryEnabled: auth.aiSummaryEnabled ? 'ON' : 'OFF',
    summaryModel: auth.summaryModel,
    replyPredictionEnabled: auth.replyPredictionEnabled ? 'ON' : 'OFF',
    llmSuggestionEnabled: auth.llmSuggestionEnabled ? 'ON' : 'OFF',
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

export function exportAnalytics(userId: string): Promise<void> {
  return computeLocalStats().then((stats) => {
    const data: AnalyticsExport = {
      format: 'athena-analytics-v1',
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
        if (typeof raw !== 'object' || raw === null || (raw as Record<string, unknown>).format !== 'athena-analytics-v1') {
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
    local: local ?? { summaryGeneratedCount: 0, summaryTotalCost: 0, summaryTotalReadCount: 0, summaryUniqueReadCount: 0, totalMessages: 0, messagesByType: {}, messagesByModel: {}, failedMessageCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, totalCacheCreationTokens: 0, totalCost: 0, messageSizeDistribution: {}, totalAttachments: 0, totalWebSearches: 0, topicsWithScratchpad: 0, totalForks: 0, debateTopicCount: 0, messagesWithReasoning: 0, totalEmbeddings: 0, totalLatencyMs: 0, latencyCount: 0, firstMessageAt: null, lastMessageAt: null, features: {} },
    imported: getImportedSourcesRaw(),
  };
}
