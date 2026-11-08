import { athenaDb } from '../../database/AthenaDb';
import type { LlmProvider } from '../../types/provider';
import { createLlmProvider, createUserChatModel } from '../../testUtils/fixtures';
import { buildOperationUsage, trackOperationUsage } from '../usageTrackingService';

const mockGetState = jest.fn<{ providers: LlmProvider[] }, []>();

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    llmOperationUsages: {
      add: jest.fn(),
    },
  },
}));

jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: {
    getState: (): { providers: LlmProvider[] } => mockGetState(),
  },
}));

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockAdd = athenaDb.llmOperationUsages.add as jest.MockedFunction<typeof athenaDb.llmOperationUsages.add>;

const provider = createLlmProvider({ id: 'test-provider', name: 'Test Provider', messageFormat: 'anthropic' });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetState.mockReturnValue({ providers: [provider] });
});

describe('buildOperationUsage', () => {
  it('records persisted provider attribution and the peak multiplier', () => {
    const model = createUserChatModel({ apiModelId: 'custom-model', providerId: provider.id });
    const record = buildOperationUsage(
      {
        topicId: 'topic-1',
        operationType: 'curator_course',
        model,
        promptTokens: 100,
        completionTokens: 50,
        totalCost: 0.25,
        latencyMs: 900,
        peakMultiplier: 2,
      },
      [provider],
    );

    expect(record).toMatchObject({
      topicId: 'topic-1',
      operationType: 'curator_course',
      model: 'custom-model',
      promptTokens: 100,
      completionTokens: 50,
      totalCost: 0.25,
      latencyMs: 900,
      failed: false,
      providerId: provider.id,
      providerName: 'Test Provider',
      providerFormat: 'anthropic',
      peakMultiplier: 2,
    });
  });

  it('falls back to the built-in alias map for media model IDs', () => {
    const record = buildOperationUsage(
      {
        topicId: 'topic-1',
        operationType: 'media_image',
        apiModelId: 'image-01',
        usageUnknown: true,
      },
      [],
    );

    expect(record.providerId).toBe('builtin-minimax');
    expect(record.providerName).toBe('MiniMax');
    expect(record.usageUnknown).toBe(true);
    expect(record.promptTokens).toBe(0);
    expect(record.completionTokens).toBe(0);
    expect(record.totalCost).toBe(0);
  });

  it('leaves custom API model IDs unattributed', () => {
    const record = buildOperationUsage(
      {
        topicId: 'topic-1',
        operationType: 'topic_name',
        apiModelId: 'my-private-model',
        promptTokens: 10,
        completionTokens: 5,
        totalCost: 0.01,
      },
      [],
    );

    expect(record.model).toBe('my-private-model');
    expect(record.providerId).toBeUndefined();
    expect(record.providerName).toBeUndefined();
    expect(record.providerFormat).toBeUndefined();
  });
});

describe('trackOperationUsage', () => {
  it('persists the operation record using the configured providers', async () => {
    mockAdd.mockResolvedValue('operation-1');

    await trackOperationUsage({
      topicId: 'topic-1',
      operationType: 'reply_prediction',
      apiModelId: 'gpt-6.1-sol',
      promptTokens: 12,
      completionTokens: 4,
      totalCost: 0.001,
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: 'topic-1',
        operationType: 'reply_prediction',
        model: 'gpt-6.1-sol',
        providerId: 'builtin-openai',
        providerName: 'OpenAI',
      }),
    );
  });

  it('never throws when analytics persistence fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAdd.mockRejectedValue(new Error('storage full'));

    await expect(
      trackOperationUsage({ topicId: 'topic-1', operationType: 'media_speech', apiModelId: 'speech-2.8-turbo' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
