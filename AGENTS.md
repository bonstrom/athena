# Athena — Agent Guide

**What:** Browser-based LLM chat client (React 19, CRA 5, TypeScript 4.9.5, Zustand 5, MUI 7, Dexie 4/IndexedDB).

**Homepage:** https://bonstrom.github.io/athena

## Quickstart

```bash
npm install
npm start          # Dev server on :3000 (also runs prebuild for build-version.txt)
```

No env vars required — API keys are configured through the Settings UI and stored obfuscated in localStorage.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Dev server on :3000 (auto-runs `prebuild` first via `prestart`) |
| `npm test` | Jest watch mode (via `react-scripts test`) |
| `npm run test:coverage` | Full coverage (v8, `--watchAll=false`) |
| `npm run build` | Production build |
| `npm run lint` | ESLint all `.js/.jsx/.ts/.tsx` |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run pretty` | Prettier all `.ts/.tsx` |
| `npm run deploy` | GH Pages deploy (runs `predeploy` first) |
| `npm run predeploy` | `CI=true test --watchAll=false && build` |
| `npm run prebuild` | Writes build timestamp to `public/build-version.txt` |

> **Important:** Always use `npm test` or `npm run test:coverage` — never `npx jest` directly. This project uses CRA, which configures Jest (Babel/TypeScript transforms, jsdom, etc.) internally through `react-scripts test`. Running `npx jest` bypasses this config and will fail with parse errors on TypeScript syntax.
>
> **Running a single test file:** `npm test -- --testPathPattern="ComponentName" --watchAll=false` (matches file path by regex).

Run `lint` and `test:coverage` before committing. **After any TypeScript type or interface change, verify the project compiles with `npm run build`.** Type errors that don't affect tests (e.g., internal interfaces used only at build time) will break `npm start`/`build` but pass lint and tests silently.

## Code Quality (enforced by ESLint)

Config: `.eslintrc.cjs` (ESLint 8, `@typescript-eslint/parser`, type-checked rules via `project: ['./tsconfig.json']`).

- **No `any` or `as any`** — `@typescript-eslint/no-explicit-any` is `warn`, `@typescript-eslint/strict` is on.
- `explicit-function-return-type` required (set to `warn`).
- `unused-imports/no-unused-imports` is `error`.
- Prettier config: `.prettierrc` — `singleQuote`, `printWidth: 120`, `bracketSameLine`, `singleAttributePerLine`.
- `JSON.parse` result must be `unknown`, then narrowed with type guards — never `as any`.
- `.github/copilot-instructions.md` has detailed patterns for type-safe test mocks.
- Test files get relaxed linting: empty `src/.eslintrc` file overrides the root config (allows `require()` for `jest.isolateModules`).

## Architecture

### Tech Stack

- **Single CRA package** (no monorepo). All source in `src/`.
- **Entrypoint:** `src/index.tsx` → `App.tsx` → `<HashRouter>` with routes `/`, `/settings`, `/chat/:topicId`.
- **UI framework:** MUI 7 with custom theme (`src/theme.tsx`). 5 color presets (Default Blue, Midnight Purple, Forest Green, Rose Pink, Golden Amber) each with light/dark palettes. Custom palette colors: `assistant` and `aiNote` (used for message bubble theming).
- **State:** 8 Zustand 5 stores. Cross-store access via `useXxxStore.getState()` — never use hooks outside React components.
- **Database:** Dexie/IndexedDB (`src/database/AthenaDb.ts`) with **5 tables** across **12 schema migrations** (v1–v12). All types (`Message`, `Topic`, `Fork`, etc.) are defined in this file.
- **Web Workers** for local ML (excluded from test coverage):
  - `src/services/llmWorker.ts` — Qwen via `@xenova/transformers`
  - `src/services/embeddingWorker.ts` — all-MiniLM-L6-v2 for semantic embeddings
  - Factory wrappers: `llmWorkerFactory.ts`, `embeddingWorkerFactory.ts`
- **Build versioning:** `npm run prestart` triggers `prebuild` which writes `public/build-version.txt`.

### Stores (`src/store/`)

| Store | Lines | Key Responsibilities |
|---|---|---|
| `ChatStore.ts` | 1555 | Messages, streaming, forks, summaries, RAG, tool loops, model selection, context management |
| `TopicStore.ts` | 793 | Topic CRUD, prompt selection, scratchpad, context window settings |
| `DebateStore.ts` | 629 | Dual-model debate orchestration (answer → review → consensus) |
| `ProviderStore.ts` | 385 | LLM provider/model CRUD, seeding, data migrations |
| `AuthStore.ts` | 368 | Auth state, preferences (TTS, backup interval, theme, preset, date format) |
| `UiStore.ts` | 55 | Drawer open/close, mobile state |
| `BackupStore.ts` | 29 | Backup import/export progress state |
| `NotificationStore.ts` | 28 | Global in-app notification queue |

### Database Schema & Migrations

5 tables: `topics`, `messages`, `predefinedPrompts`, `userSettings`, `analyticsSnapshots`.

12 schema versions — all migrations run in-band through Dexie's `version().stores().upgrade()`:

| Version | What changed |
|---|---|
| v1 | Initial: topics, messages, usages tables |
| v2 | Forks: `activeForkId` on topics, `forkId` on messages |
| v3 | Stub (never shipped — placeholder for clean upgrade path) |
| v4 | `maxContextMessages` on topics, `parentMessageId` on messages |
| v5 | Backfill `parentMessageId` from message ordering |
| v6 | `predefinedPrompts`, `userSettings` tables |
| v7 | `embedding` field on messages (no new index) |
| v8 | `mode` index on topics for debate mode |
| v9 | `modelId` on topics (per-chat model memory), backfill from last assistant message |
| v10 | `summaryTokens`, `summaryCost` on messages |
| v11 | `summaryReadCount` on messages, backfill existing summaries to 0 |
| v12 | `analyticsSnapshots` table for time-based analytics |

All migrations wrap logic in try/catch with `[migration-error]` `console.error` prefix. If a migration fails, the error is re-thrown to abort the upgrade.

### Key Data Model Fields

**Message** (interface in `AthenaDb.ts`):
- Core: `id`, `topicId`, `forkId`, `type` (user/assistant/system/aiNote), `content`, `model`, `created`
- Usage: `promptTokens`, `completionTokens`, `cachedTokens`, `cacheCreationTokens`, `totalCost`
- Features: `reasoning`, `toolLogs`, `parentMessageId`, `attachments[]`, `rawResponse`
- RAG: `embedding` (number[] | null)
- Summarization: `summary`, `summaryTokens`, `summaryCost`, `summaryReadCount`
- Debate: `debateSide` (left/right), `debatePhase` (answer/review/final/consensus)

**Topic** (interface in `AthenaDb.ts`):
- Core: `id`, `name`, `createdOn`, `updatedOn`, `isDeleted`
- Forks: `forks: Fork[]`, `activeForkId`
- Chat config: `modelId`, `maxContextMessages`, `selectedPromptIds[]`
- Debate: `mode` (topic/debate), `debateModelAId`, `debateModelBId`
- Scratchpad: `scratchpad` (long-term memory for LLM, max 8000 chars)

**AnalyticsSnapshot**: `date`, `messageCount`, `failedCount`, `promptTokens`, `completionTokens`, `cost`, `latencySamples[]`, `providerStats`, `toolStats`

### Key Dependencies & Their Purposes

| Package | Purpose |
|---|---|
| `@mui/material` + `@mui/icons-material` + `@mui/x-charts` | UI components, icons, analytics charts (LineChart, PieChart) |
| `@dnd-kit/*` (core, sortable, modifiers, utilities) | Drag-and-drop fork tab reordering |
| `zustand` 5 | State management |
| `dexie` 4 + `dexie-react-hooks` + `dexie-export-import` | IndexedDB ORM, React hooks, JSON export/import |
| `@xenova/transformers` + `@huggingface/transformers` | Local LLM inference + embedding generation |
| `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` | Markdown rendering with GFM tables + LaTeX math |
| `react-syntax-highlighter` | Code block syntax highlighting |
| `katex` | Math typesetting (used by remark-math/rehype-katex) |
| `mermaid` | Diagram rendering (flowcharts, sequence, etc.) |
| `dompurify` | XSS sanitization of HTML/MathML/SVG from LLM output |
| `fuse.js` | Fuzzy search for `<GlobalSearch>` component |
| `gpt-tokenizer` | Token counting for context window estimation |
| `axios` | HTTP client for LLM API calls |
| `@react-oauth/google` + `jwt-decode` | Google OAuth sign-in |
| `react-scroll-to-bottom` | Auto-scroll chat to latest message |
| `react-router-dom` 7 | Client-side routing (HashRouter) |

### Routing & Page Flow

HashRouter with 3 lazy-loaded routes, all wrapped in `<ErrorBoundary>` + `<ChatLayout>`:

```
/                  → Home.tsx (landing/onboarding)
/settings          → Settings.tsx (providers, models, preferences, analytics, backup, about)
/chat/:topicId     → ChatView.tsx (active conversation)
```

`ChatLayout` renders a persistent sidebar (`<Sidebar>` with `<TopicList>`, `<GlobalSearch>`) plus a responsive header bar showing the current topic name, selected model (with DeepSeek peak-hour indicator), and prompt chips.

### LLM Service (`src/services/llmService.ts` — 1517 lines)

Supports both OpenAI `/chat/completions` and Anthropic `/v1/messages` formats. Handles streaming via SSE, multi-step tool loops (up to 50 iterations), reasoning/thinking extraction, and error recovery.

**5 built-in providers** defined in `src/types/provider.ts`:

| Provider | Format | Supports |
|---|---|---|
| OpenAI | openai | Web search: no |
| DeepSeek | openai | Web search: no |
| Google | openai | Web search: no |
| Moonshot | openai | Web search: yes |
| MiniMax | anthropic | Web search: no |

**13 built-in models** including DeepSeek V4 Flash/Pro, GPT-5.4 Nano/Mini/standard, Gemini 3 Flash, Kimi K2.5/K2.6/K2.7 Code/K2 Turbo/K3/Kimi v1, MiniMax M2.7. Each model definition includes pricing (input/cachedInput/output per 1M tokens), context window size, and feature flags (streaming, vision, tools, thinking, files, temperature support, alternate-role enforcement).

Key LLM features:
- **Web search**: Moonshot provider — when enabled, results are injected as system messages
- **Reasoning/Thinking**: Extracted via `thinkingParseMode` — `api-native` (default, from API response fields), `tag-based` (strips `<think>...</think>`), or `none`
- **Vision**: Image attachments sent as `image_url` content parts
- **DeepSeek peak hours**: 2x pricing at 01:00–04:00 UTC and 06:00–10:00 UTC, shown with a flame icon in the chat header
- **Per-chat model memory**: `topic.modelId` stores the last model used for each topic
- **Context window**: Managed via token estimation (`gpt-tokenizer`), RAG-aware message selection, and `maxContextMessages` per-topic limit
- **Tool calling**: Models with `supportsTools: true` can invoke `read_messages`, `list_messages`, `ask_user`, `manage_scratchpad`, and web search tools

### Tool Definitions (built-in)

Tools are defined in `ChatStore.ts` and passed to the LLM API:

| Tool | Purpose |
|---|---|
| `read_messages` | Read full content of specific historical messages |
| `list_messages` | Search/filter past messages (by content, date, model) |
| `ask_user` | Ask the user a clarifying question (preferred over embedding questions in reply text) |
| `manage_scratchpad` | Read/write to the topic's private scratchpad for long-term memory |

### Content Rendering (`src/components/MarkdownWithCode.tsx`)

Renders LLM output with:
- Standard Markdown (GFM tables via `remark-gfm`)
- LaTeX/KaTeX math — `$...$` inline, `$$...$$` block (via `remark-math` + `rehype-katex`)
- Syntax-highlighted code blocks (via `react-syntax-highlighter`)
- SVG code blocks — inline-rendered with DOMPurify sanitization
- Mermaid diagrams — rendered client-side

### Forks

Conversation branches stored as `Fork[]` on each topic (`topic.forks`). Each message belongs to exactly one fork via `forkId`. The active fork is tracked as `topic.activeForkId`. Forks can be reordered via `@dnd-kit` drag-and-drop in the `<ForkTabs>` component.

### Debate Mode

When `topic.mode === 'debate'`, two models engage in a structured debate:
1. **Answer phase**: Both models respond independently to the prompt
2. **Review phase**: Each model reviews and critiques the other's answer
3. **Final phase**: Consensus synthesis

Orchestrated by `DebateStore.ts` through `<DebateComposer>` and `<DebateView>`.

### RAG / Semantic Search (`src/services/embeddingService.ts`, `embeddingWorker.ts`)

Messages can have semantic embeddings (`message.embedding: number[] | null` generated via `all-MiniLM-L6-v2`). Used for retrieval-augmented generation when building LLM context. Constants in `src/constants.ts`:

| Constant | Value | Purpose |
|---|---|---|
| `RAG_TOP_K` | 5 | Number of similar messages to retrieve |
| `RAG_MIN_SCORE` | 0.3 | Minimum cosine similarity threshold |
| `RAG_MAX_CHARS` | 4000 | Total RAG block size injected into context |
| `RAG_CONTENT_LIMIT` | 800 | Truncated per-message preview length |

Run via `useEmbeddingBackfill()` hook on app startup, processes messages that lack embeddings.

### Message Summarization

Long assistant messages can be summarized. Metadata stored on the message:
- `summary` — the summary text
- `summaryTokens` / `summaryCost` — usage tracking
- `summaryReadCount` — how many times the summary was viewed before the full message was expanded

### Analytics (`src/services/analyticsService.ts`, `analyticsRollupService.ts`)

Time-based usage tracking via daily `AnalyticsSnapshot` records. The rollup service consolidates stats on browser idle via `requestIdleCallback`. Displayed in the `<Analytics>` component under Settings → Analysis tab with: message counts, token usage, costs, latency distributions, model breakdowns, and tool usage stats. Uses `@mui/x-charts` (LineChart, PieChart) for visualization.

### TTS / Media

- `src/services/mediaService.ts` — browser `SpeechSynthesis` for text-to-speech
- `src/types/speech-recognition.d.ts` — TypeScript declarations for the Web Speech API
- Camera/image capture support for vision models

### Security

- **API keys**: Obfuscated (Caesar cipher + base64), **NOT encrypted**. Stored in localStorage. Decode/encode via `SecurityUtils` in `src/utils/security.ts`. The `encodeApiKey()`/`getApiKey()` helpers in `types/provider.ts` wrap this.
- **XSS prevention**: DOMPurify sanitizes all SVG, HTML, and MathML output from LLMs before rendering.
- **Auth**: Google OAuth via `@react-oauth/google`, JWT decoded with `jwt-decode`.

## Testing

- Jest via `react-scripts test` (CRA defaults). All Jest config in `package.json` `jest` key. No separate `jest.config.*` file.
- **Manual mocks** in `src/__mocks__/`:
  - ESM packages: `react-markdown.js`, `remark-gfm.js`, `remark-math.js`, `rehype-katex.js`, `react-syntax-highlighter.js`, `react-syntax-highlighter-dist.js`
  - UI libraries: `@mui/x-charts.tsx`, `@dnd-kit/core.js`, `@dnd-kit/modifiers.js`, `@dnd-kit/sortable.js`, `@dnd-kit/utilities.js`
  - Other: `mermaid.js`
- **Jest moduleNameMapper** maps `gpt-tokenizer` → CJS, `react-router-dom` → dist, `dompurify` → purify.cjs, and all manual mocks.
- **Setup:** `src/setupTests.ts` polyfills `TextEncoder`, `TextDecoder`, `ReadableStream`, `crypto.randomUUID()` (deterministic UUIDs), `Element.scrollIntoView()`. Suppresses known console noise (act() warnings, MUI disabled-button warnings, expected error messages like "Failed to load messages").
- **Coverage ignores:** `src/index.tsx`, `src/services/llmWorkerFactory.ts`, `src/services/embeddingWorkerFactory.ts`, `src/reportWebVitals.ts`, `src/testUtils/storeMocks.ts`.
- **Patterns:** `jest.mock()` at module scope, `jest.isolateModules()` for fresh store state, `jest.mocked()` for typed mocks.
- Mock return types must be **explicit** (e.g., `(): number[] => ...`). No implicit `new Array(n).fill(...)`.
- `crypto.randomUUID()` used for all ID generation (polyfilled in tests via `setupTests.ts`).

## Test Authoring Quickstart

### Test utilities (`src/testUtils/`)

| Export | Purpose |
|---|---|
| `renderWithTheme(ui)` | `@testing-library/react` `render` wrapped in MUI `<ThemeProvider>` |
| `createMessage(overrides?)` | Returns a fully-typed `Message` fixture (defaults: user, no tokens, no cost) |
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

### Common Test Pitfalls

- **No CRACO** — Jest is configured entirely through `package.json` `jest` key. No `craco.config.js` or `jest.config.js`.
- **Dexie runs in tests** — mock `athenaDb` or use `jest.isolateModules()` for stores that depend on it at import time.
- **`jest.isolateModules` requires `require()`** — `import` statements don't work inside `jest.isolateModules()`. The empty `src/.eslintrc` allows `require()` in test files.
- **`gpt-tokenizer`** is CJS-only — Jest maps it to the CJS build via `moduleNameMapper`.
- **Workers** — always mock worker factories; they're excluded from coverage but imports still fail in jsdom.
- **`@mui/x-charts`** — mock via `src/__mocks__/@mui/x-charts.tsx` which returns stub `div` elements for LineChart, PieChart.

## Improvement Backlog

### [ISSUE-3] Fix scrollbar theming to respect app theme toggle
**File:** `src/index.css` — hardcodes dark scrollbar colors, only uses `prefers-color-scheme: light`. Doesn't respond to the app's own dark/light mode toggle. Move scrollbar styles into MUI theme or CSS-in-JS that reads the store.

### [ISSUE-4] Add missing test coverage — DebateView.tsx
**File:** `src/components/DebateView.tsx` (297 lines) — core dual-model debate UI. Test file exists (`DebateView.test.tsx`) but coverage likely still low.

### [ISSUE-5] Add missing test coverage — backupService.ts
**File:** `src/services/backupService.ts` (304 lines) — critical data export/import/auto-backup. Test file exists but coverage gaps remain.

### [ISSUE-6] Add missing test coverage — ChatStore.ts
**File:** `src/store/ChatStore.ts` (1555 lines) — largest store, core of the app. Test file exists but many branches (streaming, tool loops, RAG, fork switching, summaries, embedding backfill) need coverage.

### [ISSUE-7] Add missing test coverage — ProviderStore.ts
**File:** `src/store/ProviderStore.ts` (385 lines) — seed + migration logic. Test file exists but migration edge cases likely untested.

### [ISSUE-8] Add missing test coverage — MessageBubble.tsx
**File:** `src/components/MessageBubble.tsx` (892 lines) — complex component with version switching, pinning, summarization, deletion, reasoning toggle, debate metadata display.

### [ISSUE-9] Add missing test coverage — Settings.tsx
**File:** `src/pages/Settings.tsx` (1215 lines) — large component, missing coverage on error states, import/restore flows, model download, balance fetchers.

### [ISSUE-10] Surface API key storage limitations in the UI
**Files:** `src/utils/security.ts`, `src/pages/Settings.tsx` — add notice explaining keys are obfuscated (Caesar+base64, not encrypted) in localStorage.

### [ISSUE-11] Fix failing analytics tests
**Files:** `src/services/__tests__/analyticsService.test.ts`, `src/components/__tests__/Analytics.test.tsx` — 14 tests failing across 3 test suites. `<Analytics>` shows "Failed to load analytics" error in tests, likely due to IndexedDB/Dexie mock issues or `@mui/x-charts` compatibility problems.
