import { getPayloadOverrides, LlmProvider } from '../provider';

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
