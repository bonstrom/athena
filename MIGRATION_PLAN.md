# Test Utility Migration Plan

**Goal:** Replace all locally-defined fixture/helper functions in test files with imports from `src/testUtils/`. Currently **0 of 53** test files import from `src/testUtils/`.

**Shared utilities available at `src/testUtils/`:**
- `createMessage(overrides?)` — `Message` fixture (defaults: `type: 'user'`, `content: 'Hello'`)
- `createTopic(overrides?)` — `Topic` fixture
- `createPredefinedPrompt(overrides?)` — `PredefinedPrompt` fixture
- `createUserChatModel(overrides?)` — `UserChatModel` fixture
- `createLlmProvider(overrides?)` — `LlmProvider` fixture
- `createFork(overrides?)` — `Fork` fixture
- `renderWithTheme(ui)` — MUI-wrapped `@testing-library/react` `render`
- `MockStoreHook<T>` — type alias for plain Zustand hook mocks
- `MockStoreHookWithGetState<THook, TState>` — type for hooks that export `.getState()`

**Order:** Proceed file by file in the listed order. After completing a file, run `npx eslint --fix <file>` and `npm test -- --watchAll=false` to validate that file's tests still pass. Then move on to the next file.

---

## Batch 1: Simple files with few calls and no tricky defaults (import path `../testUtils`)

### File 1: `src/components/MessageBubbleTyping.test.tsx`
**Import path:** `../testUtils`

- **Remove** local function `createModel` (lines 13–35).
- **Remove** the manual `ThemeProvider` wrapper in the `render` call (lines 39–43). Replace `render(<ThemeProvider theme={theme}><MessageBubbleTyping model={createModel()} /></ThemeProvider>)` with `renderWithTheme(<MessageBubbleTyping model={createUserChatModel()} />)`.
- **Remove** `ThemeProvider` and `theme` imports if no longer referenced.
- **Add** `import { createUserChatModel, renderWithTheme } from '../testUtils';` (also remove `render` from `@testing-library/react` if no longer used).

---

### File 2: `src/components/TopicListItem.test.tsx`
**Import path:** `../testUtils`

- **Remove** local function `createTopic` (lines 51–63).
- **Add** `import { createTopic } from '../testUtils';`.
- **Replace** all 3 calls. The local `createTopic()` has extra fields `forks`. Replace:
  - `createTopic()` → `createTopic({ forks: [{ id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' }, { id: 'fork-2', name: 'Fork 2', createdOn: '2026-01-02T00:00:00.000Z' }] })`
  - Actually, check each call site — all 3 calls are `createTopic()` with no args, so all need the forks override.

- **Remove** the `Topic` type import from `AthenaDb` if no longer needed.

---

### File 3: `src/components/MessageList.test.tsx`
**Import path:** `../testUtils`

- **Remove** local function `buildMessage` (lines 52–68).
- **Add** `import { createMessage } from '../testUtils';`.
- **Replace** calls — `buildMessage` has signature `(id, type, content, created, extra?)`. Each call must become `createMessage({ id, type, content, created, ...extra })`. Examples:
  - `buildMessage('msg-1', 'user', 'Hello', '2026-01-01T00:00:00.000Z')` → `createMessage({ id: 'msg-1', type: 'user', content: 'Hello', created: '2026-01-01T00:00:00.000Z', includeInContext: true })`
  - `buildMessage('msg-1', 'user', 'Hello', '2026-01-01T00:00:00.000Z', { totalCost: 100 })` → `createMessage({ id: 'msg-1', type: 'user', content: 'Hello', created: '2026-01-01T00:00:00.000Z', includeInContext: true, totalCost: 100 })`
- **Note:** Local `buildMessage` defaults `includeInContext: true` — shared defaults `false`. Must pass `includeInContext: true` in ALL replaced calls.

---

### File 4: `src/components/ForkTabs.test.tsx`
**Import path:** `../testUtils`

- **Remove** local function `makeTopic` (lines 51–60).
- **Add** `import { createTopic } from '../testUtils';`.
- **Replace** both calls. Local adds `activeForkId` and `forks`:
  - `makeTopic()` → `createTopic({ activeForkId: 'main', forks: [{ id: 'main', name: 'Main', createdOn: '2026-01-01T00:00:00.000Z' }, { id: 'branch-2', name: 'Branch 2', createdOn: '2026-01-02T00:00:00.000Z' }] })`
- Remove `Topic` import if no longer needed.

---

### File 5: `src/services/embeddingService.test.ts`
**Import path:** `../testUtils`

- **Remove** local function `createMessage` (lines 21–37).
- **Add** `import { createMessage } from '../testUtils';`.
- **Replace** 3 calls. Local defaults `includeInContext: true` — shared defaults `false`. Check each call to see if `includeInContext` is overridden or relied upon. If any call relies on `true`, add `includeInContext: true` to the override object.

---

### File 6: `src/services/__tests__/llmService.test.ts`
**Import path:** `../../testUtils`

- **Remove** local function `makeModel` (lines 28–50).
- **Add** `import { createUserChatModel } from '../../testUtils';`.
- **Replace** all 6 calls:
  - `makeModel(true)` → `createUserChatModel({ enforceAlternatingRoles: true })`
  - `makeModel(false)` → `createUserChatModel({ enforceAlternatingRoles: false })`

---

### File 7: `src/services/__tests__/embeddingService.test.ts`
**Import path:** `../../testUtils`

- **Remove** local function `makeMessage` (lines 41–57).
- **Add** `import { createMessage } from '../../testUtils';`.
- **Replace** 4 calls:
  - `makeMessage('msg-1', 'hello', [0.1, 0.2])` → `createMessage({ id: 'msg-1', content: 'hello', embedding: [0.1, 0.2] })`
  - `makeMessage('msg-1', 'hello')` → `createMessage({ id: 'msg-1', content: 'hello' })`
  - `makeMessage('msg-1', 'hello', null)` → `createMessage({ id: 'msg-1', content: 'hello', embedding: null })`

---

### File 8: `src/utils/__tests__/groupTopicsByDate.test.ts`
**Import path:** `../../testUtils`

- **Remove** local function `makeTopic` (lines 16–25).
- **Add** `import { createTopic } from '../../testUtils';`.
- **Replace** all 14 calls:
  - `makeTopic({ updatedOn: '...', createdOn: '...' })` → `createTopic({ updatedOn: '...', createdOn: '...' })`
  - The local version creates a `const NOW = new Date()` and uses it as default for `createdOn`/`updatedOn`. Shared uses a fixed date string. Check if any test relies on `NOW` being the current time — if so, the caller must pass `new Date().toISOString()` explicitly.

---

## Batch 2: Medium complexity (more calls, local defaults that differ)

### File 9: `src/components/ProviderCard.test.tsx`
**Import path:** `../testUtils`

- **Remove** local functions `createProvider` (lines 33–46) and `createModel` (lines 48–74).
- **Add** `import { createLlmProvider, createUserChatModel } from '../testUtils';`.
- **Replace**:
  - `createProvider(...)` → `createLlmProvider(...)` (the two functions have identical shape and defaults, no changes needed)
  - `createModel(...)` → `createUserChatModel(...)` — local `createModel` has extra fields `thinkingParseMode: 'api-native'`, `thinkingOpenTag: '<think>'`, `thinkingCloseTag: '</think>'` as defaults. **Check each call site** to see if those defaults are relied upon. If a call doesn't override them, pass them explicitly.
- Also remove unused `LlmProvider, UserChatModel` type imports from `'../types/provider'` if no longer needed.

---

### File 10: `src/components/ModelSelector.test.tsx`
**Import path:** `../testUtils`

- **Remove** local function `buildModel` (lines 27–50).
- **Add** `import { createUserChatModel } from '../testUtils';`.
- **Replace** all 14 calls: `buildModel({...})` → `createUserChatModel({...})` — same shape, same signature, just rename.

---

### File 11: `src/components/Composer.test.tsx`
**Import path:** `../testUtils`

- **Remove** local functions: `buildModel` (lines 124–147), `buildProvider` (lines 149–162), `createTopic` (lines 164–174).
- **Add** `import { createTopic, createLlmProvider, createUserChatModel } from '../testUtils';`.
- **Replace**:
  - `buildModel({...})` → `createUserChatModel({...})` — but local defaults differ (e.g., `id: 'builtin-kimi-k2-turbo'`, `isBuiltIn: true`). The one call at line 304 passes no overrides: `buildModel()`. For that call, pass the local defaults: `createUserChatModel({ id: 'builtin-kimi-k2-turbo', label: 'Kimi K2 Turbo Preview', apiModelId: 'kimi-k2-turbo-preview', providerId: 'builtin-moonshot', input: 1.15, cachedInput: 0.12, output: 4.5, supportsVision: true, supportsFiles: true, isBuiltIn: true })` (or check what the test actually needs).
  - `buildProvider({...})` → `createLlmProvider({...})` — similar, check the 1 call site.
  - `createTopic({ selectedPromptIds: [...] })` → `createTopic({ selectedPromptIds: [...] })` — rename only.
- Remove unused `UserChatModel, LlmProvider, Topic` type imports if no longer referenced.

---

### File 12: `src/components/MessageBubble.test.tsx` ⚠️ TRICKY
**Import path:** `../testUtils`

- **Remove** local functions `createMessage` (lines 92–109) and `renderWithTheme` (lines 111–113).
- **Remove** the `render` and `ThemeProvider` imports (lines 2–4) if no longer used.
- **Add** `import { createMessage, renderWithTheme } from '../testUtils';`.
- **CRITICAL DIFFERENCES in local `createMessage` defaults vs shared:**
  - `type: 'assistant'` → shared is `'user'`
  - `content: 'Hello from assistant'` → shared is `'Hello'`
  - `model: 'model-1'` → shared has no `model` default
  - `promptTokens: 10` → shared is `0`
  - `completionTokens: 20` → shared is `0`
  - `totalCost: 0.123` → shared is `0`

- **For EACH of the 13 `createMessage()` calls**, determine if the test relies on the local defaults:
  - Calls with NO overrides (e.g., `createMessage()`): Need to explicitly pass the local defaults if tests depend on them. Check what the test asserts.
  - Calls WITH overrides (e.g., `createMessage({ includeInContext: false })`): Only the un-overridden fields matter.

- **Strategy:** Read each call site and its surrounding assertions. If assertions check for `type: 'assistant'` rendering (e.g., model name display, different bubble styling), you MUST add `type: 'assistant'` to the overrides. If assertions are generic (just checking rendering doesn't crash), the default change may not matter.

- **Replace** all `renderWithTheme(...)` calls — same function, same behavior.

---

### File 13: `src/store/__tests__/DebateStore.test.ts`
**Import path:** `../../testUtils`

- **Remove** local function `makeMessage` (lines 107–123).
- **Add** `import { createMessage } from '../../testUtils';`.
- **Replace** 20 calls. Local version has `type: 'assistant'` default. Most calls pass `type` as an override already (check each). Calls without explicit `type` need `type: 'assistant'` added.
- Also local has `promptTokens: 10, completionTokens: 5, totalCost: 0.5` as defaults. Check if any assertion depends on these values.

---

### File 14: `src/store/__tests__/TopicStore.test.ts` ⚠️ LARGEST
**Import path:** `../../testUtils`

- **Remove** local functions `makeTopic` (lines 139–149) and `makeMessage` (lines 151–163).
- **Add** `import { createTopic, createMessage } from '../../testUtils';`.

- **`makeTopic` replacements (~32 calls):**
  - Signature: `makeTopic(overrides: Partial<Topic> = {})` → compatible with `createTopic(overrides?)`.
  - Local defaults `activeForkId: 'main'` — shared has no `activeForkId` default. **Check each call**: if the test needs `activeForkId: 'main'`, add it explicitly.
  - Some calls pass specific `id` values — those should still work via overrides.

- **`makeMessage` replacements (~58 calls):**
  - ⚠️ **Different signature!** Local: `makeMessage(overrides: Partial<Message> & { id: string; type: Message['type']; content: string; created: string })` — requires `id`, `type`, `content`, `created` in the overrides.
  - Shared: `createMessage(overrides?: Partial<Message>)` — all fields optional.
  - **This means every call to `makeMessage` already passes `id`, `type`, `content`, `created`** (they're required in the overrides type). So simply renaming `makeMessage({...})` to `createMessage({...})` should work for all calls.
  - **BUT** verify: the type constraint on `makeMessage` makes those fields required in the object — but does the actual call pass them as properties of the override object or as separate args? Check a few call sites. If it's `makeMessage({ id: 'x', type: 'user', content: 'hi', created: '2024' })`, then `createMessage({ id: 'x', type: 'user', content: 'hi', created: '2024' })` works identically.
  - Also check if any assertion depends on `includeInContext: false` (local default matches shared default).

- **Validate** by running: `npm test -- --watchAll=false src/store/__tests__/TopicStore.test.ts`

---

## Batch 3: Post-migration checks

After all files are migrated:

```bash
# Verify no remaining local duplicates
rg "function create(Topic|Message|Model|Provider|Fork|LlmProvider|UserChatModel|PredefinedPrompt)\b" src/ --include='*.test.*'
rg "function (build|make)(Model|Provider|Topic|Message)\b" src/ --include='*.test.*'

# Run full test suite
npm test -- --watchAll=false

# Run lint
npm run lint
```

---

## Additional migrations (lower priority, not in the 14 files above)

These files don't define local helper functions but manually construct domain objects inline. They could be updated to use the shared fixtures for consistency, but this is optional:

- `src/store/__tests__/ChatStore.test.ts` — defines `testModel` and `testProvider` as constants (lines 4–36). Could use `createLlmProvider`/`createUserChatModel` instead.
- `src/components/ModelsSettings.test.tsx` — constructs inline `UserChatModel` objects (around lines 85–108).
- `src/components/ProvidersSettings.test.tsx` — constructs inline `LlmProvider` objects (around lines 95–108).
- `src/types/__tests__/provider.test.ts` — constructs inline `LlmProvider` objects.
- `src/components/TopicList.test.tsx` — defines `createTopics()` returning `TopicLike[]` (not `Topic[]`). Different type shape so harder to convert.
- `src/pages/Home.test.tsx` — uses `createTopic` as mock method name, not a fixture factory.

---

## Quick validation command

After any file migration, run this to confirm nothing broke:

```bash
npx eslint --fix <file> && npm test -- --watchAll=false --testPathPattern="<basename>"
```

Example: `npx eslint --fix src/components/MessageBubbleTyping.test.tsx && npm test -- --watchAll=false --testPathPattern="MessageBubbleTyping"`
