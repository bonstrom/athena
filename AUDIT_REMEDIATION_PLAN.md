# Athena Audit Remediation Plan

Remediation of the findings from the Athena Audit Report. The plan follows the report's
recommended order. Data-repair decisions locked in: **runtime rebuild guarded by a
`userSettings` flag** (no schema migration), and **all fixes (items 1–6) implemented with
targeted tests**. The CRA → Vite migration (item 7) is tracked separately and not bundled here.

## Verified root causes

| # | Finding | Evidence |
|---|---|---|
| 1 | Cost/cache double-counted | `ChatStore.ts:1199-1220` sets `totalCost`, `cachedTokens`, `cacheCreationTokens` on **both** `userPatch` and `assistantPatch`. `analyticsService.ts:137-139` and `analyticsRollupService.ts:188` sum every message → 2×. |
| 2 | Rollup not concurrency-safe | `rollupAnalytics()` (`analyticsRollupService.ts:152`) has no in-flight guard; marker lives in `localStorage` (`:28-35`) separate from Dexie writes (`:222-228`). |
| 3 | Tool-loop cache pricing uses final iteration only | `llmService.ts:1329-1331` accumulates prompt/completion tokens, but `ChatStore.ts:1149/1197-1198` price/record cache from `lastResult` only. |
| 4 | Restore proceeds without safety backup | `backupService.ts:83-88` swallows `exportDB` failure and continues into `importInto`. `autoBackupInProgress` (`:33`) only guards auto-backup. |
| 5a | Fork deletion not atomic | `TopicStore.ts:651-666` updates topic, then separately deletes messages (two commits). |
| 5b | Migration failures lack recovery UX | `AthenaDb.ts` migrations rethrow; `ErrorBoundary.tsx` only catches render errors, not async DB open failures. |
| 6 | Blank Suspense | `App.tsx:30` `<Suspense>` has no `fallback`. |

Debate (`DebateStore.ts:156-171`) is **not** affected by #1 — it already writes cost on a single
assistant message per side.

## Ownership model (item 1)

- **user message** owns `promptTokens` (the request input tokens).
- **assistant message** owns `completionTokens`, `totalCost`, `cachedTokens`,
  `cacheCreationTokens`, `latencyMs`, `model`, `rawResponse`.

This makes `computeLocalStats` and `rollupAnalytics` count each metric exactly once.

---

## Implementation steps

### 1. Correct analytics ownership + rebuild snapshots

- `ChatStore.ts` — remove `totalCost`, `cachedTokens`, `cacheCreationTokens` from `userPatch`;
  keep them on `assistantPatch`. `userPatch` keeps `promptTokens` + `failed: false`.
- Add `rebuildAnalyticsOwnership()` (idempotent, guarded by a `userSettings` flag) that:
  1. Sets `totalCost = 0`, `cachedTokens = 0`, `cacheCreationTokens = 0` on every user message.
  2. Clears `analyticsSnapshots`.
  3. Resets the rollup marker (see item 2) to a clean slate.
  4. Runs `rollupAnalytics()` over the full message set to rebuild derived snapshots.
- Call it once on app startup (guarded) so existing users get corrected data.

### 2. Serialize rollups + transactional marker

- `analyticsRollupService.ts` — add a module-level mutex (in-flight `Promise`); concurrent calls
  await the same run.
- Move the marker from `localStorage` into `userSettings` (ids `analyticsRollupMarker` /
  `analyticsRollupLastId`, following the `CuratorStore.ts:181-187` pattern), read/written inside
  the **same** `athenaDb.transaction('rw', [analyticsSnapshots, userSettings], …)` that commits
  snapshots, so the marker advances atomically with the snapshots.

### 3. Accumulate cache usage across tool-loop iterations

- `llmService.ts` — in `orchestrateLlmLoop`, accumulate `totalCachedTokens` and
  `totalCacheCreationTokens` per iteration; add them to `OrchestrateResult`.
- `ChatStore.ts:1149` — price using a synthesized `{ cached_tokens, cache_creation_tokens }`
  from the totals; update `debugPayload.usageDetails` and `dbCachedTokens` /
  `dbCacheCreationTokens` to use the accumulated values.

### 4. Restore fail-closed + serialize backup ops

- `backupService.ts` — `restoreBackup` throws (aborts) when the `exportDB` safety backup fails,
  instead of proceeding to a table-clearing import.
- Replace `autoBackupInProgress` with a shared operation queue (promise chain) covering
  `downloadBackup`, `restoreBackup`, `mergeBackup`, `createPreImportBackup`, and
  `performAutoBackup`.

### 5. Harden fork deletion + startup recovery

- `TopicStore.ts` — wrap the topic update + message delete in one
  `athenaDb.transaction('rw', [athenaDb.topics, athenaDb.messages], …)`.
- Add a DB startup gate: a bootstrap hook that opens Dexie, sets a `dbReady`/`dbError` store
  flag, and renders a `<DatabaseRecovery>` screen (retry / export / reset) on async failure —
  before `<App>` mounts.

### 6. Suspense fallback

- `App.tsx` — `fallback={<LoadingScreen/>}` (centered `CircularProgress` splash).

### 7. CRA → Vite migration (separate)

- Tracked as a separate epic; not bundled into these reliability fixes.

---

## Testing

### How to run

```bash
npm test -- --testPathPattern="analyticsRollupService|analyticsService|llmService|backupService|TopicStore|App" --watchAll=false
npm run lint
npm run build
npm run test:coverage   # full pass before committing
```

> Always use `npm test` (never `npx jest`). See `AGENTS.md`.

### What to test, per item

#### Item 1 — Analytics ownership
- **`analyticsService.test.ts`** (extend or add): a user message with `totalCost`/`cachedTokens`
  set does not contribute to `computeLocalStats()` totals; an assistant message with the same
  values contributes exactly once. Assert `totalCost`, `totalCachedTokens`,
  `totalCacheCreationTokens` equal the assistant message's values (not 2×).
- **`ChatStore.test.ts`**: after a streamed reply, the persisted `userPatch` has no
  `totalCost`/cache fields (or they are 0), and `assistantPatch` carries them.
- **`rebuildAnalyticsOwnership`** (new test): after seeding user+assistant messages with
  double-counted data, running the rebuild zeroes user-message cost/cache and rebuilds a single
  snapshot whose `cost` equals only the assistant total.

#### Item 2 — Rollup serialization + transactional marker
- **`analyticsRollupService.test.ts`**: fire two `rollupAnalytics()` calls concurrently
  (`Promise.all`); assert the second reuses the in-flight run (e.g. underlying
  `messages.where` called once) and snapshots are not double-incremented.
- Assert the marker is stored in `userSettings` (mock `athenaDb.userSettings.put/get`) and is
  advanced in the same transaction as snapshot `put`s.
- Update existing tests that set `localStorage.setItem('analyticsRollupMarker', …)` to the new
  `userSettings` source.

#### Item 3 — Tool-loop cache accumulation
- **`llmService.test.ts`**: a model that issues tool calls across ≥2 iterations, each returning
  `cached_tokens`/`cache_creation_tokens`; assert `orchestrateLlmLoop` returns
  `totalCachedTokens`/`totalCacheCreationTokens` equal to the **sum** across iterations (not the
  last only).
- **`ChatStore.test.ts`**: cost is calculated from accumulated cache totals (verify the
  `calculateCostSEK` mock receives summed cache values).

#### Item 4 — Backup fail-closed + serialization
- **`backupService.test.ts`**: when `exportDB` (safety backup) rejects, `restoreBackup` throws and
  `importInto` is **never** called.
- Serialization: start `downloadBackup` and `mergeBackup` concurrently; assert the second waits
  for the first (e.g. `exportDB` called once at a time), and a manual restore/merge does not run
  concurrently with `performAutoBackup`.

#### Item 5 — Fork atomicity + startup recovery
- **`TopicStore.test.ts`**: `deleteFork` performs topic update + message delete within a single
  `athenaDb.transaction` (assert both tables are touched by one transaction; simulate a throw in
  the delete and assert the topic update is rolled back).
- **Database recovery** (new test): rendering the startup gate with a failing DB open shows the
  `<DatabaseRecovery>` screen; retry re-attempts open.

#### Item 6 — Suspense fallback
- **`App.test.tsx`**: assert the `Suspense` boundary has a `fallback` (render and check the
  loading indicator renders before lazy routes resolve).

### Coverage expectations

- `lint` clean, `npm run build` clean (type changes are involved), and no regressions in
  `test:coverage`.

---

## Risks / notes

- The ownership change alters what fields are persisted on user messages; `Message` type fields
  remain optional, so no DB schema change is required.
- Moving the rollup marker into `userSettings` changes observable behavior for tests that read
  `localStorage` directly — those tests must be updated.
- The DB startup gate adds an async bootstrap step to `index.tsx`/`App.tsx`; ensure it does not
  regress first paint for healthy databases.
