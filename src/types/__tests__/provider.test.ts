import { DEFAULT_MODELS, getPayloadOverrides, LlmProvider } from '../provider';

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
    expect(kimi26!.forceTemperature).toBe(1.0);
  });

  it('has forceTemperature 1.0 for Kimi 2.5', () => {
    const kimi25 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-5');
    expect(kimi25).toBeDefined();
    expect(kimi25!.forceTemperature).toBe(1.0);
  });

  it('has forceTemperature 1.0 for Kimi K2 Turbo Preview', () => {
    const kimiTurbo = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-turbo');
    expect(kimiTurbo).toBeDefined();
    expect(kimiTurbo!.forceTemperature).toBe(1.0);
  });

  it('has supportsTemperature false for Kimi 2.6 (API rejects custom temperature)', () => {
    const kimi26 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-6');
    expect(kimi26).toBeDefined();
    expect(kimi26!.supportsTemperature).toBe(false);
  });

  it('has supportsTemperature false for Kimi 2.5 (API rejects custom temperature)', () => {
    const kimi25 = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-5');
    expect(kimi25).toBeDefined();
    expect(kimi25!.supportsTemperature).toBe(false);
  });

  it('has supportsTemperature false for Kimi K2 Turbo Preview (API rejects custom temperature)', () => {
    const kimiTurbo = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-turbo');
    expect(kimiTurbo).toBeDefined();
    expect(kimiTurbo!.supportsTemperature).toBe(false);
  });

  it('has forceTemperature 1.0 for Kimi 2.7 Code', () => {
    const kimi27Code = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-7-code');
    expect(kimi27Code).toBeDefined();
    expect(kimi27Code!.forceTemperature).toBe(1.0);
  });

  it('has supportsTemperature false for Kimi 2.7 Code (API rejects custom temperature)', () => {
    const kimi27Code = DEFAULT_MODELS.find((m) => m.id === 'builtin-kimi-k2-7-code');
    expect(kimi27Code).toBeDefined();
    expect(kimi27Code!.supportsTemperature).toBe(false);
  });

  it('has supportsTemperature false for Kimi v1 8k (API rejects custom temperature)', () => {
    const kimiV1 = DEFAULT_MODELS.find((m) => m.id === 'builtin-moonshot-v1-8k');
    expect(kimiV1).toBeDefined();
    expect(kimiV1!.supportsTemperature).toBe(false);
  });
});
