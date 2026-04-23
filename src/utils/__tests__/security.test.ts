import { SecurityUtils } from '../security';

describe('SecurityUtils.encode', () => {
  it('returns empty string for an empty input', () => {
    expect(SecurityUtils.encode('')).toBe('');
  });

  it("encodes a plain string with the 'obf:' prefix", () => {
    const result = SecurityUtils.encode('hello');
    expect(result).toMatch(/^obf:/);
    expect(result).not.toContain('hello');
  });

  it('does not double-encode an already-obfuscated value', () => {
    const encoded = SecurityUtils.encode('hello');
    expect(SecurityUtils.encode(encoded)).toBe(encoded);
  });

  it('encodes strings with special characters', () => {
    const result = SecurityUtils.encode('sk-abc123!@#');
    expect(result).toMatch(/^obf:/);
  });
});

describe('SecurityUtils.decode', () => {
  it('returns empty string for null', () => {
    expect(SecurityUtils.decode(null)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(SecurityUtils.decode('')).toBe('');
  });

  it('returns the original value when it is not obfuscated', () => {
    expect(SecurityUtils.decode('plaintext')).toBe('plaintext');
  });

  it('decodes a previously encoded value back to the original', () => {
    const original = 'my-secret-api-key';
    expect(SecurityUtils.decode(SecurityUtils.encode(original))).toBe(original);
  });

  it('round-trips correctly for strings with special characters', () => {
    const original = 'sk-abc123!@#$%^&*()';
    expect(SecurityUtils.decode(SecurityUtils.encode(original))).toBe(original);
  });

  it('round-trips correctly for a string with Unicode characters', () => {
    const original = 'café-key-123';
    expect(SecurityUtils.decode(SecurityUtils.encode(original))).toBe(original);
  });

  it('returns empty string when the base64 payload is invalid', () => {
    const badValue = 'obf:!!!not-valid-base64!!!';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Should not throw; returns empty string as fail-closed fallback
    expect(SecurityUtils.decode(badValue)).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
