// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import { ReadableStream as NodeReadableStream } from 'stream/web';

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', { value: NodeTextEncoder, writable: true, configurable: true });
}
if (typeof globalThis.TextDecoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextDecoder', { value: NodeTextDecoder, writable: true, configurable: true });
}
if (typeof globalThis.ReadableStream === 'undefined') {
  Object.defineProperty(globalThis, 'ReadableStream', { value: NodeReadableStream, writable: true, configurable: true });
}
