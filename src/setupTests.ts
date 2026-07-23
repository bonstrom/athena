// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import { ReadableStream as NodeReadableStream } from 'stream/web';

const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = (...args: unknown[]): void => {
    if (typeof args[0] === 'string') {
      if (args[0].includes('not wrapped in act(')) {
        return;
      }
      if (args[0].includes('Not supported') || args[0].includes('Auto-backup requires')) {
        return;
      }
      if (args[0].includes('Failed to update context pin')) {
        return;
      }
      if (args[0].includes('Failed to copy message')) {
        return;
      }
      if (args[0].includes('Failed to fork conversation')) {
        return;
      }
      if (args[0].includes('Failed to delete message')) {
        return;
      }
      if (args[0].includes('Failed to fetch messages')) {
        return;
      }
      if (args[0].includes('Failed to load messages')) {
        return;
      }
      const joined = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
      if (joined.includes('Not supported') || joined.includes('Auto-backup requires')) {
        return;
      }
    }
    if (args[0] instanceof Error && args[0].message.includes('Not implemented: navigation')) {
      return;
    }
    const errorStr = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : '')).join(' ');
    if (errorStr.includes('Not implemented: navigation')) {
      return;
    }
    originalError.call(console, ...args);
  };
  console.warn = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].includes('MUI: You are providing a disabled')) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', { value: NodeTextEncoder, writable: true, configurable: true });
}
if (typeof globalThis.TextDecoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextDecoder', { value: NodeTextDecoder, writable: true, configurable: true });
}
if (typeof globalThis.ReadableStream === 'undefined') {
  Object.defineProperty(globalThis, 'ReadableStream', { value: NodeReadableStream, writable: true, configurable: true });
}

// jsdom polyfill: scrollIntoView is not implemented in jsdom
try {
  Element.prototype.scrollIntoView = jest.fn();
} catch {
  // jsdom may have it defined already
}

// jsdom polyfill: crypto.randomUUID is not available in jsdom
const gCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
if (!gCrypto) {
  Object.defineProperty(globalThis, 'crypto', { value: {}, writable: true, configurable: true });
}
if (!(globalThis.crypto as { randomUUID?: () => string }).randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: (): string => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
    writable: true,
    configurable: true,
  });
}
