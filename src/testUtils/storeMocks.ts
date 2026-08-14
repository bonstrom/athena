/** Type helper for plain Zustand hook mocks used in component tests. */
export type MockStoreHook<T> = jest.Mock<T>;

/**
 * Configures a Zustand hook mock to support selector functions (the pattern
 * `useStore((s) => s.field)`). Replaces `mockReturnValue(state)` so the mock
 * returns `selector(state)` when called with a selector, or the full `state`
 * when called with no arguments.
 *
 * @example
 * ```ts
 * selectorize(mockUseChatStore, createChatStore());
 * ```
 */
export function selectorize<T>(mock: jest.Mock, state: T): jest.Mock {
  mock.mockImplementation((selector?: (s: T) => unknown): unknown => (selector ? selector(state) : state));
  return mock;
}

/**
 * Type helper for Zustand hooks that also export a static `.getState()` method
 * (e.g., `useProviderStore`). Use `Object.assign(jest.fn(), { getState: jest.fn() })`
 * in the `jest.mock` factory, then cast the import to this type.
 *
 * @example
 * ```ts
 * jest.mock('../store/ProviderStore', () => ({
 *   useProviderStore: Object.assign(jest.fn(), { getState: jest.fn() }),
 * }));
 *
 * const mockProvider = useProviderStore as unknown as MockStoreHookWithGetState<ProviderSlice, ProviderState>;
 * ```
 */
export type MockStoreHookWithGetState<THook, TState = unknown> = jest.Mock<THook> & {
  getState: jest.Mock<TState>;
};
