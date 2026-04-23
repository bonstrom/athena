/**
 * Simple utility for obfuscating and de-obfuscating strings.
 * This is NOT a replacement for server-side security, but prevents
 * keys from being stored in plaintext in localStorage.
 */
export const SecurityUtils = {
  /**
   * Encodes a string to a simple Base64-like format with an 'obf:' prefix.
   */
  encode(value: string): string {
    if (!value) return '';
    // If it already looks like our obfuscated format, don't double-encode
    if (value.startsWith('obf:')) return value;

    try {
      // Basic Caesar-style shift + Base64
      const shifted = Array.from(value)
        .map((char) => String.fromCharCode(char.charCodeAt(0) + 1))
        .join('');
      return `obf:${btoa(shifted)}`;
    } catch (e) {
      console.warn('Failed to encode value, using plaintext fallback', e);
      return value;
    }
  },

  /**
   * Decodes a string from the 'obf:' format. Fallback to original if not obfuscated.
   */
  decode(value: string | null): string {
    if (!value) return '';
    if (!value.startsWith('obf:')) return value;

    try {
      const encoded = value.substring(4);
      const shifted = atob(encoded);
      return Array.from(shifted)
        .map((char) => String.fromCharCode(char.charCodeAt(0) - 1))
        .join('');
    } catch (e) {
      console.warn('Failed to decode obfuscated value, returning empty value', e);
      return '';
    }
  },
};
