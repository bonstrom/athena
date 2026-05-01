/** Type helper for plain Zustand hook mocks used in component tests. */
export type MockStoreHook<T> = jest.Mock<T>;

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
