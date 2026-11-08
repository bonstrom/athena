import { renderWithTheme } from '../../testUtils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  AnalyticsExport,
  AnalyticsStats,
  CacheFormatTotals,
  LatencyPercentiles,
  ProviderBreakdown,
  ToolUsageRow,
  TrendRow,
} from '../../services/analyticsService';

const mockComputeLocalStats = jest.fn<Promise<AnalyticsStats>, []>();
const mockGetImportedSources = jest.fn<Record<string, AnalyticsExport>, []>();
const mockComputeProviderBreakdown = jest.fn<Promise<ProviderBreakdown[]>, []>();
const mockResolveProviderName = jest.fn<string | null, [string | undefined]>();
const mockHasAnalyticsSnapshots = jest.fn<Promise<boolean>, []>();

jest.mock('../../services/analyticsService', () => ({
  computeLocalStats: (): Promise<AnalyticsStats> => mockComputeLocalStats(),
  exportAnalytics: (): Promise<void> => Promise.resolve(),
  ANALYTICS_EXPORT_PRIVACY_NOTE: 'Aggregate usage statistics only. No conversations.',
  importAnalytics: (): Promise<{ success: boolean; message: string }> => Promise.resolve({ success: true, message: 'Imported' }),
  getImportedSources: (): Record<string, AnalyticsExport> => mockGetImportedSources(),
  removeImportedSource: (): void => {
    /* mock */
  },
  cacheHitRateForFormat: (format: 'openai' | 'anthropic', totals: CacheFormatTotals): number | null => {
    if (format === 'openai') {
      return totals.promptTokens > 0 ? totals.cachedTokens / totals.promptTokens : null;
    }
    const denominator = totals.promptTokens + totals.cachedTokens + totals.cacheCreationTokens;
    return denominator > 0 ? totals.cachedTokens / denominator : null;
  },
  computeTrends: (): Promise<unknown[]> =>
    Promise.resolve([
      { date: '2026-01-01', messageCount: 10, cost: 0.5, tokens: 1500, failPercent: 10, p50Latency: 500, p95Latency: 900 },
      { date: '2026-01-02', messageCount: 15, cost: 0.75, tokens: 2000, failPercent: 6, p50Latency: 450, p95Latency: 850 },
    ]),
  computeTrendsRange: (): Promise<unknown[]> =>
    Promise.resolve([
      { date: '2026-01-01', messageCount: 10, cost: 0.5, tokens: 1500, failPercent: 10, p50Latency: 500, p95Latency: 900 },
      { date: '2026-01-02', messageCount: 15, cost: 0.75, tokens: 2000, failPercent: 6, p50Latency: 450, p95Latency: 850 },
    ]),
  computeLatencyPercentiles: (): Promise<object> => Promise.resolve({ p50: 500, p95: 900 }),
  hasAnalyticsSnapshots: (): Promise<boolean> => mockHasAnalyticsSnapshots(),
  computeProviderBreakdown: (): Promise<ProviderBreakdown[]> => mockComputeProviderBreakdown(),
  computeToolUsageBreakdown: (): Promise<unknown[]> =>
    Promise.resolve([
      { tool: 'update_scratchpad', calls: 20, successRate: 90, errors: [] },
      { tool: 'read_messages', calls: 5, successRate: 60, errors: [] },
    ]),
}));

jest.mock('../../services/analyticsRollupService', () => ({
  rollupAnalytics: (): Promise<void> => Promise.resolve(),
  resolveProviderName: (model: string | undefined): string | null => mockResolveProviderName(model),
}));

jest.mock('../../store/AuthStore', () => {
  const useAuthStore = (): { userName: string; dateFormat: string; currency: string } => ({
    userName: 'TestUser',
    dateFormat: 'en-US',
    currency: 'USD',
  });
  useAuthStore.getState = (): { currency: string } => ({ currency: 'USD' });
  return { useAuthStore };
});

import Analytics, { buildAnalyticsReport } from '../Analytics';

function createStats(overrides: Partial<AnalyticsStats> = {}): AnalyticsStats {
  return {
    summaryGeneratedCount: 5,
    summaryTotalCost: 0.25,
    summaryTotalTokens: 1234,
    summaryTotalReadCount: 10,
    summaryUniqueReadCount: 3,
    totalMessages: 42,
    messagesByType: { user: 21, assistant: 21, system: 0, aiNote: 0 },
    messagesByModel: { 'gpt-4': 21 },
    failedMessageCount: 2,
    totalPromptTokens: 10000,
    totalCompletionTokens: 5000,
    totalCachedTokens: 2000,
    totalCacheCreationTokens: 500,
    totalCost: 1.5,
    messageSizeDistribution: { '0-100': 10, '101-500': 20, '501-1000': 8, '1001-2000': 4 },
    userMessageSizeDistribution: { '0-100': 5, '101-500': 10, '501-1000': 4, '1001-2000': 2 },
    assistantMessageSizeDistribution: { '0-100': 5, '101-500': 10, '501-1000': 4, '1001-2000': 2 },
    totalAttachments: 3,
    totalWebSearches: 12,
    topicsWithScratchpad: 1,
    totalForks: 2,
    debateTopicCount: 1,
    messagesWithReasoning: 5,
    totalEmbeddings: 30,
    totalLatencyMs: 42000,
    latencyCount: 20,
    latencyCompletionTokens: 4000,
    firstMessageAt: '2025-01-01T00:00:00.000Z',
    lastMessageAt: '2026-06-15T00:00:00.000Z',
    features: {
      messageRetrievalEnabled: 'ON',
      aiSummaryEnabled: 'ON',
      summaryModel: 'gpt-4',
      replyPredictionEnabled: 'OFF',
      ragEnabled: 'ON',
      ttsEnabled: 'OFF',
      maxContextTokens: '128000',
      defaultMaxContextMessages: '20',
    },
    cacheByFormat: {
      openai: { recordCount: 20, promptTokens: 10000, cachedTokens: 2000, cacheCreationTokens: 0 },
      anthropic: { recordCount: 2, promptTokens: 500, cachedTokens: 100, cacheCreationTokens: 50 },
    },
    providerBreakdown: [{ provider: 'OpenAI', messages: 21, cost: 1.5, tokens: 15000 }],
    modelUsage: [
      {
        model: 'gpt-4',
        provider: 'OpenAI',
        messages: 21,
        operations: 0,
        promptTokens: 10000,
        completionTokens: 5000,
        cachedTokens: 2000,
        cacheCreationTokens: 500,
        cost: 1.5,
        usageUnknownCount: 0,
        summaryCalls: 5,
        summaryCost: 0.25,
      },
    ],
    operationUsage: [
      {
        operation: 'topic_name',
        calls: 4,
        failedCount: 0,
        promptTokens: 100,
        completionTokens: 20,
        cost: 0.02,
        usageUnknownCount: 0,
      },
    ],
    ...overrides,
  };
}

function createSource(stats: AnalyticsStats, overrides: Partial<AnalyticsExport> = {}): AnalyticsExport {
  return {
    format: 'athena-analytics-v2',
    deviceId: 'device-2',
    userId: 'Test Device',
    exportedAt: '2026-01-01T00:00:00.000Z',
    appVersion: '1.0.0',
    stats,
    ...overrides,
  };
}

function getRow(label: string): HTMLElement {
  const cell = screen.getByRole('cell', { name: label });
  const row = cell.closest('tr');
  if (!row) throw new Error(`Could not find a table row for ${label}`);
  return row;
}

function getRowInTable(testId: string, label: string): HTMLElement {
  const table = screen.getByTestId(testId);
  const cell = within(table).getByRole('cell', { name: label });
  const row = cell.closest('tr');
  if (!row) throw new Error(`Could not find a row for ${label} in ${testId}`);
  return row;
}

function modelMessageCount(row: HTMLElement): number {
  const cells = within(row).getAllByRole('cell');
  return Number(cells[2].textContent);
}

function messageCount(row: HTMLElement): number {
  const cells = within(row).getAllByRole('cell');
  return Number(cells[1].textContent);
}

describe('Analytics', () => {
  beforeEach(() => {
    localStorage.clear();
    mockComputeLocalStats.mockResolvedValue(createStats());
    mockGetImportedSources.mockReturnValue({});
    mockHasAnalyticsSnapshots.mockResolvedValue(true);
    mockComputeProviderBreakdown.mockResolvedValue([{ provider: 'OpenAI', messages: 21, cost: 1.5, tokens: 15000 }]);
    mockResolveProviderName.mockImplementation((model?: string): string | null => (model === 'gpt-4' ? 'OpenAI' : null));
  });

  it('renders basic local data section', async () => {
    renderWithTheme(<Analytics />);

    const found = await screen.findByText('42', {}, { timeout: 3000 });
    expect(found).toBeInTheDocument();
  });

  it('renders per-model and per-operation sections', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('By Model')).toBeInTheDocument();
    expect(screen.getByText('By Operation')).toBeInTheDocument();
    expect(screen.getByText('topic_name')).toBeInTheDocument();
  });

  it('renders performance section with p50/p95', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('p50 latency (this device, local snapshots)')).toBeInTheDocument();
    expect(screen.getByText('p95 latency (this device, local snapshots)')).toBeInTheDocument();
  });

  it('renders trends section', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Trends')).toBeInTheDocument();
  });

  it('shows the rollup prompt only when no snapshot rows exist', async () => {
    mockHasAnalyticsSnapshots.mockResolvedValue(false);
    renderWithTheme(<Analytics />);

    expect(await screen.findByText(/No snapshot data yet/)).toBeInTheDocument();
  });

  it('does not show the rollup prompt when snapshots exist even if the selected window is empty', async () => {
    mockHasAnalyticsSnapshots.mockResolvedValue(true);
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Trends')).toBeInTheDocument();
    expect(screen.queryByText(/No snapshot data yet/)).not.toBeInTheDocument();
  });

  it('renders per-format cache shares and aligned throughput', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Cache read share, OpenAI-style records (this device)')).toBeInTheDocument();
    expect(screen.getByText('Cache read share, Anthropic-style records (this device)')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('15.4%')).toBeInTheDocument();
    expect(screen.getByText('Average end-to-end tokens/second (messages with latency, combined)')).toBeInTheDocument();
  });

  it('labels fork entries and summary read ordering explicitly', async () => {
    mockGetImportedSources.mockReturnValue({
      'device-2': createSource(createStats({ totalMessages: 5, totalCost: 0.5 }), { deviceId: 'device-2', userId: 'Phone' }),
    });

    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Fork entries (incl. Main)')).toBeInTheDocument();
    expect(screen.getByText('Tracked reads / summaries')).toBeInTheDocument();
  });

  it('renders by provider section', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('By Provider')).toBeInTheDocument();
  });

  it('renders tool usage section', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Tool Usage')).toBeInTheDocument();
  });

  it('renders export button', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Export Analytics')).toBeInTheDocument();
  });

  it('copies a Markdown summary of the analytics to the clipboard', async () => {
    const writeText = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderWithTheme(<Analytics />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy as Markdown' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const report = writeText.mock.calls[0][0];
    expect(report).toContain('# Athena Usage Analytics');
    expect(report).toContain('## Totals');
    expect(report).toContain('| Messages | 42 |');
    expect(report).toContain('## By Provider');
    expect(report).toContain('| OpenAI | 21 |');
    expect(report).toContain('## Tool Usage');
    expect(report).toContain('| update_scratchpad | 20 | 90% |');
    expect(report).toContain('Stored summary tokens (latest generation per message)');
    expect(report).toContain('| Date (UTC) | Usage events |');
    expect(await screen.findByText('Analytics report copied to clipboard.')).toBeInTheDocument();
  });

  it('shows an error when copying the report fails', async () => {
    const writeText = jest.fn<Promise<void>, [string]>(() => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderWithTheme(<Analytics />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy as Markdown' }));

    expect(await screen.findByText('Failed to copy analytics report.')).toBeInTheDocument();
  });

  it('uses imported provider message counts even when their models are unknown locally', async () => {
    mockGetImportedSources.mockReturnValue({
      'device-2': createSource(
        createStats({
          totalMessages: 10,
          totalCost: 5,
          messagesByModel: { 'custom-model': 10 },
          providerBreakdown: [{ provider: 'Phone Provider', messages: 10, cost: 5, tokens: 1000 }],
        }),
        { deviceId: 'device-2', userId: 'Phone' },
      ),
    });

    renderWithTheme(<Analytics />);

    await screen.findByText('By Provider');
    const phoneRow = getRow('Phone Provider');
    expect(within(phoneRow).getByText('10')).toBeInTheDocument();
    expect(within(phoneRow).getByText('$5.00')).toBeInTheDocument();
    expect(within(phoneRow).getByText('1.0K')).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Unknown' })).not.toBeInTheDocument();
  });

  it('derives provider counts from models for legacy imports and shows an info alert', async () => {
    mockGetImportedSources.mockReturnValue({
      'device-2': createSource(
        createStats({
          totalMessages: 5,
          totalCost: 0.5,
          messagesByModel: { 'gpt-4': 5 },
          providerBreakdown: undefined,
        }),
        { deviceId: 'device-2', userId: 'Legacy Device' },
      ),
    });

    renderWithTheme(<Analytics />);

    expect(await screen.findByText(/predate provider-level cost\/token tracking/i)).toBeInTheDocument();
    expect(messageCount(getRowInTable('provider-breakdown-table', 'OpenAI'))).toBe(26);
  });

  it('combines local and imported provider breakdowns and keeps the tables reconciled', async () => {
    mockGetImportedSources.mockReturnValue({
      'device-2': createSource(
        createStats({
          totalMessages: 12,
          totalCost: 0.5,
          messagesByModel: { 'deepseek-v4-pro': 12 },
          modelUsage: [
            {
              model: 'deepseek-v4-pro',
              provider: 'DeepSeek',
              messages: 12,
              operations: 0,
              promptTokens: 2000,
              completionTokens: 500,
              cachedTokens: 0,
              cacheCreationTokens: 0,
              cost: 0.5,
              usageUnknownCount: 0,
              summaryCalls: 0,
              summaryCost: 0,
            },
          ],
          providerBreakdown: [{ provider: 'DeepSeek', messages: 12, cost: 0.5, tokens: 2500 }],
        }),
        { deviceId: 'device-2', userId: 'Laptop' },
      ),
    });

    renderWithTheme(<Analytics />);

    await screen.findByText('By Provider');
    const providerTotal =
      messageCount(getRowInTable('provider-breakdown-table', 'OpenAI')) +
      messageCount(getRowInTable('provider-breakdown-table', 'DeepSeek'));
    const modelTotal =
      modelMessageCount(getRowInTable('model-usage-table', 'gpt-4')) +
      modelMessageCount(getRowInTable('model-usage-table', 'deepseek-v4-pro'));

    expect(providerTotal).toBe(33);
    expect(modelTotal).toBe(providerTotal);
  });

  it('labels message-size buckets in characters', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText(/Message length in characters/)).toBeInTheDocument();
    expect(screen.getByText('0-100 chars')).toBeInTheDocument();
    expect(screen.getByText('8000+ chars')).toBeInTheDocument();
  });
});

describe('buildAnalyticsReport', () => {
  const trends: TrendRow[] = [
    {
      date: '2026-01-01',
      messageCount: 10,
      cost: 0.5,
      tokens: 1500,
      failPercent: 10,
      p50Latency: 500,
      p95Latency: 900,
    },
  ];
  const toolUsage: ToolUsageRow[] = [{ tool: 'update_scratchpad', calls: 20, successRate: 90, errors: [] }];
  const latencyPerc: LatencyPercentiles = { p50: 500, p95: 900 };

  function build(
    overrides: {
      stats?: AnalyticsStats;
      combined?: AnalyticsStats | null;
      importedSources?: Record<string, AnalyticsExport>;
      providerRows?: ProviderBreakdown[];
      trendRangeLabel?: string;
    } = {},
  ): string {
    const stats = overrides.stats ?? createStats();
    return buildAnalyticsReport({
      stats,
      combined: overrides.combined ?? null,
      importedSources: overrides.importedSources ?? {},
      trends,
      providerRows: overrides.providerRows ?? [{ provider: 'OpenAI', messages: 21, cost: 1.5, tokens: 15000 }],
      toolUsage,
      latencyPerc,
      dateFormat: 'en-US',
      userName: 'TestUser',
      trendRangeLabel: overrides.trendRangeLabel,
    });
  }

  it('uses precise recorded-cost and stored-summary terminology', (): void => {
    const report = build();

    expect(report).toContain('Recorded tokens (messages + operations)');
    expect(report).toContain('Recorded cost (messages + tracked operations)');
    expect(report).toContain('Stored summary cost (latest generation per message)');
    expect(report).toContain('| Stored summary tokens (latest generation per message) | 1.2K |');
    expect(report).toContain('| Recorded subtotal incl. stored summary cost | $1.75 |');
    expect(report).toContain(
      'Recorded cost covers chat messages plus tracked background operations',
    );
    expect(report).toContain('Media calls do not report token or cost usage');
    expect(report).toContain('costUnit "USD"');
  });

  it('includes per-model and per-operation breakdowns with explicit cost unit', (): void => {
    const report = build();

    expect(report).toContain('## By Model');
    expect(report).toContain('| Model | Provider | Messages | Operations |');
    expect(report).toContain('| gpt-4 | OpenAI | 21 | 0 |');
    expect(report).toContain('## By Operation');
    expect(report).toContain('| topic_name | 4 | 0 |');
    expect(report).toContain('Imported files created before the v3 export format do not include per-model breakdowns');
  });

  it('lists stored-summary reads and retrieval scope precisely', (): void => {
    const report = build();

    expect(report).toContain('| Messages with a stored summary | 5 |');
    expect(report).toContain('| Messages with ≥1 tracked retrieval (truncation/RAG only) | 3/5 (60%) |');
    expect(report).toContain('| Tracked retrieval events | 10 |');
    expect(report).toContain('history-directory previews are not counted');
  });

  it('reports dynamic legacy-provider cost and token coverage', (): void => {
    const report = build({
      combined: createStats({
        totalMessages: 47,
        totalCost: 2,
        totalPromptTokens: 20000,
        totalCompletionTokens: 10000,
      }),
      importedSources: {
        'device-2': createSource(createStats({ totalMessages: 5, totalCost: 0.5, providerBreakdown: undefined }), {
          userId: 'Legacy Device',
        }),
      },
      providerRows: [{ provider: 'OpenAI', messages: 26, cost: 1.5, tokens: 15000 }],
    });

    expect(report).toContain('Legacy imports (Legacy Device) predate provider-level cost/token tracking.');
    expect(report).toContain('provider rows cover 75.0% of recorded cost and 50.0% of recorded tokens');
  });

  it('includes source format, export date, and app version from imported files', (): void => {
    const exported = new Date('2026-02-03T12:00:00.000Z').toLocaleDateString('en-US');
    const report = build({
      combined: createStats(),
      importedSources: {
        'device-2': createSource(createStats({ totalMessages: 10, totalCost: 5 }), {
          format: 'athena-analytics-v1',
          exportedAt: '2026-02-03T12:00:00.000Z',
          appVersion: '2.1.0',
          userId: 'Phone',
        }),
      },
    });

    expect(report).toContain('| Source | Messages | Cost | Cost unit | Format | Exported | App |');
    expect(report).toContain(
      `| Phone | 10 | $5.00 | not stated | athena-analytics-v1 | ${exported} | 2.1.0 |`,
    );
    expect(report).toContain('do not state a cost unit (Phone); their costs are assumed to be USD');
  });

  it('labels trends as UTC calendar days with zero rows for inactive dates', (): void => {
    const report = build({ trendRangeLabel: 'Last 7 calendar days in UTC, including inactive dates (this device)' });

    expect(report).toContain('Range: Last 7 calendar days in UTC, including inactive dates (this device)');
    expect(report).toContain('Scope: this device only (local snapshot data).');
    expect(report).toContain('| Date (UTC) | Usage events | Cost | Tokens | Fail % | p50 latency | p95 latency |');
    expect(report).toContain('Preset ranges include inactive dates as zero rows');
  });

  it('scopes provider, tool, feature, and performance metrics precisely', (): void => {
    const report = build();

    expect(report).toContain('| Provider | Assistant messages | Cost | Tokens |');
    expect(report).toContain('"Unknown" groups models that no longer resolve to a configured provider');
    expect(report).toContain('Scope: this device only (local tool logs).');
    expect(report).toContain('Scope: this device only (current setting values, not historical).');
    expect(report).toContain('p50 latency (this device, local snapshots)');
    expect(report).toContain('Average end-to-end tokens per second (messages with latency, combined)');
    expect(report).toContain('Cache read share, OpenAI-style records (this device; cached / prompt tokens)');
    expect(report).toContain(
      'Cache read share, Anthropic-style records (this device; cached / (input + cache read + cache creation))',
    );
    expect(report).not.toContain('Cache hit rate');
  });

  it('computes per-format cache shares instead of a blended rate', (): void => {
    const report = build();

    // OpenAI-style: 2,000 cached / 10,000 prompt tokens.
    expect(report).toContain('| Cache read share, OpenAI-style records (this device; cached / prompt tokens) | 20.0% |');
    // Anthropic-style: 100 cached / (500 input + 100 cached + 50 created).
    expect(report).toContain(
      '| Cache read share, Anthropic-style records (this device; cached / (input + cache read + cache creation)) | 15.4% |',
    );
  });

  it('reports N/A when format-specific cache data is unavailable', (): void => {
    const report = build({ stats: createStats({ cacheByFormat: undefined }) });

    expect(report).toContain('| Cache read share, OpenAI-style records (this device; cached / prompt tokens) | N/A |');
    expect(report).toContain(
      '| Cache read share, Anthropic-style records (this device; cached / (input + cache read + cache creation)) | N/A |',
    );
  });

  it('uses aligned latency/completion records for throughput', (): void => {
    const report = build();

    // 4,000 completion tokens over 42 seconds.
    expect(report).toContain('| Average end-to-end tokens per second (messages with latency, combined) | 95 |');
  });

  it('reports throughput as N/A when an imported source lacks aligned latency totals', (): void => {
    const legacyStats = createStats({ latencyCompletionTokens: undefined });
    const report = build({
      combined: createStats({ totalMessages: 84, latencyCompletionTokens: 8000 }),
      importedSources: {
        'device-2': createSource(legacyStats, { deviceId: 'device-2', userId: 'Legacy Device' }),
      },
    });

    expect(report).toContain('| Average end-to-end tokens per second (messages with latency, combined) | N/A |');
    expect(report).toContain('Some imported sources lack aligned token/latency totals');
  });

  it('labels fork totals as entries including the implicit Main fork', (): void => {
    expect(build()).toContain('| Fork entries (incl. Main) | 2 |');
  });

  it('formats the error rate with two decimals', (): void => {
    expect(build()).toContain('| Error rate | 4.76% |');
  });
});
