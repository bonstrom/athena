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
import { Download as DownloadIcon, Upload as UploadIcon, Delete as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
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
  TrendRow,
  ProviderBreakdown,
  ToolUsageRow,
  LatencyPercentiles,
} from '../services/analyticsService';
import { rollupAnalytics } from '../services/analyticsRollupService';
import { useAuthStore } from '../store/AuthStore';

const SIZE_BUCKET_ORDER = ['0-100', '101-500', '501-1000', '1001-2000', '2001-4000', '4000-8000', '8000+'];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n: number): string {
  return n.toFixed(2) + ' kr';
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
  const [sizeDistType, setSizeDistType] = useState<'all' | 'user' | 'assistant'>('all');

  const loadStats = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const s = await computeLocalStats();
      setStats(s);
      setImportedSources(getImportedSources());

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
        computeProviderBreakdown(),
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
        userMessageSizeDistribution: mergeRecordSum(total.userMessageSizeDistribution ?? {}, s.userMessageSizeDistribution ?? {}),
        assistantMessageSizeDistribution: mergeRecordSum(total.assistantMessageSizeDistribution ?? {}, s.assistantMessageSizeDistribution ?? {}),
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
        <Button variant="outlined" startIcon={<UploadIcon />} onClick={handleImportClick}>
          Import Analytics
        </Button>
        <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImportFile} />
        <Button variant="text" size="small" startIcon={<RefreshIcon />} onClick={(): void => { void loadStats(); }}>
          Refresh
        </Button>
      </Box>

      {/* ── Local Data ── */}
      <Box>
        <SectionHeader>Local Data (this device)</SectionHeader>
        <StatRow label="Messages" value={stats.totalMessages.toLocaleString()} />
        <StatRow label="Total Tokens" value={formatTokens(stats.totalPromptTokens + stats.totalCompletionTokens)} />
        <StatRow label="Total Cost" value={formatCost(stats.totalCost)} />
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
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Source</TableCell>
                  <TableCell align="right">Msgs</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Summaries</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
                  <TableCell>{userName || 'You'} (this device)</TableCell>
                  <TableCell align="right">{stats.totalMessages}</TableCell>
                  <TableCell align="right">{formatCost(stats.totalCost)}</TableCell>
                  <TableCell align="right">
                    {stats.summaryGeneratedCount}/{stats.summaryUniqueReadCount} (
                    {stats.summaryGeneratedCount > 0 ? Math.round((stats.summaryUniqueReadCount / stats.summaryGeneratedCount) * 100) : 0}
                    %)
                  </TableCell>
                  <TableCell align="right" />
                </TableRow>
                {Object.entries(importedSources).map(([deviceId, source]) => (
                  <TableRow key={deviceId}>
                    <TableCell>{source.userId || 'Unknown'}</TableCell>
                    <TableCell align="right">{source.stats.totalMessages}</TableCell>
                    <TableCell align="right">{formatCost(source.stats.totalCost)}</TableCell>
                    <TableCell align="right">
                      {source.stats.summaryGeneratedCount}/{source.stats.summaryUniqueReadCount} (
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
                ))}
                {Object.keys(importedSources).length > 0 && combined && (
                  <TableRow sx={{ '& td': { borderTop: '2px solid', borderColor: 'divider' } }}>
                    <TableCell><strong>Combined</strong></TableCell>
                    <TableCell align="right"><strong>{combined.totalMessages}</strong></TableCell>
                    <TableCell align="right"><strong>{formatCost(combined.totalCost)}</strong></TableCell>
                    <TableCell align="right">
                      <strong>
                        {combined.summaryGeneratedCount}/{combined.summaryUniqueReadCount} (
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
                { data: trends.map((t) => t.messageCount), label: 'Messages', color: '#1976d2' },
              ]}
              height={200}
            />
          </Box>
          <Box sx={{ mb: 2 }}>
            <LineChart
              xAxis={[{ data: trends.map((t) => dateLabel(t.date)), scaleType: 'band' }]}
              series={[
                { data: trends.map((t) => t.cost), label: 'Cost (kr)', color: '#dc004e' },
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
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Messages</TableCell>
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
      {providers.length > 0 && (
        <Box>
          <SectionHeader>By Provider</SectionHeader>
          <Box sx={{ mb: 2 }}>
            <BarChart
              xAxis={[{ data: providers.map((p) => p.provider), scaleType: 'band' }]}
              series={[
                { data: providers.map((p) => p.messages), label: 'Messages', color: '#1976d2' },
              ]}
              height={250}
            />
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Provider</TableCell>
                  <TableCell align="right">Messages</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {providers.map((p) => (
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
        </Box>
      )}

      {/* ── Tool Usage ── */}
      {toolUsage.length > 0 && (
        <Box>
          <SectionHeader>Tool Usage</SectionHeader>
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
            <StatRow label="Summaries Generated" value={combined.summaryGeneratedCount} />
            <StatRow label="Total Generation Cost" value={formatCost(combined.summaryTotalCost)} />
            <ProgressRow
              label="Summaries Read by LLM"
              value={combined.summaryUniqueReadCount}
              total={combined.summaryGeneratedCount}
            />
            <StatRow label="Total Read Events" value={combined.summaryTotalReadCount} />
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
            <Box display="flex" justifyContent="flex-end" sx={{ mb: 1 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={sizeDistType}
                  label="Type"
                  onChange={(e): void => setSizeDistType(e.target.value as 'all' | 'user' | 'assistant')}
                >
                  <MenuItem value="all">All messages</MenuItem>
                  <MenuItem value="user">User only</MenuItem>
                  <MenuItem value="assistant">Assistant only</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ mb: 2 }}>
              <BarChart
                xAxis={[{ data: SIZE_BUCKET_ORDER, scaleType: 'band' }]}
                series={[{
                  data: SIZE_BUCKET_ORDER.map((b) => {
                    if (sizeDistType === 'user') return combined.userMessageSizeDistribution?.[b] || 0;
                    if (sizeDistType === 'assistant') return combined.assistantMessageSizeDistribution?.[b] || 0;
                    return combined.messageSizeDistribution[b] || 0;
                  }),
                  label: 'Count',
                  color: '#1976d2',
                }]}
                height={200}
              />
            </Box>
            {SIZE_BUCKET_ORDER.map((bucket) => {
              const count = sizeDistType === 'user'
                ? (combined.userMessageSizeDistribution?.[bucket] || 0)
                : sizeDistType === 'assistant'
                  ? (combined.assistantMessageSizeDistribution?.[bucket] || 0)
                  : (combined.messageSizeDistribution[bucket] || 0);
              const typeCount = sizeDistType === 'user'
                ? (combined.messagesByType.user || 0)
                : sizeDistType === 'assistant'
                  ? (combined.messagesByType.assistant || 0)
                  : combined.totalMessages;
              const pct = typeCount > 0 ? Math.round((count / typeCount) * 100) : 0;
              return (
                <Box key={bucket} sx={{ mb: 1 }}>
                  <Box display="flex" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {bucket} chars
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {count} ({pct}%)
                    </Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              );
            })}
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
              label="Average Latency"
              value={combined.latencyCount > 0 ? formatLatency(combined.totalLatencyMs / combined.latencyCount) : 'N/A'}
            />
            <StatRow
              label="p50 Latency"
              value={latencyPerc.p50 != null ? formatLatency(latencyPerc.p50) : 'N/A'}
            />
            <StatRow
              label="p95 Latency"
              value={latencyPerc.p95 != null ? formatLatency(latencyPerc.p95) : 'N/A'}
            />
            <StatRow
              label="Average TPS"
              value={
                combined.latencyCount > 0 && combined.totalCompletionTokens > 0
                  ? Math.round(combined.totalCompletionTokens / (combined.totalLatencyMs / 1000))
                  : 'N/A'
              }
            />
            <ProgressRow
              label="Cache Hit Rate"
              value={combined.totalCachedTokens}
              total={combined.totalCachedTokens + combined.totalCacheCreationTokens + combined.totalPromptTokens}
            />
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
            <StatRow label="User Messages" value={combined.messagesByType.user || 0} />
            <StatRow label="Assistant Messages" value={combined.messagesByType.assistant || 0} />
            <StatRow label="System Messages" value={combined.messagesByType.system || 0} />
            <StatRow label="AI Notes" value={combined.messagesByType.aiNote || 0} />
            <StatRow label="Failed Messages" value={combined.failedMessageCount} />
            <StatRow label="Error Rate" value={combined.totalMessages > 0 ? `${Math.round((combined.failedMessageCount / combined.totalMessages) * 100)}%` : '0%'} />
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

function mergeRecordSum(a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> {
  const result: Record<string, number> = { ...a ?? {} };
  for (const [key, value] of Object.entries(b ?? {})) {
    result[key] = (result[key] || 0) + value;
  }
  return result;
}

export default Analytics;
