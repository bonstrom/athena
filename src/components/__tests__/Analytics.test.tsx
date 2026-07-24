import { renderWithTheme } from '../../testUtils';
import { screen } from '@testing-library/react';

jest.mock('../../services/analyticsService', () => ({
  computeLocalStats: (): Promise<object> => Promise.resolve({
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
    totalCost: 1.50,
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
      askUserEnabled: 'OFF',
      aiSummaryEnabled: 'ON',
      summaryModel: 'gpt-4',
      replyPredictionEnabled: 'OFF',
      llmSuggestionEnabled: 'ON',
      ragEnabled: 'ON',
      ttsEnabled: 'OFF',
      maxContextTokens: '128000',
      defaultMaxContextMessages: '20',
    },
  }),
  exportAnalytics: (): Promise<void> => Promise.resolve(),
  importAnalytics: (): Promise<{ success: boolean; message: string }> => Promise.resolve({ success: true, message: 'Imported' }),
  getImportedSources: (): Record<string, unknown> => ({}),
  removeImportedSource: (): void => { /* mock */ },
  computeTrends: (): Promise<unknown[]> => Promise.resolve([
    { date: '2026-01-01', messageCount: 10, cost: 0.50, tokens: 1500, failPercent: 10, p50Latency: 500, p95Latency: 900 },
    { date: '2026-01-02', messageCount: 15, cost: 0.75, tokens: 2000, failPercent: 6, p50Latency: 450, p95Latency: 850 },
  ]),
  computeTrendsRange: (): Promise<unknown[]> => Promise.resolve([
    { date: '2026-01-01', messageCount: 10, cost: 0.50, tokens: 1500, failPercent: 10, p50Latency: 500, p95Latency: 900 },
    { date: '2026-01-02', messageCount: 15, cost: 0.75, tokens: 2000, failPercent: 6, p50Latency: 450, p95Latency: 850 },
  ]),
  computeLatencyPercentiles: (): Promise<object> => Promise.resolve({ p50: 500, p95: 900 }),
  computeProviderBreakdown: (): Promise<unknown[]> => Promise.resolve([
    { provider: 'OpenAI', messages: 30, cost: 1.00, tokens: 5000 },
    { provider: 'DeepSeek', messages: 12, cost: 0.50, tokens: 2500 },
  ]),
  computeToolUsageBreakdown: (): Promise<unknown[]> => Promise.resolve([
    { tool: 'update_scratchpad', calls: 20, successRate: 90, errors: [] },
    { tool: 'read_messages', calls: 5, successRate: 60, errors: [] },
  ]),
}));

jest.mock('../../services/analyticsRollupService', () => ({
  rollupAnalytics: (): Promise<void> => Promise.resolve(),
}));

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: (): { userName: string; dateFormat: string } => ({
    userName: 'TestUser',
    dateFormat: 'en-US',
  }),
}));

import Analytics from '../Analytics';

describe('Analytics', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
