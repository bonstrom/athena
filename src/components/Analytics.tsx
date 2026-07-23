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
import { computeLocalStats, exportAnalytics, importAnalytics, getImportedSources, removeImportedSource, AnalyticsStats, AnalyticsExport } from '../services/analyticsService';
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

  const loadStats = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const s = await computeLocalStats();
      setStats(s);
      setImportedSources(getImportedSources());
    } catch {
      setSnack({ open: true, message: 'Failed to load analytics.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

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
      <Box sx={{ width: '100%', maxWidth: 600 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box sx={{ width: '100%', maxWidth: 600 }}>
        <Typography variant="body2" color="text.secondary">
          Failed to load analytics.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={4} sx={{ width: '100%', maxWidth: 600 }}>
      {/* ── Controls ── */}
      <Box display="flex" gap={2} alignItems="center">
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
            {SIZE_BUCKET_ORDER.map((bucket) => {
              const count = combined.messageSizeDistribution[bucket] || 0;
              const pct = combined.totalMessages > 0 ? Math.round((count / combined.totalMessages) * 100) : 0;
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
