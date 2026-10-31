import { renderWithTheme } from '../../testUtils';
import { screen, within } from '@testing-library/react';
import type { AnalyticsExport, AnalyticsStats, ProviderBreakdown } from '../../services/analyticsService';

const mockComputeLocalStats = jest.fn<Promise<AnalyticsStats>, []>();
const mockGetImportedSources = jest.fn<Record<string, AnalyticsExport>, []>();
const mockComputeProviderBreakdown = jest.fn<Promise<ProviderBreakdown[]>, []>();
const mockResolveProviderName = jest.fn<string | null, [string | undefined]>();

jest.mock('../../services/analyticsService', () => ({
  computeLocalStats: (): Promise<AnalyticsStats> => mockComputeLocalStats(),
  exportAnalytics: (): Promise<void> => Promise.resolve(),
  ANALYTICS_EXPORT_PRIVACY_NOTE: 'Aggregate usage statistics only. No conversations.',
  importAnalytics: (): Promise<{ success: boolean; message: string }> => Promise.resolve({ success: true, message: 'Imported' }),
  getImportedSources: (): Record<string, AnalyticsExport> => mockGetImportedSources(),
  removeImportedSource: (): void => {
    /* mock */
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

import Analytics from '../Analytics';

function createStats(overrides: Partial<AnalyticsStats> = {}): AnalyticsStats {
  return {
    summaryGeneratedCount: 5,
    summaryTotalCost: 0.25,
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
    providerBreakdown: [{ provider: 'OpenAI', messages: 21, cost: 1.5, tokens: 15000 }],
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

function messageCount(row: HTMLElement): number {
  const cells = within(row).getAllByRole('cell');
  return Number(cells[1].textContent);
}

describe('Analytics', () => {
  beforeEach(() => {
    localStorage.clear();
    mockComputeLocalStats.mockResolvedValue(createStats());
    mockGetImportedSources.mockReturnValue({});
    mockComputeProviderBreakdown.mockResolvedValue([{ provider: 'OpenAI', messages: 21, cost: 1.5, tokens: 15000 }]);
    mockResolveProviderName.mockImplementation((model?: string): string | null => (model === 'gpt-4' ? 'OpenAI' : null));
  });

  it('renders basic local data section', async () => {
    renderWithTheme(<Analytics />);

    const found = await screen.findByText('42', {}, { timeout: 3000 });
    expect(found).toBeInTheDocument();
  });

  it('renders performance section with p50/p95', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('p50 Latency')).toBeInTheDocument();
    expect(screen.getByText('p95 Latency')).toBeInTheDocument();
  });

  it('renders trends section', async () => {
    renderWithTheme(<Analytics />);

    expect(await screen.findByText('Trends')).toBeInTheDocument();
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

    expect(await screen.findByText(/do not include provider cost\/token detail/i)).toBeInTheDocument();
    expect(messageCount(getRow('OpenAI'))).toBe(26);
  });

  it('combines local and imported provider breakdowns and keeps the tables reconciled', async () => {
    mockGetImportedSources.mockReturnValue({
      'device-2': createSource(
        createStats({
          totalMessages: 12,
          totalCost: 0.5,
          messagesByModel: { 'deepseek-v4-pro': 12 },
          providerBreakdown: [{ provider: 'DeepSeek', messages: 12, cost: 0.5, tokens: 2500 }],
        }),
        { deviceId: 'device-2', userId: 'Laptop' },
      ),
    });

    renderWithTheme(<Analytics />);

    await screen.findByText('By Provider');
    const providerTotal =
      messageCount(getRow('OpenAI')) + messageCount(getRow('DeepSeek'));
    const modelTotal =
      messageCount(getRow('gpt-4')) + messageCount(getRow('deepseek-v4-pro'));

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
