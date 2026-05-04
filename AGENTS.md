# Athena — Agent Guide

**What:** Browser-based LLM chat client (React 19, CRA 5, TypeScript 4.9.5, Zustand, MUI 7, Dexie/IndexedDB).

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Dev server :3000 |
| `npm test` | Jest watch mode (via `react-scripts test`) |
| `npm run test:coverage` | Full coverage (v8, `--watchAll=false`) |
| `npm run build` | Production build |
| `npm run lint` | ESLint all `.js/.jsx/.ts/.tsx` |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run pretty` | Prettier all `.ts/.tsx` |
| `npm run deploy` | GH Pages deploy (runs predeploy first) |
| `npm run predeploy` | `CI=true test --watchAll=false && build` |

> **Important:** Always use `npm test` or `npm run test:coverage` — never `npx jest` directly. This project uses CRA, which configures Jest (Babel/TypeScript transforms, jsdom, etc.) internally through `react-scripts test`. Running `npx jest` bypasses this config and will fail with parse errors on TypeScript syntax.
>
> **Running a single test file:** `npm test -- --testPathPattern="ComponentName" --watchAll=false` (matches file path by regex).

Run `lint` before committing; run `test:coverage` after changing tests.

## Code Quality (enforced by ESLint)

- **No `any` or `as any`** — `@typescript-eslint/no-explicit-any` is `warn`, `@typescript-eslint/strict` is on.
- `explicit-function-return-type` required (set to `warn`).
- `unused-imports/no-unused-imports` is `error`.
- Prettier: `singleQuote`, `printWidth: 120`, `bracketSameLine`, `singleAttributePerLine`.
- `JSON.parse` result must be `unknown`, then narrowed with type guards.
- `.github/copilot-instructions.md` has detailed patterns for type-safe test mocks.

## Architecture

- **Single CRA package** (no monorepo). All source in `src/`.
- **Entrypoint:** `src/index.tsx` → `App.tsx` (HashRouter).
- **8 Zustand stores** in `src/store/`: cross-store access via `useXxxStore.getState()` (never hooks outside React).
- **IndexedDB** via Dexie (`src/database/AthenaDb.ts`), 4 tables: `topics`, `messages`, `predefinedPrompts`, `userSettings`. 8 schema migrations.
- **Web Workers** for local ML: `src/services/llmWorker.ts` (Qwen via `@xenova/transformers`) and `src/services/embeddingWorker.ts` (all-MiniLM-L6-v2). Factory wrappers excluded from coverage.
- **5 built-in LLM providers** (OpenAI, DeepSeek, Google, Moonshot, MiniMax). MiniMax uses Anthropic `/v1/messages` format; others use OpenAI `/chat/completions`.
- **Build versioning:** `npm run prebuild` writes `public/build-version.txt`.
- **API key storage:** Obfuscated (Caesar+base64), NOT encrypted — `src/utils/security.ts`.

## Testing

- Jest via `react-scripts test` (CRA defaults). Config in `package.json` `jest` key.
- **Manual mocks** in `src/__mocks__/` for ESM packages: `react-markdown`, `remark-gfm`, `react-syntax-highlighter`, `react-syntax-highlighter/dist/...`.
- **Setup:** `src/setupTests.ts` polyfills `TextEncoder`, `TextDecoder`, `ReadableStream`.
- **Patterns:** `jest.mock()` at module scope, `jest.isolateModules()` for fresh store state, `jest.mocked()` for typed mocks, `clearTokenCacheForTesting()` for tokenizer cache.
- Mock return types must be **explicit** (e.g., `(): number[] => ...`). No implicit `new Array(n).fill(...)`.
- `crypto.randomUUID()` used for all ID generation.

## Test Authoring Quickstart

### Test utilities (`src/testUtils/`)

| Export | Purpose |
|---|---|
| `renderWithTheme(ui)` | `@testing-library/react` `render` wrapped in MUI `<ThemeProvider>` |
| `createMessage(overrides?)` | Returns a fully-typed `Message` fixture |
| `createTopic(overrides?)` | Returns a fully-typed `Topic` fixture |
| `createPredefinedPrompt(overrides?)` | Returns a fully-typed `PredefinedPrompt` fixture |
| `createUserChatModel(overrides?)` | Returns a fully-typed `UserChatModel` fixture |
| `createLlmProvider(overrides?)` | Returns a fully-typed `LlmProvider` fixture |
| `createFork(overrides?)` | Returns a fully-typed `Fork` fixture |
| `MockStoreHook<T>` | Type alias: `jest.Mock<T>` — for plain Zustand hook mocks |
| `MockStoreHookWithGetState<THook, TState>` | Mock type for hooks that export `.getState()` |

### Store mocking patterns

**With static `.getState()` (e.g., stores accessed by other stores outside React):**

```ts
jest.mock('../store/ChatStore', () => ({
  useChatStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

const mockChat = useChatStore as unknown as MockStoreHookWithGetState<ChatSlice, ChatState>;
```

**Plain hook (no `.getState()` needed):**

```ts
jest.mock('../store/AuthStore', () => ({
  useAuthStore: jest.fn(),
}));

const mockAuth = useAuthStore as unknown as jest.Mock<AuthSelectorState>;
```

**Isolating store state per test (fresh Zustand instances):**

```ts
jest.isolateModules(() => {
  const { useTopicStore } = require('../store/TopicStore');
  const store = useTopicStore.getState();
  store.addTopic(createTopic());
});
```

### Component test template

```tsx
import { renderWithTheme } from '../testUtils';
import { screen } from '@testing-library/react';

jest.mock('../store/SomeStore', () => ({
  useSomeStore: jest.fn(),
}));

it('renders the component', () => {
  renderWithTheme(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

## Improvement Backlog

### [ISSUE-3] Fix scrollbar theming to respect app theme toggle
**File:** `src/index.css` — hardcodes dark scrollbar colors, only uses `prefers-color-scheme: light`. Doesn't respond to the app's own dark/light mode toggle. Move scrollbar styles into MUI theme or CSS-in-JS that reads the store.

### [ISSUE-4] Add missing test coverage — DebateView.tsx (15%)
**File:** `src/components/DebateView.tsx` — core dual-model debate UI, essentially untested.

### [ISSUE-5] Add missing test coverage — backupService.ts (57%)
**File:** `src/services/backupService.ts` — critical data export/import/auto-backup, poorly tested.

### [ISSUE-6] Add missing test coverage — ChatStore.ts (52%)
**File:** `src/store/ChatStore.ts` — largest store (1432 lines), core of the app.

### [ISSUE-7] Add missing test coverage — ProviderStore.ts (64%)
**File:** `src/store/ProviderStore.ts` — seed + migration logic largely untested.

### [ISSUE-8] Add missing test coverage — MessageBubble.tsx (59%)
**File:** `src/components/MessageBubble.tsx` — complex component with version switching, pinning, summarization, deletion, reasoning toggle.

### [ISSUE-9] Add missing test coverage — Settings.tsx (75%)
**File:** `src/pages/Settings.tsx` — large component (1116 lines), missing coverage on error states, import/restore flows, model download, balance fetchers.

### [ISSUE-10] Surface API key storage limitations in the UI
**Files:** `src/utils/security.ts`, `src/pages/Settings.tsx` — add notice explaining keys are obfuscated (not encrypted) in localStorage.
