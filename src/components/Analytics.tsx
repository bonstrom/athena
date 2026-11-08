import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  LinearProgress,
  Stack,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import { BarChart, LineChart } from '@mui/x-charts';
import {
  computeLocalStats,
  exportAnalytics,
  importAnalytics,
  getImportedSources,
  removeImportedSource,
  computeTrends,
  computeTrendsRange,
  computeLatencyPercentiles,
  computeProviderBreakdown,
  computeToolUsageBreakdown,
  AnalyticsStats,
  AnalyticsExport,
  ANALYTICS_EXPORT_PRIVACY_NOTE,
  TrendRow,
  ProviderBreakdown,
  ToolUsageRow,
  LatencyPercentiles,
} from '../services/analyticsService';
import { rollupAnalytics, resolveProviderName } from '../services/analyticsRollupService';
import { useAuthStore } from '../store/AuthStore';
import { formatCost as formatCostForCurrency } from '../utils/currency';

const SIZE_BUCKET_ORDER = ['0-100', '101-500', '501-1000', '1001-2000', '2001-4000', '4000-8000', '8000+'];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/** Legacy imports predate summaryTotalTokens, so read it defensively. */
function storedSummaryTokens(stats: AnalyticsStats): number {
  return (stats as { summaryTotalTokens?: number }).summaryTotalTokens ?? 0;
}

/** Read source metadata defensively because v1 files may omit newer fields. */
function sourceMetadata(source: AnalyticsExport): { format: string; exportedAt: string | undefined; appVersion: string } {
  const raw = source as { format?: string; exportedAt?: string; appVersion?: string };
  return {
    format: raw.format ?? 'unknown',
    exportedAt: raw.exportedAt,
    appVersion: raw.appVersion ?? 'unknown',
  };
}

function formatCost(n: number): string {
  return formatCostForCurrency(n, useAuthStore.getState().currency);
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return `${Math.round(ms)}ms`;
}

function SectionHeader({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1, mb: 2, fontWeight: 'bold' }}>
      {children}
    </Typography>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <Box display="flex" justifyContent="space-between" sx={{ mb: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight="medium">
        {value}
      </Typography>
    </Box>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }): React.ReactElement {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Box sx={{ mb: 1 }}>
      <Box display="flex" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" fontWeight="medium">
          {value} / {total} ({pct}%)
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
    </Box>
  );
}

function dateLabel(ds: string): string {
  return ds.slice(5);
}

/** Escape a value so it cannot break out of a Markdown table cell. */
function mdCell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function mdRow(cells: (string | number)[]): string {
  return `| ${cells.map(mdCell).join(' | ')} |`;
}

function mdTable(headers: string[], rows: (string | number)[][]): string {
  return [mdRow(headers), `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(mdRow)].join('\n');
}

/** Render an export timestamp, tolerating legacy files that lack one. */
function formatSourceDate(value: string | undefined, dateFormat: string): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleDateString(dateFormat);
}

interface AnalyticsReportInput {
  stats: AnalyticsStats;
  combined: AnalyticsStats | null;
  importedSources: Record<string, AnalyticsExport>;
  trends: TrendRow[];
  providerRows: ProviderBreakdown[];
  toolUsage: ToolUsageRow[];
  latencyPerc: LatencyPercentiles;
  dateFormat: string;
  userName: string;
  trendRangeLabel?: string;
}

/**
 * Build a self-contained Markdown report of everything the Analytics page
 * shows, so it can be pasted into an LLM for interpretation. Uses the same
 * aggregate data as the export and never includes conversation content.
 */
export function buildAnalyticsReport(input: AnalyticsReportInput): string {
  const { stats, combined, importedSources, trends, providerRows, toolUsage, latencyPerc, dateFormat, userName } = input;
  const { trendRangeLabel } = input;
  const total = combined ?? stats;
  const lines: string[] = [];

  const importedSourceEntries = Object.entries(importedSources);
  const legacySources = importedSourceEntries.filter(([, source]) => !source.stats.providerBreakdown);
  const recordedTokens = total.totalPromptTokens + total.totalCompletionTokens;
  const providerCost = providerRows.reduce((sum, row) => sum + row.cost, 0);
  const providerTokens = providerRows.reduce((sum, row) => sum + row.tokens, 0);
  const costCoverage = total.totalCost > 0 ? Math.min(100, (providerCost / total.totalCost) * 100) : 0;
  const tokenCoverage = recordedTokens > 0 ? Math.min(100, (providerTokens / recordedTokens) * 100) : 0;

  lines.push('# Athena Usage Analytics');
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleDateString(dateFormat)}`);
  lines.push(`Source: ${userName || 'This device'}${importedSourceEntries.length > 0 ? ' plus aggregated imports' : ''}`);
  if (total.firstMessageAt) {
    lines.push(`First activity: ${new Date(total.firstMessageAt).toLocaleDateString(dateFormat)}`);
  }
  if (total.lastMessageAt) {
    lines.push(`Last activity: ${new Date(total.lastMessageAt).toLocaleDateString(dateFormat)}`);
  }
  lines.push('');
  lines.push(`> ${ANALYTICS_EXPORT_PRIVACY_NOTE}`);
  lines.push('');

  // ── Aggregated sources ──
  if (importedSourceEntries.length > 0) {
    lines.push('## Aggregated Sources');
    lines.push('');
    const rows: (string | number)[][] = [
      [
        `${userName || 'This device'} (this device)`,
        stats.totalMessages,
        formatCost(stats.totalCost),
        'local',
        'now',
        process.env.REACT_APP_VERSION ?? 'unknown',
      ],
      ...importedSourceEntries.map(([, source]) => {
        const meta = sourceMetadata(source);
        return [
          source.userId || source.deviceId || 'Unknown',
          source.stats.totalMessages,
          formatCost(source.stats.totalCost),
          meta.format,
          formatSourceDate(meta.exportedAt, dateFormat),
          meta.appVersion,
        ];
      }),
      ['Combined', total.totalMessages, formatCost(total.totalCost), '', '', ''],
    ];
    lines.push(mdTable(['Source', 'Messages', 'Cost', 'Format', 'Exported', 'App'], rows));
    lines.push('');
    lines.push('Source metadata is read from each export file; the local row describes this device.');
    lines.push('');
  }

  // ── Totals ──
  lines.push('## Totals');
  lines.push('');
  lines.push(
    mdTable(
      ['Metric', 'Value'],
      [
        ['Messages', total.totalMessages],
        ['Failed messages', total.failedMessageCount],
        ['Prompt tokens (messages + operations)', formatTokens(total.totalPromptTokens)],
        ['Completion tokens (messages + operations)', formatTokens(total.totalCompletionTokens)],
        ['Cached tokens', formatTokens(total.totalCachedTokens)],
        ['Cache creation tokens', formatTokens(total.totalCacheCreationTokens)],
        ['Recorded tokens (messages + operations)', formatTokens(recordedTokens)],
        ['Recorded cost (messages + tracked operations)', formatCost(total.totalCost)],
        ['Stored summary cost (latest generation per message)', formatCost(total.summaryTotalCost)],
        ['Stored summary tokens (latest generation per message)', formatTokens(storedSummaryTokens(total))],
        ['Recorded subtotal incl. stored summary cost', formatCost(total.totalCost + total.summaryTotalCost)],
      ],
    ),
  );
  lines.push('');
  lines.push(
    'Recorded cost covers chat messages plus tracked background operations. Media generation, topic naming, reply prediction, and Curator direct calls are not tracked. Stored summary cost is a separate subtotal, not part of recorded cost.',
  );
  lines.push('');

  // ── Trends ──
  if (trends.length > 0) {
    lines.push('## Trends');
    lines.push('');
    if (trendRangeLabel) {
      lines.push(`Range: ${trendRangeLabel}`);
      lines.push('');
    }
    lines.push('Scope: this device only (local snapshot data).');
    lines.push('');
    lines.push(
      mdTable(
        ['Date (UTC)', 'Usage events', 'Cost', 'Tokens', 'Fail %', 'p50 latency', 'p95 latency'],
        trends.map((t) => [
          t.date,
          t.messageCount,
          formatCost(t.cost),
          formatTokens(t.tokens),
          `${t.failPercent}%`,
          t.p50Latency != null ? formatLatency(t.p50Latency) : 'N/A',
          t.p95Latency != null ? formatLatency(t.p95Latency) : 'N/A',
        ]),
      ),
    );
    lines.push('');
    lines.push(
      'Rows are active UTC dates only; dates without recorded activity are omitted. Usage events include background operations, not just chat messages. Latency percentiles use local snapshot samples only.',
    );
    lines.push('');
  }

  // ── By provider ──
  if (providerRows.length > 0) {
    lines.push('## By Provider');
    lines.push('');
    lines.push(
      'Assistant messages with a recorded model, grouped by the provider that model currently maps to, including aggregated sources.',
    );
    lines.push('');
    lines.push(
      mdTable(
        ['Provider', 'Assistant messages', 'Cost', 'Tokens'],
        providerRows.map((p) => [p.provider, p.messages, formatCost(p.cost), formatTokens(p.tokens)]),
      ),
    );
    if (legacySources.length > 0) {
      const legacyNames = legacySources.map(([, source]) => source.userId || source.deviceId || 'Unknown').join(', ');
      lines.push('');
      lines.push(
        `Legacy imports (${legacyNames}) predate provider-level cost/token tracking. Their message counts are included, but provider rows cover ${costCoverage.toFixed(
          1,
        )}% of recorded cost and ${tokenCoverage.toFixed(1)}% of recorded tokens in the combined totals.`,
      );
    }
    lines.push('');
    lines.push(
      'Cost and tokens include tracked background operations in addition to messages. "Unknown" groups models that no longer resolve to a configured provider; it is not a real provider.',
    );
    lines.push('');
  }

  // ── Messages by model ──
  const modelEntries = Object.entries(total.messagesByModel).sort(([, a], [, b]) => b - a);
  if (modelEntries.length > 0) {
    lines.push('## Messages by Model');
    lines.push('');
    lines.push('Assistant messages with a recorded model.');
    lines.push('');
    lines.push(mdTable(['Model', 'Messages'], modelEntries));
    lines.push('');
    lines.push('Counts use recorded model IDs; model IDs are not retroactively remapped.');
    lines.push('');
  }

  // ── Tool usage ──
  if (toolUsage.length > 0) {
    lines.push('## Tool Usage');
    lines.push('');
    lines.push('Scope: this device only (local tool logs).');
    lines.push('');
    lines.push(
      mdTable(
        ['Tool', 'Calls', 'Success rate'],
        toolUsage.map((t) => [t.tool, t.calls, `${t.successRate}%`]),
      ),
    );
    lines.push('');
    lines.push('Tool names appear as recorded; renamed tools may show as separate rows.');
    lines.push('');
  }

  // ── Summary effectiveness ──
  lines.push('## Summary Effectiveness');
  lines.push('');
  const readPercent =
    total.summaryGeneratedCount > 0
      ? `${Math.round((total.summaryUniqueReadCount / total.summaryGeneratedCount) * 100)}%`
      : '0%';
  lines.push(
    mdTable(
      ['Metric', 'Value'],
      [
        ['Messages with a stored summary', total.summaryGeneratedCount],
        ['Stored summary cost (latest generation per message)', formatCost(total.summaryTotalCost)],
        ['Stored summary tokens (latest generation per message)', formatTokens(storedSummaryTokens(total))],
        [
          'Messages with ≥1 tracked retrieval (truncation/RAG only)',
          `${total.summaryUniqueReadCount}/${total.summaryGeneratedCount} (${readPercent})`,
        ],
        ['Tracked retrieval events', total.summaryTotalReadCount],
      ],
    ),
  );
  lines.push('');
  lines.push(
    'Regenerating a summary overwrites its stored cost and tokens. Retrieval counts cover summaries injected by history truncation/RAG; history-directory previews are not counted.',
  );
  lines.push('');

  // ── Message size distribution ──
  lines.push('## Message Size Distribution (characters)');
  lines.push('');
  lines.push(
    mdTable(
      ['Bucket', 'User', 'LLM', 'Total'],
      SIZE_BUCKET_ORDER.map((bucket) => [
        bucket,
        total.userMessageSizeDistribution[bucket] || 0,
        total.assistantMessageSizeDistribution[bucket] || 0,
        total.messageSizeDistribution[bucket] || 0,
      ]),
    ),
  );
  lines.push('');

  // ── Performance ──
  const avgLatency = total.latencyCount > 0 ? total.totalLatencyMs / total.latencyCount : null;
  const avgTps =
    total.latencyCount > 0 && total.totalCompletionTokens > 0
      ? Math.round(total.totalCompletionTokens / (total.totalLatencyMs / 1000))
      : null;
  const cacheTotal = total.totalCachedTokens + total.totalCacheCreationTokens + total.totalPromptTokens;
  lines.push('## Performance');
  lines.push('');
  lines.push(
    mdTable(
      ['Metric', 'Value'],
      [
        [
          'Average latency (messages with recorded latency, combined)',
          avgLatency != null ? formatLatency(avgLatency) : 'N/A',
        ],
        ['p50 latency (this device, local snapshots)', latencyPerc.p50 != null ? formatLatency(latencyPerc.p50) : 'N/A'],
        ['p95 latency (this device, local snapshots)', latencyPerc.p95 != null ? formatLatency(latencyPerc.p95) : 'N/A'],
        ['Average tokens per second (approximate)', avgTps ?? 'N/A'],
        [
          'Cache hit rate (estimate; cached / (cached + cache creation + prompt))',
          cacheTotal > 0 ? `${Math.round((total.totalCachedTokens / cacheTotal) * 100)}%` : '0%',
        ],
      ],
    ),
  );
  lines.push('');
  lines.push(
    'Latency percentiles use local snapshot samples only, while the combined average uses message-level latency. Tokens per second is approximate because it divides all completion tokens by latency-bearing records only. Cache share is a token-ratio estimate, not a request-level hit rate.',
  );
  lines.push('');

  // ── Content stats ──
  const byType = total.messagesByType;
  lines.push('## Content Stats');
  lines.push('');
  lines.push('Scope: combined aggregated sources.');
  lines.push('');
  lines.push(
    mdTable(
      ['Metric', 'Value'],
      [
        ['User messages', byType.user || 0],
        ['Assistant messages', byType.assistant || 0],
        ['System messages', byType.system || 0],
        ['AI notes', byType.aiNote || 0],
        ['Failed messages', total.failedMessageCount],
        [
          'Error rate',
          total.totalMessages > 0
            ? `${((total.failedMessageCount / total.totalMessages) * 100).toFixed(2)}%`
            : '0.00%',
        ],
        ['Messages with reasoning', total.messagesWithReasoning],
        ['Messages with embeddings', total.totalEmbeddings],
        ['Total attachments', total.totalAttachments],
        ['Web searches', total.totalWebSearches],
        ['Forks (branches)', total.totalForks],
        ['Debate topics', total.debateTopicCount],
        ['Topics with scratchpad', total.topicsWithScratchpad],
      ],
    ),
  );
  lines.push('');

  // ── Active features ──
  const featureEntries = Object.entries(stats.features);
  if (featureEntries.length > 0) {
    lines.push('## Active Features');
    lines.push('');
    lines.push('Scope: this device only (current setting values, not historical).');
    lines.push('');
    lines.push(mdTable(['Feature', 'Value'], featureEntries));
    lines.push('');
  }

  return lines.join('\n');
}

const Analytics: React.FC = () => {
  const { userName, dateFormat } = useAuthStore();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [importedSources, setImportedSources] = useState<Record<string, AnalyticsExport>>({});
  const [loading, setLoading] = useState(true);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [trendDays, setTrendDays] = useState(7);
  const [trendMode, setTrendMode] = useState<'preset' | 'all' | 'custom'>('preset');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [latencyPerc, setLatencyPerc] = useState<LatencyPercentiles>({ p50: null, p95: null });
  const [providers, setProviders] = useState<ProviderBreakdown[]>([]);
  const [toolUsage, setToolUsage] = useState<ToolUsageRow[]>([]);
  const [snapshotReady, setSnapshotReady] = useState(false);

  const loadStats = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const s = await computeLocalStats();
      setStats(s);
      setImportedSources(getImportedSources());

      const providersPromise = s.providerBreakdown ? Promise.resolve(s.providerBreakdown) : computeProviderBreakdown();

      let trendPromise: Promise<TrendRow[]>;
      if (trendMode === 'all') {
        trendPromise = computeTrendsRange();
      } else if (trendMode === 'custom') {
        trendPromise = computeTrendsRange(customFrom || undefined, customTo || undefined);
      } else {
        trendPromise = computeTrends(trendDays);
      }

      const [trendData, percData, provData, toolData] = await Promise.all([
        trendPromise,
        computeLatencyPercentiles(),
        providersPromise,
        computeToolUsageBreakdown(),
      ]);
      setTrends(trendData);
      setLatencyPerc(percData);
      setProviders(provData);
      setToolUsage(toolData);
      setSnapshotReady(trendData.length > 0);
    } catch {
      setSnack({ open: true, message: 'Failed to load analytics.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [trendDays, trendMode, customFrom, customTo]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleExport = (): void => {
    void exportAnalytics(userName).then(() => {
      setSnack({ open: true, message: 'Analytics exported.', severity: 'success' });
      void loadStats();
    }).catch(() => {
      setSnack({ open: true, message: 'Failed to export analytics.', severity: 'error' });
    });
  };

  const handleImportClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    void importAnalytics(file).then((result) => {
      setSnack({ open: true, message: result.message, severity: result.success ? 'success' : 'error' });
      if (result.success) {
        void loadStats();
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveSource = (deviceId: string): void => {
    removeImportedSource(deviceId);
    setImportedSources(getImportedSources());
    setSnack({ open: true, message: 'Source removed.', severity: 'info' });
  };

  const handleRollupAndRefresh = (): void => {
    void rollupAnalytics().then(() => {
      void loadStats();
      setSnack({ open: true, message: 'Rollup complete.', severity: 'success' });
    });
  };

  const computeCombinedTotals = (): AnalyticsStats | null => {
    if (!stats) return null;
    let total = { ...stats };
    for (const source of Object.values(importedSources)) {
      const s = source.stats;
      total = {
        ...total,
        summaryGeneratedCount: total.summaryGeneratedCount + s.summaryGeneratedCount,
        summaryTotalCost: total.summaryTotalCost + s.summaryTotalCost,
        summaryTotalTokens: storedSummaryTokens(total) + storedSummaryTokens(s),
        summaryTotalReadCount: total.summaryTotalReadCount + s.summaryTotalReadCount,
        summaryUniqueReadCount: total.summaryUniqueReadCount + s.summaryUniqueReadCount,
        totalMessages: total.totalMessages + s.totalMessages,
        failedMessageCount: total.failedMessageCount + s.failedMessageCount,
        totalPromptTokens: total.totalPromptTokens + s.totalPromptTokens,
        totalCompletionTokens: total.totalCompletionTokens + s.totalCompletionTokens,
        totalCachedTokens: total.totalCachedTokens + s.totalCachedTokens,
        totalCacheCreationTokens: total.totalCacheCreationTokens + s.totalCacheCreationTokens,
        totalCost: total.totalCost + s.totalCost,
        totalAttachments: total.totalAttachments + s.totalAttachments,
        totalWebSearches: total.totalWebSearches + s.totalWebSearches,
        topicsWithScratchpad: total.topicsWithScratchpad + s.topicsWithScratchpad,
        totalForks: total.totalForks + s.totalForks,
        debateTopicCount: total.debateTopicCount + s.debateTopicCount,
        messagesWithReasoning: total.messagesWithReasoning + s.messagesWithReasoning,
        totalEmbeddings: total.totalEmbeddings + s.totalEmbeddings,
        totalLatencyMs: total.totalLatencyMs + s.totalLatencyMs,
        latencyCount: total.latencyCount + s.latencyCount,
        messagesByType: mergeRecordSum(total.messagesByType, s.messagesByType),
        messagesByModel: mergeRecordSum(total.messagesByModel, s.messagesByModel),
        messageSizeDistribution: mergeRecordSum(total.messageSizeDistribution, s.messageSizeDistribution),
        userMessageSizeDistribution: mergeRecordSum(total.userMessageSizeDistribution, s.userMessageSizeDistribution),
        assistantMessageSizeDistribution: mergeRecordSum(total.assistantMessageSizeDistribution, s.assistantMessageSizeDistribution),
        providerBreakdown: mergeProviderBreakdown(total.providerBreakdown, s.providerBreakdown),
        features: {},
        firstMessageAt: total.firstMessageAt
          ? s.firstMessageAt && s.firstMessageAt < total.firstMessageAt
            ? s.firstMessageAt
            : total.firstMessageAt
          : s.firstMessageAt,
        lastMessageAt: s.lastMessageAt && (!total.lastMessageAt || s.lastMessageAt > total.lastMessageAt) ? s.lastMessageAt : total.lastMessageAt,
      };
    }
    return total;
  };

  const combined = computeCombinedTotals();

  // Provider aggregates already carry authoritative message counts for local
  // data and for imports created by versions that include a provider
  // breakdown. Only legacy imports (which lack that field) need their message
  // counts derived from the model table, using the local provider mapping.
  const byProvider = new Map<string, ProviderBreakdown>();
  // Seed with the local fallback first so local providers are never dropped
  // when only some imported sources carry a provider breakdown.
  for (const row of providers) {
    byProvider.set(row.provider, { ...row });
  }
  for (const row of combined?.providerBreakdown ?? []) {
    byProvider.set(row.provider, { ...row });
  }
  for (const source of Object.values(importedSources)) {
    if (source.stats.providerBreakdown) continue;
    for (const [model, count] of Object.entries(source.stats.messagesByModel)) {
      const provider = resolveProviderName(model) ?? 'Unknown';
      const row = byProvider.get(provider) ?? { provider, messages: 0, cost: 0, tokens: 0 };
      row.messages += count;
      byProvider.set(provider, row);
    }
  }
  const providerRows: ProviderBreakdown[] = [...byProvider.values()].sort((a, b) => b.messages - a.messages);
  const hasLegacyImportedSources = Object.values(importedSources).some((s) => !s.stats.providerBreakdown);
  const legacySourceNames = Object.values(importedSources)
    .filter((s) => !s.stats.providerBreakdown)
    .map((s) => s.userId || s.deviceId || 'Unknown');
  const providerCostTotal = providerRows.reduce((sum, row) => sum + row.cost, 0);
  const providerTokenTotal = providerRows.reduce((sum, row) => sum + row.tokens, 0);
  const combinedRecordedTokens = combined ? combined.totalPromptTokens + combined.totalCompletionTokens : 0;
  const providerCostCoverage =
    combined && combined.totalCost > 0 ? Math.min(100, (providerCostTotal / combined.totalCost) * 100) : 0;
  const providerTokenCoverage =
    combinedRecordedTokens > 0 ? Math.min(100, (providerTokenTotal / combinedRecordedTokens) * 100) : 0;

  const handleCopyForLlm = (): void => {
    if (!stats) return;
    const trendRangeLabel =
      trendMode === 'all'
        ? 'All time, active UTC dates (this device)'
        : trendMode === 'custom'
          ? `Custom range (${customFrom || 'start'} to ${customTo || 'now'}), active UTC dates (this device)`
          : `Last ${trendDays} active UTC dates (this device)`;
    const report = buildAnalyticsReport({
      stats,
      combined,
      importedSources,
      trends,
      providerRows,
      toolUsage,
      latencyPerc,
      dateFormat,
      userName,
      trendRangeLabel,
    });
    navigator.clipboard
      .writeText(report)
      .then(() => {
        setSnack({ open: true, message: 'Analytics report copied to clipboard.', severity: 'success' });
      })
      .catch(() => {
        setSnack({ open: true, message: 'Failed to copy analytics report.', severity: 'error' });
      });
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', maxWidth: 800 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box sx={{ width: '100%', maxWidth: 800 }}>
        <Typography variant="body2" color="text.secondary">
          Failed to load analytics.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={4} sx={{ width: '100%', maxWidth: 800 }}>
      {/* ── Controls ── */}
      <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExport}>
          Export Analytics
        </Button>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopyForLlm}>
          Copy as Markdown
        </Button>
        <Button variant="outlined" startIcon={<UploadIcon />} onClick={handleImportClick}>
          Import Analytics
        </Button>
        <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImportFile} />
        <Button variant="text" size="small" startIcon={<RefreshIcon />} onClick={(): void => { void loadStats(); }}>
          Refresh
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {ANALYTICS_EXPORT_PRIVACY_NOTE}
      </Typography>

      {/* ── Local Data ── */}
      <Box>
        <SectionHeader>Local Data (this device)</SectionHeader>
        <StatRow label="Messages" value={stats.totalMessages.toLocaleString()} />
        <StatRow label="Recorded tokens" value={formatTokens(stats.totalPromptTokens + stats.totalCompletionTokens)} />
        <StatRow label="Recorded cost" value={formatCost(stats.totalCost)} />
        {stats.firstMessageAt && (
          <StatRow label="First message" value={new Date(stats.firstMessageAt).toLocaleDateString(dateFormat)} />
        )}
        {stats.lastMessageAt && (
          <StatRow label="Last message" value={new Date(stats.lastMessageAt).toLocaleDateString(dateFormat)} />
        )}
      </Box>

      {/* ── Empty snapshot notice ── */}
      {!snapshotReady && (
        <Alert severity="info" action={
          <Button color="inherit" size="small" onClick={handleRollupAndRefresh}>
            Rollup Now
          </Button>
        }>
          No snapshot data yet. Run a rollup to populate time-based analytics.
        </Alert>
      )}

      {/* ── Aggregated Sources ── */}
      {Object.keys(importedSources).length > 0 && (
        <Box>
          <SectionHeader>Aggregated Sources</SectionHeader>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
            Each imported source records its export format, export date, and app version; hover a source name to see
            them.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Source</TableCell>
                  <TableCell align="right">Msgs</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Summary reads</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
                  <TableCell>{userName || 'You'} (this device)</TableCell>
                  <TableCell align="right">{stats.totalMessages}</TableCell>
                  <TableCell align="right">{formatCost(stats.totalCost)}</TableCell>
                  <TableCell align="right">
                    {stats.summaryUniqueReadCount}/{stats.summaryGeneratedCount} (
                    {stats.summaryGeneratedCount > 0 ? Math.round((stats.summaryUniqueReadCount / stats.summaryGeneratedCount) * 100) : 0}
                    %)
                  </TableCell>
                  <TableCell align="right" />
                </TableRow>
                {Object.entries(importedSources).map(([deviceId, source]) => {
                  const meta = sourceMetadata(source);
                  return (
                    <TableRow key={deviceId}>
                      <TableCell>
                        <Tooltip
                          title={`${meta.format} · exported ${formatSourceDate(
                            meta.exportedAt,
                            dateFormat,
                          )} · v${meta.appVersion}`}
                        >
                          <span>{source.userId || 'Unknown'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">{source.stats.totalMessages}</TableCell>
                      <TableCell align="right">{formatCost(source.stats.totalCost)}</TableCell>
                      <TableCell align="right">
                        {source.stats.summaryUniqueReadCount}/{source.stats.summaryGeneratedCount} (
                        {source.stats.summaryGeneratedCount > 0
                          ? Math.round((source.stats.summaryUniqueReadCount / source.stats.summaryGeneratedCount) * 100)
                          : 0}
                        %)
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Remove source">
                          <Button size="small" color="error" onClick={(): void => handleRemoveSource(deviceId)}>
                            <DeleteIcon fontSize="small" />
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {Object.keys(importedSources).length > 0 && combined && (
                  <TableRow sx={{ '& td': { borderTop: '2px solid', borderColor: 'divider' } }}>
                    <TableCell><strong>Combined</strong></TableCell>
                    <TableCell align="right"><strong>{combined.totalMessages}</strong></TableCell>
                    <TableCell align="right"><strong>{formatCost(combined.totalCost)}</strong></TableCell>
                    <TableCell align="right">
                      <strong>
                        {combined.summaryUniqueReadCount}/{combined.summaryGeneratedCount} (
                        {combined.summaryGeneratedCount > 0
                          ? Math.round((combined.summaryUniqueReadCount / combined.summaryGeneratedCount) * 100)
                          : 0}
                        %)
                      </strong>
                    </TableCell>
                    <TableCell align="right" />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ── Trends ── */}
      {trends.length > 0 && (
        <Box>
          <SectionHeader>Trends</SectionHeader>
          <Box display="flex" gap={1} justifyContent="flex-end" alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Range</InputLabel>
              <Select
                value={trendMode}
                label="Range"
                onChange={(e): void => {
                  const mode = e.target.value as 'preset' | 'all' | 'custom';
                  setTrendMode(mode);
                  if (mode !== 'custom') {
                    setCustomFrom('');
                    setCustomTo('');
                  }
                }}
              >
                <MenuItem value="preset">Preset</MenuItem>
                <MenuItem value="all">All time</MenuItem>
                <MenuItem value="custom">Custom range</MenuItem>
              </Select>
            </FormControl>
            {trendMode === 'preset' && (
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Days</InputLabel>
                <Select value={trendDays} label="Days" onChange={(e): void => { setTrendDays(Number(e.target.value)); void loadStats(); }}>
                  <MenuItem value={7}>7 days</MenuItem>
                  <MenuItem value={30}>30 days</MenuItem>
                  <MenuItem value={90}>90 days</MenuItem>
                </Select>
              </FormControl>
            )}
            {trendMode === 'custom' && (
              <>
                <TextField
                  size="small"
                  type="date"
                  label="From"
                  value={customFrom}
                  onChange={(e): void => setCustomFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 150 }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="To"
                  value={customTo}
                  onChange={(e): void => setCustomTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 150 }}
                />
              </>
            )}
            {(trendMode === 'all' || trendMode === 'custom') && (
              <Button size="small" variant="outlined" onClick={(): void => { void loadStats(); }}>
                Apply
              </Button>
            )}
          </Box>
          <Box sx={{ mb: 2 }}>
            <LineChart
              xAxis={[{ data: trends.map((t) => dateLabel(t.date)), scaleType: 'band' }]}
              series={[
                { data: trends.map((t) => t.messageCount), label: 'Usage events', color: '#1976d2' },
              ]}
              height={200}
            />
          </Box>
          <Box sx={{ mb: 2 }}>
            <LineChart
              xAxis={[{ data: trends.map((t) => dateLabel(t.date)), scaleType: 'band' }]}
              series={[
                { data: trends.map((t) => t.cost), label: 'Cost', color: '#dc004e' },
              ]}
              height={200}
            />
          </Box>
          <Box sx={{ mb: 2 }}>
            <LineChart
              xAxis={[{ data: trends.map((t) => dateLabel(t.date)), scaleType: 'band' }]}
              series={[
                { data: trends.map((t) => t.failPercent), label: 'Fail %', color: '#ff9800' },
                { data: trends.map((t) => t.p50Latency ?? 0), label: 'p50 (ms)', color: '#4caf50' },
                { data: trends.map((t) => t.p95Latency ?? 0), label: 'p95 (ms)', color: '#9c27b0' },
              ]}
              height={200}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
            This device only, from local snapshot data. Rows are active UTC dates; inactive dates are omitted. Usage
            events include background operations. Latency percentiles use local snapshot samples only.
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date (UTC)</TableCell>
                  <TableCell align="right">Usage events</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell align="right">Fail %</TableCell>
                  <TableCell align="right">p50</TableCell>
                  <TableCell align="right">p95</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trends.map((t) => (
                  <TableRow key={t.date}>
                    <TableCell>{t.date}</TableCell>
                    <TableCell align="right">{t.messageCount}</TableCell>
                    <TableCell align="right">{formatCost(t.cost)}</TableCell>
                    <TableCell align="right">{formatTokens(t.tokens)}</TableCell>
                    <TableCell align="right">{t.failPercent}%</TableCell>
                    <TableCell align="right">{t.p50Latency != null ? formatLatency(t.p50Latency) : 'N/A'}</TableCell>
                    <TableCell align="right">{t.p95Latency != null ? formatLatency(t.p95Latency) : 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ── By Provider ── */}
      {providerRows.length > 0 && (
        <Box>
          <SectionHeader>By Provider</SectionHeader>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
            Assistant messages with a recorded model, grouped by the provider that model currently maps to, including
            aggregated sources. Cost and tokens include tracked background operations.
          </Typography>
          {hasLegacyImportedSources && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Legacy imports ({legacySourceNames.join(', ')}) predate provider-level cost/token tracking. Their message
              counts are still included, but provider rows cover {providerCostCoverage.toFixed(1)}% of recorded cost and{' '}
              {providerTokenCoverage.toFixed(1)}% of recorded tokens.
            </Alert>
          )}
          <Box sx={{ mb: 2 }}>
            <BarChart
              xAxis={[{ data: providerRows.map((p) => p.provider), scaleType: 'band' }]}
              series={[
                { data: providerRows.map((p) => p.messages), label: 'Assistant messages', color: '#1976d2' },
              ]}
              height={250}
            />
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Provider</TableCell>
                  <TableCell align="right">Assistant messages</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {providerRows.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell>{p.provider}</TableCell>
                    <TableCell align="right">{p.messages}</TableCell>
                    <TableCell align="right">{formatCost(p.cost)}</TableCell>
                    <TableCell align="right">{formatTokens(p.tokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            &quot;Unknown&quot; groups models that no longer resolve to a configured provider; it is not a real provider.
          </Typography>
        </Box>
      )}

      {/* ── Tool Usage ── */}
      {toolUsage.length > 0 && (
        <Box>
          <SectionHeader>Tool Usage</SectionHeader>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
            This device only, from local tool logs. Tool names appear as recorded, so renamed tools may show as
            separate rows.
          </Typography>
          <Box sx={{ mb: 2 }}>
            <BarChart
              xAxis={[{ data: toolUsage.map((t) => t.tool), scaleType: 'band' }]}
              series={[
                { data: toolUsage.map((t) => t.calls - Math.round(t.calls * t.successRate / 100)), label: 'Failed', color: '#dc004e' },
                { data: toolUsage.map((t) => Math.round(t.calls * t.successRate / 100)), label: 'Successful', color: '#4caf50' },
              ]}
              height={250}
            />
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tool</TableCell>
                  <TableCell align="right">Calls</TableCell>
                  <TableCell align="right">Success Rate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {toolUsage.map((t) => (
                  <TableRow key={t.tool}>
                    <TableCell>{t.tool}</TableCell>
                    <TableCell align="right">{t.calls}</TableCell>
                    <TableCell align="right">
                      {t.errors.length > 0 ? (
                        <Tooltip
                          title={
                            <Box component="span" sx={{ whiteSpace: 'pre-wrap', maxWidth: 400 }}>
                              {t.errors.map((e, i) => (
                                <Box key={i} component="span" sx={{ display: 'block', mb: i < t.errors.length - 1 ? 0.5 : 0 }}>
                                  {e}
                                </Box>
                              ))}
                            </Box>
                          }
                          placement="left"
                        >
                          <Typography component="span" variant="body2" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>
                            {t.successRate}%
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2">{t.successRate}%</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ── Summary Effectiveness ── */}
      <Box>
        <SectionHeader>Summary Effectiveness</SectionHeader>
        {combined ? (
          <>
            <StatRow label="Messages with a stored summary" value={combined.summaryGeneratedCount} />
            <StatRow
              label="Stored summary cost (latest generation per message)"
              value={formatCost(combined.summaryTotalCost)}
            />
            <StatRow
              label="Stored summary tokens (latest generation per message)"
              value={formatTokens(storedSummaryTokens(combined))}
            />
            <ProgressRow
              label="Messages with ≥1 tracked retrieval (truncation/RAG only)"
              value={combined.summaryUniqueReadCount}
              total={combined.summaryGeneratedCount}
            />
            <StatRow label="Tracked retrieval events" value={combined.summaryTotalReadCount} />
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              Regenerating a summary overwrites its stored cost and tokens. Retrieval counts cover summaries injected by
              history truncation/RAG; history-directory previews are not counted.
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No data available.
          </Typography>
        )}
      </Box>

      {/* ── Message Size Distribution ── */}
      <Box>
        <SectionHeader>Message Size Distribution</SectionHeader>
        {combined ? (
          <>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
              Message length in characters, grouped into buckets (for example, 0-100 characters).
            </Typography>
            <Box sx={{ mb: 2 }}>
              <BarChart
                xAxis={[{ data: SIZE_BUCKET_ORDER.map((bucket) => `${bucket} chars`), scaleType: 'band' }]}
                series={[
                  { data: SIZE_BUCKET_ORDER.map((b) => combined.userMessageSizeDistribution[b] || 0), label: 'User', color: '#1976d2' },
                  { data: SIZE_BUCKET_ORDER.map((b) => combined.assistantMessageSizeDistribution[b] || 0), label: 'LLM', color: '#4caf50' },
                ]}
                height={200}
              />
            </Box>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No data available.
          </Typography>
        )}
      </Box>

      {/* ── Messages by Model ── */}
      <Box>
        <SectionHeader>Messages by Model</SectionHeader>
        {combined && Object.keys(combined.messagesByModel).length > 0 ? (
          <>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
              Assistant messages with a recorded model, including aggregated sources. Counts use recorded model IDs;
              model IDs are not retroactively remapped.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Messages</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(combined.messagesByModel)
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, count]) => (
                    <TableRow key={model}>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {model}
                      </TableCell>
                      <TableCell align="right">{count}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No data available.
          </Typography>
        )}
      </Box>

      {/* ── Active Features ── */}
      <Box>
        <SectionHeader>Active Features</SectionHeader>
        {Object.keys(stats.features).length > 0 ? (
          <>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
              This device only, showing current setting values rather than historical settings.
            </Typography>
            {Object.entries(stats.features).map(([key, value]) => (
              <StatRow key={key} label={key} value={value} />
            ))}
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No features data.
          </Typography>
        )}
      </Box>

      {/* ── Performance ── */}
      <Box>
        <SectionHeader>Performance</SectionHeader>
        {combined ? (
          <>
            <StatRow
              label="Average latency (messages with recorded latency, combined)"
              value={combined.latencyCount > 0 ? formatLatency(combined.totalLatencyMs / combined.latencyCount) : 'N/A'}
            />
            <StatRow
              label="p50 latency (this device, local snapshots)"
              value={latencyPerc.p50 != null ? formatLatency(latencyPerc.p50) : 'N/A'}
            />
            <StatRow
              label="p95 latency (this device, local snapshots)"
              value={latencyPerc.p95 != null ? formatLatency(latencyPerc.p95) : 'N/A'}
            />
            <StatRow
              label="Average tokens per second (approximate)"
              value={
                combined.latencyCount > 0 && combined.totalCompletionTokens > 0
                  ? Math.round(combined.totalCompletionTokens / (combined.totalLatencyMs / 1000))
                  : 'N/A'
              }
            />
            <ProgressRow
              label="Cache hit rate (estimate; cached / (cached + cache creation + prompt))"
              value={combined.totalCachedTokens}
              total={combined.totalCachedTokens + combined.totalCacheCreationTokens + combined.totalPromptTokens}
            />
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              Percentiles use local snapshot samples only, while the combined average uses message-level latency.
              Tokens per second is approximate because it divides all completion tokens by latency-bearing records only.
              Cache share is a token-ratio estimate, not a request-level hit rate.
            </Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No data available.
          </Typography>
        )}
      </Box>

      {/* ── Content Stats ── */}
      <Box>
        <SectionHeader>Content Stats</SectionHeader>
        {combined ? (
          <>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
              Combined aggregated sources.
            </Typography>
            <StatRow label="User Messages" value={combined.messagesByType.user || 0} />
            <StatRow label="Assistant Messages" value={combined.messagesByType.assistant || 0} />
            <StatRow label="System Messages" value={combined.messagesByType.system || 0} />
            <StatRow label="AI Notes" value={combined.messagesByType.aiNote || 0} />
            <StatRow label="Failed Messages" value={combined.failedMessageCount} />
            <StatRow
              label="Error Rate"
              value={
                combined.totalMessages > 0
                  ? `${((combined.failedMessageCount / combined.totalMessages) * 100).toFixed(2)}%`
                  : '0.00%'
              }
            />
            <StatRow label="Messages with Reasoning" value={combined.messagesWithReasoning} />
            <StatRow label="Messages with Embeddings" value={combined.totalEmbeddings} />
            <StatRow label="Total Attachments" value={combined.totalAttachments} />
            <StatRow label="Web Searches" value={combined.totalWebSearches} />
            <StatRow label="Forks (branches)" value={combined.totalForks} />
            <StatRow label="Debate Topics" value={combined.debateTopicCount} />
            <StatRow label="Topics with Scratchpad" value={combined.topicsWithScratchpad} />
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No data available.
          </Typography>
        )}
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={(): void => setSnack({ ...snack, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={(): void => setSnack({ ...snack, open: false })} severity={snack.severity} sx={{ width: '100%' }}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

function mergeProviderBreakdown(
  a: ProviderBreakdown[] | undefined,
  b: ProviderBreakdown[] | undefined,
): ProviderBreakdown[] | undefined {
  if (!a && !b) return undefined;
  const merged = new Map<string, ProviderBreakdown>();
  for (const row of [...(a ?? []), ...(b ?? [])]) {
    const existing = merged.get(row.provider) ?? { provider: row.provider, messages: 0, cost: 0, tokens: 0 };
    existing.messages += row.messages;
    existing.cost += row.cost;
    existing.tokens += row.tokens;
    merged.set(row.provider, existing);
  }
  return [...merged.values()];
}

function mergeRecordSum(a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> {
  const result: Record<string, number> = { ...a ?? {} };
  for (const [key, value] of Object.entries(b ?? {})) {
    result[key] = (result[key] || 0) + value;
  }
  return result;
}

export default Analytics;
