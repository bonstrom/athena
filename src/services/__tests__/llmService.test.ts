// Mock out modules that have heavy side-effects / browser dependencies so that
// the pure filterMessagesForModel function can be tested in isolation.
const mockAuthGetState = jest.fn(() => ({}));
const mockProviderGetState = jest.fn(() => ({}));

jest.mock('../../store/AuthStore', () => ({ useAuthStore: { getState: (): ReturnType<typeof mockAuthGetState> => mockAuthGetState() } }));
jest.mock('../../store/ProviderStore', () => ({
  useProviderStore: { getState: (): ReturnType<typeof mockProviderGetState> => mockProviderGetState() },
}));
jest.mock('../../components/ModelSelector', () => ({
  calculateCostSEK: jest.fn(),
  getDefaultModel: jest.fn(),
}));
jest.mock('../estimateTokens', () => ({ estimateTokens: jest.fn() }));

import { filterMessagesForModel, LlmMessage, orchestrateLlmLoop } from '../llmService';
import { estimateTokens } from '../estimateTokens';
import { LlmProvider, UserChatModel } from '../../types/provider';

const mockEstimateTokens = estimateTokens as jest.MockedFunction<typeof estimateTokens>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeModel(enforceAlternatingRoles: boolean): UserChatModel {
  return {
    id: 'test-model',
    label: 'Test Model',
    apiModelId: 'test-model',
    providerId: 'test-provider',
    input: 0,
    cachedInput: 0,
    output: 0,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    contextWindow: 128000,
    forceTemperature: null,
    enforceAlternatingRoles,
    maxTokensOverride: null,
    isBuiltIn: false,
    enabled: true,
  };
}

const system = (content: string): LlmMessage => ({ role: 'system', content });
const user = (content: string): LlmMessage => ({ role: 'user', content });
const asst = (content: string): LlmMessage => ({ role: 'assistant', content });

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('filterMessagesForModel — model WITHOUT enforceAlternatingRoles', () => {
  const model = makeModel(false);

  it('returns messages unchanged', () => {
    const messages = [user('hi'), asst('hello'), user('how are you')];
    expect(filterMessagesForModel(model, messages)).toEqual(messages);
  });

  it('preserves consecutive messages of the same role', () => {
    const messages = [user('first'), user('second'), asst('reply')];
    expect(filterMessagesForModel(model, messages)).toEqual(messages);
  });

  it('preserves system messages in any position', () => {
    const messages = [system('sys'), user('q'), system('mid-sys'), asst('a')];
    expect(filterMessagesForModel(model, messages)).toEqual(messages);
  });

  it('returns an empty array unchanged', () => {
    expect(filterMessagesForModel(model, [])).toEqual([]);
  });
});

describe('filterMessagesForModel — model WITH enforceAlternatingRoles', () => {
  const model = makeModel(true);

  it('passes through a clean alternating conversation', () => {
    const result = filterMessagesForModel(model, [user('hi'), asst('hello'), user('bye')]);
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('passes through system messages alongside alternating roles', () => {
    const result = filterMessagesForModel(model, [system('be helpful'), user('hi'), asst('hello')]);
    expect(result.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
  });

  it('drops consecutive duplicate roles, keeping the first occurrence', () => {
    const result = filterMessagesForModel(model, [user('first'), user('second'), asst('reply')]);
    const nonSystem = result.filter((m) => m.role !== 'system');
    for (let i = 1; i < nonSystem.length; i++) {
      expect(nonSystem[i].role).not.toBe(nonSystem[i - 1].role);
    }
    // The first user message (not the duplicate) must be retained
    expect(result[0].content).toBe('first');
  });

  it('retains all system messages regardless of surrounding roles', () => {
    const result = filterMessagesForModel(model, [system('sys1'), system('sys2'), user('q'), asst('a')]);
    expect(result.filter((m) => m.role === 'system')).toHaveLength(2);
  });

  it('drops leading assistant messages until the first user message', () => {
    const result = filterMessagesForModel(model, [asst('unprompted'), user('hi')]);
    expect(result.map((m) => m.role)).toEqual(['user']);
    expect(result[0].content).toBe('hi');
  });

  it('throws when there are no user messages at all', () => {
    expect(() => filterMessagesForModel(model, [system('sys'), asst('unprompted')])).toThrow();
  });

  it('does not produce adjacent duplicate roles after filtering a noisy conversation', () => {
    const messages = [user('q1'), asst('a1'), asst('a1-duplicate'), user('q2'), user('q2-duplicate'), asst('a2')];
    const result = filterMessagesForModel(model, messages);
    const nonSystem = result.filter((m) => m.role !== 'system');
    for (let i = 1; i < nonSystem.length; i++) {
      expect(nonSystem[i].role).not.toBe(nonSystem[i - 1].role);
    }
  });

  it('preserves message content for retained messages', () => {
    const result = filterMessagesForModel(model, [user('question'), asst('answer'), user('follow-up')]);
    expect(result[0].content).toBe('question');
    expect(result[1].content).toBe('answer');
    expect(result[2].content).toBe('follow-up');
  });
});

describe('orchestrateLlmLoop — tool calls', () => {
  const model: UserChatModel = { ...makeModel(false), streaming: false };
  const provider: LlmProvider = {
    id: 'test-provider',
    name: 'Test Provider',
    baseUrl: 'https://example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: '',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
  };

  function jsonResponse(data: unknown): Response {
    return {
      ok: true,
      json: (): Promise<unknown> => Promise.resolve(data),
    } as unknown as Response;
  }

  beforeEach(() => {
    mockEstimateTokens.mockReturnValue({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    mockAuthGetState.mockReturnValue({ customInstructions: '', maxContextTokens: 16000 });
    mockProviderGetState.mockReturnValue({
      models: [model],
      getAvailableModels: (): UserChatModel[] => [model],
      getProviderForModel: (): LlmProvider => provider,
    });
  });

  it('executes tool calls and includes tool results in loop trace', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'read_messages', arguments: '{"messages":[{"messageId":"abc"}]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'Final answer after tool result',
              },
            },
          ],
          usage: { prompt_tokens: 11, completion_tokens: 6 },
        }),
      );

    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('Tool output payload'));

    const result = await orchestrateLlmLoop(model, 0.7, [user('What did I say earlier?')], undefined, undefined, undefined, onExecuteTool);

    expect(onExecuteTool).toHaveBeenCalledWith('read_messages', '{"messages":[{"messageId":"abc"}]}');
    expect(result.finalContent).toBe('Final answer after tool result');
    expect(result.toolLoopTrace).toHaveLength(1);
    expect(result.toolLoopTrace[0].toolResults[0]).toEqual({
      toolCallId: 'call-1',
      toolName: 'read_messages',
      result: 'Tool output payload',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('caches duplicate tool calls within a single iteration', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'read_messages', arguments: '{"messages":[{"messageId":"abc"}]}' },
                  },
                  {
                    id: 'call-2',
                    type: 'function',
                    function: { name: 'read_messages', arguments: '{"messages":[{"messageId":"abc"}]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [{ finish_reason: 'stop', message: { content: 'done' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
      );

    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('shared tool result'));

    const result = await orchestrateLlmLoop(model, 0.7, [user('Read message twice')], undefined, undefined, undefined, onExecuteTool);

    expect(onExecuteTool).toHaveBeenCalledTimes(1);
    expect(result.toolLoopTrace).toHaveLength(1);
    expect(result.toolLoopTrace[0].toolResults).toHaveLength(2);
    expect(result.toolLoopTrace[0].toolResults[0].result).toBe('shared tool result');
    expect(result.toolLoopTrace[0].toolResults[1].result).toBe('shared tool result');
  });

  it('handles update_scratchpad tool calls via onScratchpadUpdate', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-scratchpad',
                    type: 'function',
                    function: { name: 'update_scratchpad', arguments: '{"content":"remember this","action":"append"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'Done updating scratchpad',
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
      );

    const onScratchpadUpdate = jest.fn((): Promise<void> => Promise.resolve());
    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('should not be called for scratchpad'));

    const result = await orchestrateLlmLoop(model, 0.7, [user('Remember this note')], undefined, undefined, onScratchpadUpdate, onExecuteTool);

    expect(onScratchpadUpdate).toHaveBeenCalledWith('remember this', 'append');
    expect(onExecuteTool).not.toHaveBeenCalled();
    expect(result.finalContent).toBe('Done updating scratchpad');
    expect(result.toolLoopTrace).toHaveLength(1);
    expect(result.toolLoopTrace[0].toolResults[0]).toEqual({
      toolCallId: 'call-scratchpad',
      toolName: 'update_scratchpad',
      result: 'Updated.',
    });
  });

  it('echoes web search arguments for $web_search builtin tool calls', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-web',
                    type: 'builtin_function',
                    function: { name: '$web_search', arguments: '{"query":"latest ai news"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 9, completion_tokens: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: 'Here are the search results summary',
              },
            },
          ],
          usage: { prompt_tokens: 14, completion_tokens: 7 },
        }),
      );

    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('should not be called for web search builtin'));

    const result = await orchestrateLlmLoop(
      model,
      0.7,
      [user('Find recent AI updates')],
      undefined,
      undefined,
      undefined,
      onExecuteTool,
      undefined,
      [],
      true,
    );

    expect(onExecuteTool).not.toHaveBeenCalled();
    expect(result.finalContent).toBe('Here are the search results summary');
    expect(result.toolLoopTrace).toHaveLength(1);
    expect(result.toolLoopTrace[0].toolResults[0]).toEqual({
      toolCallId: 'call-web',
      toolName: '$web_search',
      result: '{"query":"latest ai news"}',
    });
  });

  it('stops after max tool-loop iterations when model keeps returning tool calls', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    const toolResponse = jsonResponse({
      id: 'resp-tool',
      model: model.apiModelId,
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [
              {
                id: 'loop-call',
                type: 'function',
                function: { name: 'read_messages', arguments: '{"messages":[{"messageId":"abc"}]}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });

    mockFetch
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(toolResponse);

    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('loop result'));
    const result = await orchestrateLlmLoop(model, 0.7, [user('Loop test')], undefined, undefined, undefined, onExecuteTool);

    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(result.toolLoopTrace).toHaveLength(5);
    expect(onExecuteTool).toHaveBeenCalledTimes(5);
  });

  it('truncates oversized tool results before adding them to context', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-large',
                    type: 'function',
                    function: { name: 'read_messages', arguments: '{"messages":[{"messageId":"abc"}]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [{ finish_reason: 'stop', message: { content: 'ok' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
      );

    const oversizedResult = 'X'.repeat(10_000);
    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve(oversizedResult));

    const result = await orchestrateLlmLoop(model, 0.7, [user('Get large result')], undefined, undefined, undefined, onExecuteTool);
    const tracedResult = result.toolLoopTrace[0].toolResults[0].result;

    expect(tracedResult).toContain('[TRUNCATED: result exceeded 8000 chars]');
    expect(tracedResult.length).toBeGreaterThan(8000);
  });

  it('captures tool execution errors and continues the loop', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-error',
                    type: 'function',
                    function: { name: 'read_messages', arguments: '{"messages":[{"messageId":"abc"}]}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [{ finish_reason: 'stop', message: { content: 'fallback answer' } }],
          usage: { prompt_tokens: 11, completion_tokens: 4 },
        }),
      );

    const onExecuteTool = jest.fn((): Promise<string> => Promise.reject(new Error('tool failed')));

    const result = await orchestrateLlmLoop(model, 0.7, [user('Trigger tool error')], undefined, undefined, undefined, onExecuteTool);

    expect(onExecuteTool).toHaveBeenCalledTimes(1);
    expect(result.finalContent).toBe('fallback answer');
    expect(result.toolLoopTrace[0].toolResults[0].toolName).toBe('read_messages');
    expect(result.toolLoopTrace[0].toolResults[0].result).toContain('Error executing tool: tool failed');
  });

  it('does not crash on malformed update_scratchpad arguments and skips scratchpad update callback', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-1',
          model: model.apiModelId,
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call-bad-scratchpad',
                    type: 'function',
                    function: { name: 'update_scratchpad', arguments: '{not-json' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 9, completion_tokens: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'resp-2',
          model: model.apiModelId,
          choices: [{ finish_reason: 'stop', message: { content: 'continue after bad args' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
      );

    const onScratchpadUpdate = jest.fn((): Promise<void> => Promise.resolve());

    const result = await orchestrateLlmLoop(model, 0.7, [user('bad scratchpad args test')], undefined, undefined, onScratchpadUpdate);

    expect(onScratchpadUpdate).not.toHaveBeenCalled();
    expect(result.finalContent).toBe('continue after bad args');
  });

  it('drops oldest non-system messages when token budget is exceeded while keeping system messages', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockAuthGetState.mockReturnValue({ customInstructions: '', maxContextTokens: 10 });
    mockEstimateTokens.mockReturnValue({ promptTokens: 1000, completionTokens: 0, totalTokens: 1000 });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'resp-1',
        model: model.apiModelId,
        choices: [{ finish_reason: 'stop', message: { content: 'short answer' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      }),
    );

    await orchestrateLlmLoop(model, 0.7, [system('sys instructions'), user('old question'), asst('old answer')]);

    const requestInit = mockFetch.mock.calls[0][1];
    expect(requestInit).toBeDefined();
    const body = JSON.parse(String(requestInit?.body)) as { messages: { role: string; content: string | null }[] };

    expect(body.messages).toEqual([{ role: 'system', content: 'sys instructions' }]);
  });
});
