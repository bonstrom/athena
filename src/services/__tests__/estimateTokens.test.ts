import { LlmMessage } from '../llmService';

// Mock gpt-tokenizer so tests are deterministic and don't depend on the real tokenizer
jest.mock('gpt-tokenizer', () => ({
  encode: jest.fn((text: string): number[] => new Array<number>(text.length).fill(0)),
}));

import { encode } from 'gpt-tokenizer';
const mockEncode = encode as jest.MockedFunction<typeof encode>;

import { estimateTokens, clearTokenCacheForTesting } from '../estimateTokens';

const msg = (role: LlmMessage['role'], content: LlmMessage['content']): LlmMessage => ({
  role,
  content,
});

beforeEach(() => {
  mockEncode.mockClear();
  clearTokenCacheForTesting();
  // Default: return 1 token per character for simplicity
  mockEncode.mockImplementation((text: string): number[] => new Array<number>(text.length).fill(0));
});

describe('estimateTokens — basic output shape', () => {
  it('returns 0 prompt tokens for an empty message list', () => {
    const result = estimateTokens([]);
    expect(result.promptTokens).toBe(0);
  });

  it('returns promptTokens, completionTokens, and totalTokens', () => {
    const result = estimateTokens([msg('user', 'hi')]);
    expect(result).toHaveProperty('promptTokens');
    expect(result).toHaveProperty('completionTokens');
    expect(result).toHaveProperty('totalTokens');
  });

  it('completionTokens is 0 when no reply is provided', () => {
    const result = estimateTokens([msg('user', 'hello')]);
    expect(result.completionTokens).toBe(0);
  });

  it('completionTokens reflects the reply token count', () => {
    mockEncode.mockImplementation((text: string): number[] => new Array<number>(text.length).fill(0));
    const reply = 'response';
    const result = estimateTokens([msg('user', 'hi')], reply);
    expect(result.completionTokens).toBe(reply.length);
  });

  it('totalTokens equals promptTokens + completionTokens', () => {
    const result = estimateTokens([msg('user', 'hello')], 'world');
    expect(result.totalTokens).toBe(result.promptTokens + result.completionTokens);
  });
});

describe('estimateTokens — content type handling', () => {
  it('handles null content without throwing', () => {
    expect(() => estimateTokens([msg('assistant', null)])).not.toThrow();
  });

  it('handles string content', () => {
    expect(() => estimateTokens([msg('user', 'test')])).not.toThrow();
  });

  it('handles array content with text parts', () => {
    const content: LlmMessage['content'] = [
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ];
    expect(() => estimateTokens([msg('user', content)])).not.toThrow();
  });

  it('ignores non-text parts in array content', () => {
    const contentWithTextOnly: LlmMessage['content'] = [{ type: 'text', text: 'abc' }];
    const contentWithExtra: LlmMessage['content'] = [
      { type: 'text', text: 'abc' },
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ];
    const r1 = estimateTokens([msg('user', contentWithTextOnly)]);
    const r2 = estimateTokens([msg('user', contentWithExtra)]);
    // Both should produce the same prompt text (only text parts counted)
    expect(r1.promptTokens).toBe(r2.promptTokens);
  });

  it('includes reasoning_content in the prompt', () => {
    const withReasoning: LlmMessage = { role: 'assistant', content: 'answer', reasoning_content: 'thinking' };
    const withoutReasoning: LlmMessage = { role: 'assistant', content: 'answer' };
    // estimateTokens builds a longer string when reasoning_content is present,
    // so the token count for the prompt with reasoning should be >= without.
    const r1 = estimateTokens([withReasoning]);
    const r2 = estimateTokens([withoutReasoning]);
    expect(r1.promptTokens).toBeGreaterThanOrEqual(r2.promptTokens);
  });
});

describe('estimateTokens — LRU cache behaviour', () => {
  it('treats different reasoning_content values as different cache keys', () => {
    const withReasoningA: LlmMessage = { role: 'assistant', content: 'answer', reasoning_content: 'reason-a' };
    const withReasoningB: LlmMessage = { role: 'assistant', content: 'answer', reasoning_content: 'reason-b' };

    estimateTokens([withReasoningA]);
    const callsAfterA = mockEncode.mock.calls.length;

    estimateTokens([withReasoningB]);
    const callsAfterB = mockEncode.mock.calls.length;

    expect(callsAfterA).toBeGreaterThan(0);
    expect(callsAfterB).toBeGreaterThan(callsAfterA);
  });

  it('does not call encode a second time for identical messages (cache hit)', () => {
    const messages = [msg('user', 'same message')];
    estimateTokens(messages);
    const firstCallCount = mockEncode.mock.calls.length;
    estimateTokens(messages);
    // encode should not have been called again for the prompt (cache hit)
    expect(mockEncode.mock.calls.length).toBe(firstCallCount);
  });

  it('evicts the oldest entry when the cache exceeds 100 entries', () => {
    // Fill cache with 100 unique messages
    for (let i = 0; i < 100; i++) {
      estimateTokens([msg('user', `unique message ${i}`)]);
    }
    mockEncode.mockClear();

    // The 101st unique message triggers eviction of entry 0
    estimateTokens([msg('user', 'message 100')]);
    // encode was called once for the new message
    const callsAfterEviction = mockEncode.mock.calls.length;

    // Re-querying the first message should now miss the cache and call encode again
    estimateTokens([msg('user', 'unique message 0')]);
    expect(mockEncode.mock.calls.length).toBeGreaterThan(callsAfterEviction);
  });

  it('refreshes LRU position on cache hit so recently used entries are not evicted first', () => {
    for (let i = 0; i < 100; i++) {
      estimateTokens([msg('user', `lru message ${i}`)]);
    }

    mockEncode.mockClear();

    // Cache hit should refresh entry 0 to most-recently-used.
    estimateTokens([msg('user', 'lru message 0')]);
    expect(mockEncode.mock.calls.length).toBe(0);

    // Insert one new entry; this should evict entry 1 (the oldest), not entry 0.
    estimateTokens([msg('user', 'lru message 100')]);
    expect(mockEncode.mock.calls.length).toBe(1);

    // Entry 0 should still be cached (no additional encode call).
    estimateTokens([msg('user', 'lru message 0')]);
    expect(mockEncode.mock.calls.length).toBe(1);

    // Entry 1 should have been evicted and require re-encoding.
    estimateTokens([msg('user', 'lru message 1')]);
    expect(mockEncode.mock.calls.length).toBe(2);
  });
});
