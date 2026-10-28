import type { LlmProvider } from '../../types/provider';

const mockGetState = jest.fn<{ providers: LlmProvider[] }, []>();

jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: {
    getState: (): { providers: LlmProvider[] } => mockGetState(),
  },
}));

import { executeWebSearch, executeFetch, hasWebSearchApiKey } from '../webSearchService';

const deepseekProvider: LlmProvider = {
  id: 'builtin-deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  messageFormat: 'openai',
  apiKeyEncrypted: 'deepseek-key',
  supportsWebSearch: true,
  requiresReasoningFallback: false,
  payloadOverridesJson: '',
  isBuiltIn: true,
};

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: (): Promise<unknown> => Promise.resolve(payload),
    text: (): Promise<string> => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('webSearchService', () => {
  let mockFetch: jest.Mock<Promise<Response>, Parameters<typeof fetch>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetState.mockReturnValue({ providers: [deepseekProvider] });
    mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });
  });

  it('reports whether a DeepSeek key is configured', () => {
    expect(hasWebSearchApiKey()).toBe(true);
    mockGetState.mockReturnValue({ providers: [{ ...deepseekProvider, apiKeyEncrypted: '' }] });
    expect(hasWebSearchApiKey()).toBe(false);
  });

  it('throws when no DeepSeek key is configured', async () => {
    mockGetState.mockReturnValue({ providers: [] });

    await expect(executeWebSearch('anything')).rejects.toThrow(/DeepSeek API key/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts to the search endpoint and formats high-quality results', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        results: [
          {
            rerank_score: 2.4,
            title: 'DeepSeek V4 released',
            url: 'https://example.com/v4',
            snippet: 'V4 is available.',
            summary: 'DeepSeek released V4 with tool calling.',
            site_name: 'Example News',
            date: '2026-06-01T00:00:00+00:00',
            authority: 3,
          },
          {
            rerank_score: 0.4,
            title: 'Low quality hit',
            url: 'https://example.com/low',
            snippet: 'ignore me',
            summary: 'irrelevant',
            site_name: null,
            date: null,
            authority: 0,
          },
        ],
      }),
    );

    const response = await executeWebSearch('DeepSeek V4', { count: 3 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/tools/search',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestInit = mockFetch.mock.calls[0][1];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer deepseek-key');
    const body = JSON.parse(String(mockFetch.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ query: 'DeepSeek V4', count: 3, need_content: false });

    expect(response.billable).toBe(true);
    // Only the high-quality result is kept; the low-score hit is dropped.
    expect(response.resultCount).toBe(1);
    expect(response.text).toContain('DeepSeek V4 released');
    expect(response.text).toContain('https://example.com/v4');
    expect(response.text).not.toContain('Low quality hit');
  });

  it('does not mark a request billable when no results are returned', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ results: [] }));

    const response = await executeWebSearch('nothing here');

    expect(response.billable).toBe(false);
    expect(response.resultCount).toBe(0);
    expect(response.text).toContain('no results');
  });

  it('throws on API errors so the tool loop can report them', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { message: 'insufficient balance', code: 'invalid_request_error' } }, false, 402),
    );

    await expect(executeWebSearch('test')).rejects.toThrow(/402/);
  });

  it('fetches a page as Markdown and marks it billable', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ title: 'Article', content: '# Hello\n\nBody' }));

    const response = await executeFetch('https://example.com/article');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/tools/fetch',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(response.billable).toBe(true);
    expect(response.text).toContain('# Hello');
    expect(response.text).toContain('Article');
  });

  it('does not mark fetch billable when the page has no extractable content', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ title: '', content: '' }));

    const response = await executeFetch('https://example.com/empty');

    expect(response.billable).toBe(false);
    expect(response.text).toContain('no extractable content');
  });
});
