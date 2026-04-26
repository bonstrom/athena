// Manual mock for gpt-tokenizer.
// Jest resolves __mocks__/ next to node_modules for third-party packages.
// The real package ships ESM-only (via its `main` field) which Jest/jsdom
// cannot parse; this stub avoids the SyntaxError / TextDecoder issues.

/**
 * Rough approximation: ~1 token per 4 characters.
 * Tests that rely on token counts only need non-zero, reasonable values.
 * @param {string} text
 * @returns {number[]}
 */
function encode(text) {
  const len = Math.ceil((text ?? '').length / 4);
  return Array.from({ length: len }, (_, i) => i);
}

module.exports = { encode };
