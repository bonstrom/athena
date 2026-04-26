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
jest.mock('../embeddingWorkerFactory', () => ({ createEmbeddingWorker: jest.fn() }));
jest.mock('../llmWorkerFactory', () => ({ createLlmWorker: jest.fn() }));

import { filterMessagesForModel, LlmMessage, orchestrateLlmLoop } from '../llmService';
import { calculateCostSEK } from '../../components/ModelSelector';
import { estimateTokens } from '../estimateTokens';
import { LlmProvider, UserChatModel } from '../../types/provider';

const mockEstimateTokens = estimateTokens as jest.MockedFunction<typeof estimateTokens>;
const mockCalculateCostSEK = calculateCostSEK as jest.MockedFunction<typeof calculateCostSEK>;

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
    supportsThinking: false,
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
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

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
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]): void => {
      void args;
    });

    mockEstimateTokens.mockReturnValue({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    mockAuthGetState.mockReturnValue({ customInstructions: '', maxContextTokens: 16000 });
    mockProviderGetState.mockReturnValue({
      models: [model],
      getAvailableModels: (): UserChatModel[] => [model],
      getProviderForModel: (): LlmProvider => provider,
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
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

    mockFetch.mockResolvedValue(toolResponse);

    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('loop result'));
    const result = await orchestrateLlmLoop(model, 0.7, [user('Loop test')], undefined, undefined, undefined, onExecuteTool);

    expect(mockFetch).toHaveBeenCalledTimes(11);
    expect(result.toolLoopTrace).toHaveLength(10);
    expect(onExecuteTool).toHaveBeenCalledTimes(10);
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

  it('logs tool execution and truncates long display output in the tool log', async () => {
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
                    id: 'call-log',
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
          usage: { prompt_tokens: 11, completion_tokens: 4 },
        }),
      );

    const onExecuteTool = jest.fn((): Promise<string> => Promise.resolve('Y'.repeat(600)));
    const onToolLog = jest.fn((log: string): void => {
      void log;
    });

    await orchestrateLlmLoop(model, 0.7, [user('Show logs')], undefined, undefined, undefined, onExecuteTool, onToolLog);

    expect(onToolLog).toHaveBeenCalledWith(expect.stringContaining('**Executing Tool**: `read_messages`'));
    expect(onToolLog).toHaveBeenCalledWith(expect.stringContaining('... *(display truncated — full content sent to LLM)*'));
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

  it('logs and applies scratchpad updates from HTML comment fallback syntax', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'resp-fallback-scratchpad',
        model: model.apiModelId,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Visible answer\n<!-- replace: store this memory -->',
            },
          },
        ],
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      }),
    );

    const onScratchpadUpdate = jest.fn((): Promise<void> => Promise.resolve());
    const onToolLog = jest.fn((log: string): void => {
      void log;
    });

    const result = await orchestrateLlmLoop(
      model,
      0.7,
      [user('Remember this with fallback syntax')],
      undefined,
      undefined,
      onScratchpadUpdate,
      undefined,
      onToolLog,
    );

    expect(onScratchpadUpdate).toHaveBeenCalledWith('store this memory', 'replace');
    expect(onToolLog).toHaveBeenCalledWith(expect.stringContaining('**Executing Tool**: `update_scratchpad` *(via fallback syntax)*'));
    expect(onToolLog).toHaveBeenCalledWith(expect.stringContaining('"action": "replace"'));
    expect(result.finalContent).toBe('Visible answer');
    expect(result.lastResult.aiNote).toBe('store this memory');
    expect(result.lastResult.aiNoteAction).toBe('replace');
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

describe('askLlm — non-streaming API calls', () => {
  const model: UserChatModel = makeModel(false);
  const provider: LlmProvider = {
    id: 'test-provider',
    name: 'Test Provider',
    baseUrl: 'https://example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: 'key-encrypted',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
  };

  beforeEach(() => {
    mockAuthGetState.mockReturnValue({ customInstructions: '', maxContextTokens: 16000 });
    mockProviderGetState.mockReturnValue({
      models: [model],
      getAvailableModels: (): UserChatModel[] => [model],
      getProviderForModel: (): LlmProvider => provider,
    });
    mockEstimateTokens.mockReturnValue({ promptTokens: 50, completionTokens: 75, totalTokens: 125 });
  });

  it('returns response with message content and token counts', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: (): Promise<unknown> =>
        Promise.resolve({
          choices: [{ message: { content: 'Hello there' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 48, completion_tokens: 12 },
        }),
    } as unknown as Response);

    const { askLlm } = await import('../llmService');
    const result = await askLlm(model, 0.7, [user('Hi')]);

    expect(result.content).toBe('Hello there');
    expect(result.promptTokens).toBe(48);
    expect(result.completionTokens).toBe(12);
    expect(result.finishReason).toBe('stop');
  });

  it('throws error when API returns non-OK status', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: (): Promise<string> => Promise.resolve('Unauthorized'),
    } as unknown as Response);

    const { askLlm } = await import('../llmService');
    await expect(askLlm(model, 0.7, [user('Test')])).rejects.toThrow('LLM Error 401');
  });

  it('preserves cached token information from API response', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: (): Promise<unknown> =>
        Promise.resolve({
          choices: [{ message: { content: 'cached result' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 60 },
          },
        }),
    } as unknown as Response);

    const { askLlm } = await import('../llmService');
    const result = await askLlm(model, 0.7, [user('Test')]);

    expect(result.promptTokensDetails?.cached_tokens).toBe(60);
  });
});

describe('askLlmStream — streaming API calls', () => {
  const model: UserChatModel = makeModel(false);
  const provider: LlmProvider = {
    id: 'test-provider',
    name: 'Test Provider',
    baseUrl: 'https://example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: 'key-encrypted',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
  };

  beforeEach(() => {
    mockAuthGetState.mockReturnValue({ customInstructions: '', maxContextTokens: 16000 });
    mockProviderGetState.mockReturnValue({
      models: [model],
      getAvailableModels: (): UserChatModel[] => [model],
      getProviderForModel: (): LlmProvider => provider,
    });
    mockEstimateTokens.mockReturnValue({ promptTokens: 50, completionTokens: 75, totalTokens: 125 });
  });

  it('streams tokens, assembles the final content, and uses usage from the stream', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    const streamPayload = [
      'data: {"id":"resp-stream","model":"test-model","choices":[{"delta":{"content":"Hello "}}]}',
      'data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":21,"completion_tokens":7}}',
      'data: [DONE]',
      '',
    ].join('\n');

    let readCount = 0;
    const reader = {
      read: jest.fn((): Promise<ReadableStreamReadResult<Uint8Array>> => {
        if (readCount === 0) {
          readCount += 1;
          return Promise.resolve({ done: false, value: Buffer.from(streamPayload, 'utf8') });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
      releaseLock: jest.fn((): void => undefined),
      cancel: jest.fn((): Promise<void> => Promise.resolve()),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: (): typeof reader => reader,
      },
    } as unknown as Response);

    const onToken = jest.fn((token: string): void => {
      void token;
    });

    const { askLlmStream } = await import('../llmService');
    const result = await askLlmStream(model, 0.7, [user('Hi')], onToken);

    expect(onToken).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(onToken).toHaveBeenNthCalledWith(2, 'world');
    expect(result.content).toBe('Hello world');
    expect(result.promptTokens).toBe(21);
    expect(result.completionTokens).toBe(7);
    expect(result.finishReason).toBe('stop');
    expect(result.responseId).toBe('resp-stream');
    expect(result.actualModel).toBe('test-model');
    expect(mockEstimateTokens).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });
});

describe('estimateStreamedTokens', () => {
  it('uses estimated tokens and calculateCostSEK to build the result', async () => {
    const model = makeModel(false);
    mockEstimateTokens.mockReturnValue({ promptTokens: 123, completionTokens: 45, totalTokens: 168 });
    mockCalculateCostSEK.mockReturnValue(1.75);

    const { estimateStreamedTokens } = await import('../llmService');
    const result = estimateStreamedTokens(model, [user('hello')], 'streamed response');

    expect(mockEstimateTokens).toHaveBeenCalledWith([user('hello')], 'streamed response');
    expect(mockCalculateCostSEK).toHaveBeenCalledWith(model, 123, 45);
    expect(result).toEqual({ promptTokens: 123, completionTokens: 45, costSEK: 1.75 });
  });
});

describe('getMoonshotBalance', () => {
  const moonshotProvider: LlmProvider = {
    id: 'builtin-moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.ai/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: 'moonshot-key',
    supportsWebSearch: true,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: true,
  };

  beforeEach(() => {
    mockProviderGetState.mockReturnValue({ providers: [moonshotProvider] });
  });

  it('returns the available balance on success', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: (): Promise<unknown> =>
        Promise.resolve({
          status: true,
          data: { available_balance: 42.5, voucher_balance: 0, cash_balance: 42.5 },
        }),
    } as unknown as Response);

    const { getMoonshotBalance } = await import('../llmService');
    const result = await getMoonshotBalance();

    expect(mockFetch).toHaveBeenCalledWith('https://api.moonshot.ai/v1/users/me/balance', {
      headers: {
        Authorization: 'Bearer moonshot-key',
      },
    });
    expect(result).toEqual({ available_balance: 42.5, voucher_balance: 0, cash_balance: 42.5 });
  });

  it('returns null when no Moonshot key is configured', async () => {
    mockProviderGetState.mockReturnValue({
      providers: [{ ...moonshotProvider, apiKeyEncrypted: '' }],
    });

    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    const { getMoonshotBalance } = await import('../llmService');
    const result = await getMoonshotBalance();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for non-OK responses and failed payloads', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({ ok: false } as Response).mockResolvedValueOnce({
      ok: true,
      json: (): Promise<unknown> =>
        Promise.resolve({
          status: false,
          data: { available_balance: 99, voucher_balance: 0, cash_balance: 99 },
        }),
    } as unknown as Response);

    const { getMoonshotBalance } = await import('../llmService');

    await expect(getMoonshotBalance()).resolves.toBeNull();
    await expect(getMoonshotBalance()).resolves.toBeNull();
  });

  it('returns null and logs when fetching the balance throws', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
      void args;
    });
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const { getMoonshotBalance } = await import('../llmService');
    const result = await getMoonshotBalance();

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch Moonshot balance:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});

describe('getDeepSeekBalance', () => {
  const deepseekProvider: LlmProvider = {
    id: 'builtin-deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: 'deepseek-key',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: true,
  };

  beforeEach(() => {
    mockProviderGetState.mockReturnValue({ providers: [deepseekProvider] });
  });

  it('returns the parsed balance and currency on success', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: (): Promise<unknown> =>
        Promise.resolve({
          is_available: true,
          balance_infos: [{ currency: 'USD', total_balance: '12.34', granted_balance: '0', topped_up_balance: '12.34' }],
        }),
    } as unknown as Response);

    const { getDeepSeekBalance } = await import('../llmService');
    const result = await getDeepSeekBalance();

    expect(mockFetch).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', {
      headers: {
        Authorization: 'Bearer deepseek-key',
        Accept: 'application/json',
      },
    });
    expect(result).toEqual({ balance: 12.34, currency: 'USD' });
  });

  it('returns null when no DeepSeek key is configured', async () => {
    mockProviderGetState.mockReturnValue({
      providers: [{ ...deepseekProvider, apiKeyEncrypted: '' }],
    });

    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    const { getDeepSeekBalance } = await import('../llmService');
    const result = await getDeepSeekBalance();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null for unavailable, empty, or non-OK DeepSeek balance responses', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: (): Promise<unknown> => Promise.resolve({ is_available: false, balance_infos: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: (): Promise<unknown> => Promise.resolve({ is_available: true, balance_infos: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    const { getDeepSeekBalance } = await import('../llmService');

    await expect(getDeepSeekBalance()).resolves.toBeNull();
    await expect(getDeepSeekBalance()).resolves.toBeNull();
    await expect(getDeepSeekBalance()).resolves.toBeNull();
  });

  it('logs errors only in development when fetch throws', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
      void args;
    });
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockRejectedValueOnce(new Error('timeout'));

    const { getDeepSeekBalance } = await import('../llmService');
    const result = await getDeepSeekBalance();

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch DeepSeek balance:', expect.any(Error));

    consoleErrorSpy.mockRestore();
    Object.defineProperty(process.env, 'NODE_ENV', { value: previousNodeEnv, configurable: true });
  });
});
describe('askLlm — temperature resolution', () => {
  const model: UserChatModel = {
    id: 'kimi-forced',
    label: 'Kimi Forced',
    apiModelId: 'kimi-k2.5',
    providerId: 'test-provider',
    input: 0,
    cachedInput: 0,
    output: 0,
    streaming: true,
    supportsTemperature: true,
    supportsTools: true,
    supportsVision: false,
    supportsFiles: false,
    supportsThinking: false,
    contextWindow: 128000,
    forceTemperature: 1.0, // FORCED
    enforceAlternatingRoles: false,
    maxTokensOverride: null,
    isBuiltIn: false,
    enabled: true,
  };

  const provider: LlmProvider = {
    id: 'test-provider',
    name: 'Test Provider',
    baseUrl: 'https://example.com/v1/chat/completions',
    messageFormat: 'openai',
    apiKeyEncrypted: 'key-encrypted',
    supportsWebSearch: false,
    requiresReasoningFallback: false,
    payloadOverridesJson: '',
    isBuiltIn: false,
  };

  beforeEach(() => {
    mockAuthGetState.mockReturnValue({ customInstructions: '', maxContextTokens: 16000 });
    mockProviderGetState.mockReturnValue({
      models: [model],
      getAvailableModels: (): UserChatModel[] => [model],
      getProviderForModel: (): LlmProvider => provider,
    });
    mockEstimateTokens.mockReturnValue({ promptTokens: 50, completionTokens: 75, totalTokens: 125 });
  });

  it('uses forced temperature even if a different one is requested in askLlm', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: (): Promise<unknown> =>
        Promise.resolve({
          choices: [{ message: { content: 'forced temp response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    } as unknown as Response);

    const { askLlm } = await import('../llmService');
    // We request 0.7, but the model has forceTemperature: 1.0
    await askLlm(model, 0.7, [user('Hi')]);

    const requestInit = mockFetch.mock.calls[0][1];
    const body = JSON.parse(String(requestInit?.body)) as { temperature: number };
    expect(body.temperature).toBe(1.0);
  });

  it('uses forced temperature in streaming requests (orchestrateLlmLoop)', async () => {
    const mockFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true });

    // Mock a streaming response (simplified)
    const mockStream = new ReadableStream({
      start(controller): void {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"streaming response"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    } as unknown as Response);

    const { orchestrateLlmLoop } = await import('../llmService');
    // Model is streaming: true, so it will call askLlmStream
    // We request 0.5, but model has forceTemperature: 1.0
    await orchestrateLlmLoop(model, 0.5, [user('Hi')], () => {});

    const requestInit = mockFetch.mock.calls[0][1];
    const body = JSON.parse(String(requestInit?.body)) as { temperature: number };
    expect(body.temperature).toBe(1.0);
  });
});
