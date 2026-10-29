import { DEFAULT_MODELS, getPayloadOverrides, resolveReasoningEffort, LlmProvider } from '../provider';
import { createUserChatModel } from '../../testUtils/fixtures';

describe('resolveReasoningEffort', () => {
  it('defaults configurable models to medium rather than the first option', () => {
    const model = createUserChatModel({ reasoningEffort: null, reasoningEfforts: ['none', 'low', 'medium', 'high'] });
    expect(resolveReasoningEffort(model, null)).toBe('medium');
  });

  it('preserves an explicit none or low preference when supported', () => {
    const model = createUserChatModel({ reasoningEffort: null, reasoningEfforts: ['none', 'low', 'high'] });
    expect(resolveReasoningEffort(model, 'none')).toBe('none');
    expect(resolveReasoningEffort(model, 'low')).toBe('low');
  });

  it('honors fixed model effort and clamps unsupported efforts', () => {
    expect(resolveReasoningEffort(createUserChatModel({ reasoningEffort: 'medium' }), 'low')).toBe('medium');
    const model = createUserChatModel({ reasoningEffort: null, reasoningEfforts: ['low', 'high'] });
    expect(resolveReasoningEffort(model, null)).toBe('low');
  });

  it('does not add an effort parameter to native-thinking models by default', () => {
    expect(resolveReasoningEffort(createUserChatModel({ reasoningEffort: undefined }), null)).toBeNull();
  });
});

const baseProvider: LlmProvider = {
  id: 'provider-id',
  name: 'Provider',
  baseUrl: 'https://example.com/v1/chat/completions',
  messageFormat: 'openai',
  apiKeyEncrypted: '',
  supportsWebSearch: false,
  requiresReasoningFallback: false,
  payloadOverridesJson: '',
  isBuiltIn: false,
};

describe('getPayloadOverrides', () => {
  it('returns parsed object for valid object JSON', () => {
    const provider: LlmProvider = {
      ...baseProvider,
      payloadOverridesJson: '{"max_tokens":2048,"temperature":0.7}',
    };

    expect(getPayloadOverrides(provider)).toEqual({ max_tokens: 2048, temperature: 0.7 });
  });

  it('returns empty object for invalid JSON', () => {
    const provider: LlmProvider = {
      ...baseProvider,
      payloadOverridesJson: '{invalid-json',
    };

    expect(getPayloadOverrides(provider)).toEqual({});
  });

  it('returns empty object when parsed value is null', () => {
    const provider: LlmProvider = {
      ...baseProvider,
      payloadOverridesJson: 'null',
    };

    expect(getPayloadOverrides(provider)).toEqual({});
  });

  it('returns empty object when parsed value is an array', () => {
    const provider: LlmProvider = {
      ...baseProvider,
      payloadOverridesJson: '[1,2,3]',
    };

    expect(getPayloadOverrides(provider)).toEqual({});
  });

  it('returns empty object when parsed value is a primitive', () => {
    const provider: LlmProvider = {
      ...baseProvider,
      payloadOverridesJson: 'true',
    };

    expect(getPayloadOverrides(provider)).toEqual({});
  });
});

describe('DEFAULT_MODELS', () => {
  it('has forceTemperature 1.0 for Kimi 2.6', () => {
    const kimi26 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-6');
    expect(kimi26).toBeDefined();
    if (!kimi26) { throw new Error('Expected kimi26 to be defined'); }
    expect(kimi26.forceTemperature).toBe(1.0);
  });

  it('has forceTemperature 1.0 for Kimi 2.5', () => {
    const kimi25 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-5');
    expect(kimi25).toBeDefined();
    if (!kimi25) { throw new Error('Expected kimi25 to be defined'); }
    expect(kimi25.forceTemperature).toBe(1.0);
  });

  it('has forceTemperature 1.0 for Kimi K2 Turbo Preview', () => {
    const kimiTurbo = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-turbo');
    expect(kimiTurbo).toBeDefined();
    if (!kimiTurbo) { throw new Error('Expected kimiTurbo to be defined'); }
    expect(kimiTurbo.forceTemperature).toBe(1.0);
  });

  it('has supportsTemperature false for Kimi 2.6 (API rejects custom temperature)', () => {
    const kimi26 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-6');
    expect(kimi26).toBeDefined();
    if (!kimi26) { throw new Error('Expected kimi26 to be defined'); }
    expect(kimi26.supportsTemperature).toBe(false);
  });

  it('has supportsTemperature false for Kimi 2.5 (API rejects custom temperature)', () => {
    const kimi25 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-5');
    expect(kimi25).toBeDefined();
    if (!kimi25) { throw new Error('Expected kimi25 to be defined'); }
    expect(kimi25.supportsTemperature).toBe(false);
  });

  it('has supportsTemperature false for Kimi K2 Turbo Preview (API rejects custom temperature)', () => {
    const kimiTurbo = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-turbo');
    expect(kimiTurbo).toBeDefined();
    if (!kimiTurbo) { throw new Error('Expected kimiTurbo to be defined'); }
    expect(kimiTurbo.supportsTemperature).toBe(false);
  });

  it('has forceTemperature 1.0 for Kimi 2.7 Code', () => {
    const kimi27Code = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-7-code');
    expect(kimi27Code).toBeDefined();
    if (!kimi27Code) { throw new Error('Expected kimi27Code to be defined'); }
    expect(kimi27Code.forceTemperature).toBe(1.0);
  });

  it('has supportsTemperature false for Kimi 2.7 Code (API rejects custom temperature)', () => {
    const kimi27Code = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-7-code');
    expect(kimi27Code).toBeDefined();
    if (!kimi27Code) { throw new Error('Expected kimi27Code to be defined'); }
    expect(kimi27Code.supportsTemperature).toBe(false);
  });

  it('has supportsTemperature false for Kimi v1 8k (API rejects custom temperature)', () => {
    const kimiV1 = DEFAULT_MODELS.find((m) => m.id === 'builtin-moonshot-v1-8k');
    expect(kimiV1).toBeDefined();
    if (!kimiV1) { throw new Error('Expected kimiV1 to be defined'); }
    expect(kimiV1.supportsTemperature).toBe(false);
  });

  it('has reasoningEffort "high" for Kimi K3.1 Pro', () => {
    const kimiK31Pro = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k3-1-pro');
    expect(kimiK31Pro).toBeDefined();
    if (!kimiK31Pro) { throw new Error('Expected kimiK31Pro to be defined'); }
    expect(kimiK31Pro.reasoningEffort).toBe('high');
  });

  it('has supportsThinking true for Kimi K3.1 Pro', () => {
    const kimiK31Pro = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k3-1-pro');
    expect(kimiK31Pro).toBeDefined();
    if (!kimiK31Pro) { throw new Error('Expected kimiK31Pro to be defined'); }
    expect(kimiK31Pro.supportsThinking).toBe(true);
  });

  it('has K3.1 Pro pricing and 1M context window', () => {
    const kimiK31Pro = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k3-1-pro');
    expect(kimiK31Pro).toBeDefined();
    if (!kimiK31Pro) { throw new Error('Expected kimiK31Pro to be defined'); }
    expect(kimiK31Pro.apiModelId).toBe('kimi-k3.1-pro');
    expect(kimiK31Pro.input).toBe(2.0);
    expect(kimiK31Pro.cachedInput).toBe(0.2);
    expect(kimiK31Pro.output).toBe(10.0);
    expect(kimiK31Pro.contextWindow).toBe(1_048_576);
  });

  it('has off-peak DeepSeek V4.1 Flash pricing, vision, and 1M context', () => {
    const flash = DEFAULT_MODELS.find((m) => m.id === 'builtin-deepseek-v4-flash');
    expect(flash).toBeDefined();
    if (!flash) { throw new Error('Expected flash to be defined'); }
    expect(flash.input).toBe(0.15);
    expect(flash.cachedInput).toBe(0.003);
    expect(flash.output).toBe(0.6);
    expect(flash.supportsVision).toBe(true);
    expect(flash.contextWindow).toBe(1_000_000);
  });

  it('has off-peak DeepSeek V4 Pro pricing and 1M context', () => {
    const pro = DEFAULT_MODELS.find((m) => m.id === 'builtin-deepseek-v4-pro');
    expect(pro).toBeDefined();
    if (!pro) { throw new Error('Expected pro to be defined'); }
    expect(pro.input).toBe(0.66);
    expect(pro.cachedInput).toBe(0.022);
    expect(pro.output).toBe(1.98);
    expect(pro.supportsVision).toBe(false);
    expect(pro.contextWindow).toBe(1_000_000);
  });
});
