# Copilot Instructions for Athena

## Goal

Generate TypeScript code and tests that pass ESLint without follow-up fixes, with special focus on avoiding `any` and unsafe-return issues.

## Required Rules

- Never use `any` in code or tests.
- Never use `as any` casts.
- Never return implicitly-typed arrays from mocks when element type matters.
- Prefer explicit function return types in mock implementations.
- Prefer `unknown` over `any` for untrusted data, then narrow with type guards.
- Keep changes minimal and local to the requested task.

## Lint-Safe TypeScript Patterns

### 1) Typed array returns in mocks

Use explicit array types instead of untyped `new Array(...).fill(...)`.

Good:

```ts
jest.fn((text: string): number[] => new Array<number>(text.length).fill(0));
```

Bad:

```ts
jest.fn((text: string) => new Array(text.length).fill(0));
```

### 2) Avoid `as any` in union data

When a union type exists, construct valid members of the union.

Good:

```ts
const part: LlmContentPart = { type: 'image_url', image_url: { url: 'https://example.com/a.png' } };
```

Bad:

```ts
const part = { type: 'image_url' as any, text: 'x' } as any;
```

### 3) Safer JSON handling

Good:

```ts
const parsed: unknown = JSON.parse(raw);
if (isMyType(parsed)) {
  // use parsed
}
```

Bad:

```ts
const parsed: any = JSON.parse(raw);
```

### 4) Typed Jest mocks

Prefer typed references to mocked functions.

```ts
const mockEncode = encode as jest.MockedFunction<typeof encode>;
mockEncode.mockImplementation((text: string): number[] => new Array<number>(text.length).fill(0));
```

## Test Authoring Rules

- Use behavior assertions over implementation trivia.
- Avoid fragile assertions that depend on unrelated internals.
- Keep test data fully type-valid (no lint suppression by cast).
- If a warning is expected, assert it with a spy and restore the spy.

## Pre-Completion Checklist

Before finishing any TypeScript change:

1. Ensure no `any` or `as any` was introduced.
2. Ensure mock callback return types are explicit where needed.
3. Run ESLint on touched files.
4. Run related tests for touched logic.

## Notes for This Repo

- The codebase is strict about `@typescript-eslint/no-unsafe-*` and `no-explicit-any`.
- Most avoidable lint failures here come from test mocks and loosely typed fixtures.
