# Athena Codebase Improvement Report

Generated 2026-05-05. Supplement to the backlog in `AGENTS.md`.

---

## 1. Stale Dependencies (easy wins)

| Package | Issue |
|---|---|
| `@react-oauth/google` | **Unused** — not imported anywhere in the codebase |
| `jwt-decode` | **Unused** — not imported anywhere |

Also redundant: both `@huggingface/transformers` (~v4) and `@xenova/transformers` (~v2) are listed. If Xenova is the fork actually in use (it's what `llmWorker.ts` and `embeddingWorker.ts` reference), the HuggingFace package may be dead weight.

---

## 2. API Key Storage is Not Encrypted (ISSUE-10, HIGH)

`src/utils/security.ts` uses Caesar cipher (+1 shift) + base64. The comment says *"prevents keys from being stored in plaintext"*, which is misleading — anyone who reads the source or inspects localStorage can trivially reverse it. The `encode` method also has a silent fallback: if `btoa` throws, it returns the **raw plaintext key**. This warrants a UI notice warning users.

**Fix suggestions:**
- Add a warning in Settings > Providers explaining keys are obfuscated, not encrypted
- Remove the silent plaintext fallback — throw or return empty string instead

---

## 3. Oversized Files Violating Single Responsibility

| File | Lines | Problem |
|---|---|---|
| `src/components/Composer.tsx` | 1,723 | Giant monolithic component — should be split into sub-components (tool panel, attachment area, model config popover, etc.) |
| `src/store/ChatStore.ts` | 1,463 | Two distinct concerns: message CRUD + LLM streaming orchestration. The streaming logic (~600 lines) should be extracted into a dedicated service or middleware. |
| `src/services/llmService.ts` | 1,461 | Mixes API transport, tool definitions, provider-specific payload builders, cost calculation, and streaming. Could be split into `llmApi.ts`, `llmTools.ts`, and `llmPayload.ts`. |
| `src/pages/Settings.tsx` | 1,161 | Monolithic settings page; would benefit from extracting tab panels into their own component files. |

---

## 4. Test Coverage Gaps (beyond AGENTS.md backlog)

Beyond the 8 issues already tracked in AGENTS.md:

- **`stripMarkdown.ts` at 2.8%** — essentially untested utility. This is a simple pure function, so tests are trivial to write.
- **Functions coverage at 62.29%** — significantly lower than lines/statements (79.22%). This means many exported functions have zero test coverage while the test files cover only the "happy path" branches.
- **`backupService.ts` at 56.9%** — auto-backup scheduling (`scheduleAutoBackup`, `stopAutoBackup`) has zero test coverage. These are the most error-prone parts of the service.
- **`llmService.ts` at 68.3%** — the unmocked portion (460 uncovered lines) likely includes provider-specific payload builders, retry logic, and error handling paths that never get exercised.

---

## 5. TypeScript Configuration

- **`target: "es2018"`** — unnecessarily conservative. All modern browsers support at least ES2020. Bumping to `es2020` or `es2021` would allow native optional chaining/nullish coalescing without transpilation.
- **`moduleResolution: "node"`** — deprecated in TypeScript 5.x in favor of `"bundler"`. Adopting it would allow `exports` map resolution and better tree-shaking.
- **`@types/react` 19.x with TypeScript 4.9.5** — React 19 types may reference TS 5.x features. Some type checks may silently fail or produce wrong types. Consider upgrading TypeScript to 5.x.
- **No `noUncheckedIndexedAccess`** — recommended for robustness (every array index/record key access returns `T | undefined`).
- **No `noUnusedLocals` in tsconfig** — relies solely on ESLint's `unused-imports` plugin, which only catches imports (not unused local variables).

---

## 6. Scrollbar Theming Bug (ISSUE-3)

`src/index.css` hardcodes dark scrollbar colors and only uses `@media (prefers-color-scheme: light)` to switch — it doesn't respond to the app's own theme toggle. Users who prefer OS dark mode but toggle the app to light theme get dark scrollbars (or vice versa).

**Fix:** Move scrollbar styles into MUI theme or CSS-in-JS that reads the store.

---

## 7. Architectural Observations

### 7.1 Services coupled to Zustand stores

`llmService.ts` imports `useChatStore`, `useAuthStore`, `useProviderStore` — services should not depend on store hooks. This makes testing hard (requires full store mocking) and couples the service layer to React.

**Fix:** Pass state as parameters to service functions, or inject store state via a configuration object on init.

### 7.2 No lazy loading

All components are eagerly imported. The `Settings` page (1,161 lines + ProviderCard 772 lines) could be `React.lazy()` loaded since it's not the default view.

### 7.3 Two IndexedDB wrappers

Both `dexie` and `idb-keyval` are used. `idb-keyval` is only used in `backupService.ts` for storing backup metadata (last backup time, mode). This could be folded into the Dexie schema (`userSettings` table already exists).

### 7.4 No component-level error boundaries

`ErrorBoundary.tsx` exists but appears to only wrap the root. Long-running operations like LLM streaming lack granular error boundaries around message bubbles, the composer, etc.

### 7.5 Suspicious type assertion

`src/store/ChatStore.ts:137`: `selectedModel: undefined as unknown as ChatModel` — this is a type assertion that lies about the initial value. `selectedModel` is actually `undefined` until `initDefaults()` runs. Better to use `null` and handle absence, or initialize from `getDefaultModel()` in the store creation itself.

### 7.6 `@testing-library/dom` in runtime deps

`@testing-library/dom` is in `dependencies` rather than `devDependencies`. Same for `@testing-library/jest-dom`, `@testing-library/react`, and `@testing-library/user-event`.

---

## 8. Summary of Priorities

| Priority | Item | Effort | Impact |
|---|---|---|---|
| P0 | API key security notice in UI (ISSUE-10) | Low | User trust |
| P0 | Fix security.ts silent plaintext fallback | Low | Security |
| P1 | Add tests for stripMarkdown.ts (2.8% cov) | Low | Quality |
| P1 | Add tests for DebateView.tsx (15.5% cov) | Medium | Quality |
| P1 | Remove unused deps (@react-oauth/google, jwt-decode) | Low | Bundle size |
| P2 | Fix scrollbar theming (ISSUE-3) | Low | UX |
| P2 | Decouple services from Zustand stores | High | Testability |
| P2 | Split oversized files (Composer, ChatStore, llmService) | High | Maintainability |
| P3 | Upgrade TypeScript to 5.x + bump ES target | Medium | DX + bundle size |
| P3 | Add lazy loading for Settings page | Low | Performance |
| P3 | Consolidate to single IndexedDB wrapper | Low | Consistency |
| P3 | Move testing deps to devDependencies | Low | Bundle size |

---

## 9. Per-File Low-Coverage Roster

Files below 70% that aren't already in the AGENTS.md backlog:

| File | Coverage | Notes |
|---|---|---|
| `stripMarkdown.ts` | 2.8% | 1 test covers 1 line. Simple pure function — tests are trivial. |
| `ChatStore.ts` | 53.0% | Already ISSUE-6 |
| `backupService.ts` | 56.9% | Already ISSUE-5 |
| `MessageBubble.tsx` | 61.7% | Already ISSUE-8 |
| `ProviderStore.ts` | 63.7% | Already ISSUE-7 |
| `llmService.ts` | 68.3% | Not in backlog — provider-specific payload builders and error paths untested |
| `Settings.tsx` | 73.8% | Already ISSUE-9 |
| `Composer.tsx` | 76.7% | Not in backlog — missing coverage on tool execution, media toggles, speech input |
