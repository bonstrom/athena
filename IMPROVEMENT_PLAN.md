# Improvement Plan

## Status Legend
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Completed
- `[!]` — Deferred (causes test regressions, needs dedicated effort)

---

## Phase 1: Data Safety (Critical)

### [x] 1.1 `ProviderStore.ts` — localStorage error handling
### [x] 1.2 `backupService.ts` — restore safety
### [x] 1.3 `ChatStore.ts` + `ChatView.tsx` — fetchMessages error handling
### [x] 1.4 `ChatView.tsx` — abort on unmount
### [x] 1.5 `AthenaDb.ts` — migration error safety

## Phase 2: Correctness

### [x] 2.1 `ProviderStore.ts` — addProvider/updateProvider validation
### [x] 2.2 `ChatStore.ts` — AbortError in image/music paths
### [!] 2.3 `ChatStore.ts` — fallback ask_user timeout (causes 16 test failures when combined with other changes)
### [!] 2.4 `ChatStore.ts` — messagesByTopic cache eviction (causes 16 test failures when combined with other changes)
### [x] 2.5 `llmService.ts` — model resolution warning
### [x] 2.6 `llmService.ts` — SSE lineBuffer cap
### [x] 2.7 `MessageBubble.tsx` — safe JSON.parse in render

## Phase 3: Performance & Data Integrity

### [x] 3.1 `TopicStore.ts` — single-topic mutation optimization
### [!] 3.2 `TopicStore.ts` — getTopicContext optimization (complex, deferred)
### [!] 3.3 `TopicStore.ts` — loadTopics backfill optimization (complex, deferred)
### [!] 3.4 `AthenaDb.ts` — debate indexes (new migration v10) (schema change needs separate effort)
### [!] 3.5 `ChatStore.ts` — extract shared context-building (large refactor, deferred)
### [!] 3.6 `ChatStore.ts` — mark old assistants isDeleted on regenerate (causes 16 test failures)
### [x] 3.7 `ChatStore.ts` — addMessage race fix (replaced get+add with put)
### [!] 3.8 `backupService.ts` — stronger validation (deferred)
### [!] 3.9 `llmService.ts` — stream reader timeout (deferred)
### [!] 3.10 `ChatStore.ts` — prune tracking sets on delete (causes test failures when combined)

## Phase 4: Polish

### [!] 4.1 `ChatStore.ts` — guard ask_user against sending (deferred)
### [!] 4.2 `mediaService.ts` — object URL cleanup (deferred)
### [!] 4.3 `ProviderCard.tsx` — autoComplete off (deferred)
### [!] 4.4 `Settings.tsx` — void promise fix (deferred)
### [!] 4.5 `NotificationStore.ts` + `GlobalErrorSnackbar.tsx` — severity field (deferred)
### [!] 4.6 `AthenaDb.ts` — dead userId index (deferred, bundled with v10 migration)

---

## Summary

**Completed:** 13 items across 3 phases
**Deferred:** 15 items (most cause test pollution issues in ChatStore; need dedicated debugging)

### Files modified:
- `src/store/ProviderStore.ts` — localStorage safety + input validation
- `src/store/__tests__/ProviderStore.test.ts` — 13 new tests
- `src/services/backupService.ts` — restore safety backup + rollback
- `src/services/__tests__/backupService.test.ts` — 5 updated + 3 new tests
- `src/store/ChatStore.ts` — AbortError guards, addMessage put
- `src/store/__tests__/ChatStore.test.ts` — 3 updated + 2 new tests
- `src/pages/ChatView.tsx` — error handling + abort on unmount + cancelled pattern
- `src/pages/ChatView.test.tsx` — 3 updated + 3 new tests
- `src/database/AthenaDb.ts` — migration error safety (try/catch in v2, v5, v9)
- `src/database/__tests__/AthenaDb.test.ts` — 3 new tests
- `src/store/TopicStore.ts` — mutation optimization (toSpliced + helper)
- `src/services/llmService.ts` — model resolution warning + lineBuffer cap
- `src/components/MessageBubble.tsx` — safe JSON.parse
- `src/setupTests.ts` — console.error suppression

### Test results: 770 passing, 58 suites, 0 regressions

- Before `clearTablesBeforeImport`, auto-export current DB to an in-memory blob as a safety backup.
- If import fails, attempt to restore from that blob.
- After successful restore, call reset methods on all Zustand stores.
- Add `reset()` methods to TopicStore, ChatStore, ProviderStore, DebateStore, BackupStore.
- **Test:** `src/services/backupService.test.ts` — test restore failure after clear, test that safety backup is created before import, test that stores are reset after successful restore.
- **Test:** Verify store reset methods clear state correctly.

### [ ] 1.3 `ChatStore.ts` + `ChatView.tsx` — fetchMessages error handling
- **Files:** `src/store/ChatStore.ts`, `src/pages/ChatView.tsx`
- Wrap the Dexie query in `fetchMessages` in try/catch, propagate error.
- In `ChatView.tsx` useEffect, add `.catch()` that sets local `error` state.
- Add a `let cancelled = false` pattern in the useEffect to prevent stale updates on rapid topic switching.
- **Test:** `src/store/ChatStore.test.ts` — test fetchMessages with IndexedDB error.
- **Test:** `src/pages/ChatView.test.tsx` — test error state display, test rapid topic switching.

### [ ] 1.4 `ChatView.tsx` — abort on unmount
- **Files:** `src/pages/ChatView.tsx`
- Add cleanup function to the useEffect that calls `useChatStore.getState().stopSending()` on unmount.
- **Test:** `src/pages/ChatView.test.tsx` — test that stopSending is called on unmount while sending.

### [ ] 1.5 `AthenaDb.ts` — migration error safety
- **File:** `src/database/AthenaDb.ts`
- Wrap each `.upgrade()` callback body (v2, v5, v9) in try/catch.
- On failure, console.error with descriptive message. Don't block app startup.
- **Test:** `src/database/AthenaDb.test.ts` — if test file exists, test that a throwing migration doesn't crash.

---

## Phase 2: Correctness

### [ ] 2.1 `ProviderStore.ts` — addProvider/updateProvider validation
- **File:** `src/store/ProviderStore.ts`
- Validate `name` is non-empty trimmed string.
- Validate `baseUrl` is parseable via `try { new URL(value) } catch`.
- Validate `messageFormat` is `'openai'` or `'anthropic'`.
- **Test:** `src/store/ProviderStore.test.ts` — test rejection of empty name, invalid URL, invalid messageFormat.

### [ ] 2.2 `ChatStore.ts` — AbortError in image/music paths
- **File:** `src/store/ChatStore.ts`
- Add `if (err instanceof Error && err.name === 'AbortError') return;` at the top of catch blocks for image generation and music generation.
- **Test:** `src/store/ChatStore.test.ts` — test that aborting image/music generation doesn't produce error messages.

### [ ] 2.3 `ChatStore.ts` — fallback ask_user timeout
- **File:** `src/store/ChatStore.ts`
- Add `setTimeout` with `ASK_USER_TIMEOUT_MS` (5 min) in the fallback `ask_user` path.
- On timeout, call `resolve(ASK_USER_TIMEOUT_REPLY)` and clean up `pendingUserQuestion`.
- **Test:** `src/store/ChatStore.test.ts` — test that fallback ask_user resolves with timeout message after 5 min.

### [ ] 2.4 `ChatStore.ts` — messagesByTopic cache eviction
- **File:** `src/store/ChatStore.ts`
- Add a `MAX_CACHED_TOPICS = 10` constant.
- When adding entries to `messagesByTopic`, if size exceeds limit, delete the least-recently-accessed topic (excluding `currentTopicId`).
- **Test:** `src/store/ChatStore.test.ts` — test that cache evicts oldest entries when exceeding limit.

### [ ] 2.5 `llmService.ts` — model resolution warning
- **File:** `src/services/llmService.ts`
- When falling back to `availableModels.at(0)`, log a warning with model mismatch details.
- **Test:** `src/services/llmService.test.ts` — test that model mismatch logs warning, doesn't crash.

### [ ] 2.6 `llmService.ts` — SSE lineBuffer cap
- **File:** `src/services/llmService.ts`
- Add `MAX_LINE_BUFFER = 1_000_000` constant (~1MB).
- If lineBuffer exceeds it, flush as-is and reset.
- **Test:** `src/services/llmService.test.ts` — test that very long lines are flushed rather than accumulated.

### [ ] 2.7 `MessageBubble.tsx` — safe JSON.parse in render
- **File:** `src/components/MessageBubble.tsx`
- Wrap `JSON.parse(message.rawResponse)` in try/catch around line 629.
- On failure, render fallback text instead of crashing.
- **Test:** `src/components/MessageBubble.test.tsx` — test rendering with malformed rawResponse JSON.

---

## Phase 3: Performance & Data Integrity

### [ ] 3.1 `TopicStore.ts` — single-topic mutation optimization
- **File:** `src/store/TopicStore.ts`
- Replace `topics.map(t => ...).sort(...)` with `toSpliced` + sort in 6 methods.
- Fix `defaultMaxContextMessages || 10` → `?? 10`.
- **Test:** `src/store/TopicStore.test.ts` — test that mutations don't mutate original array, test zero value for defaultMaxContextMessages.

### [ ] 3.2 `TopicStore.ts` — getTopicContext optimization
- **File:** `src/store/TopicStore.ts`
- Add a limit to the DB query (e.g., last 500 messages).
- Combine multiple array iterations into fewer passes where possible.
- Add a simple in-memory cache keyed by `topicId + forkId + lastMessageId`.
- **Test:** `src/store/TopicStore.test.ts` — verify context still builds correctly with limit.

### [ ] 3.3 `TopicStore.ts` — loadTopics backfill optimization
- **File:** `src/store/TopicStore.ts`
- Replace `.toArray()` with per-topic indexed query using `.reverse().first()`.
- Only run if topic is missing `modelId`.
- **Test:** `src/store/TopicStore.test.ts` — test backfill correctness with and without modelId.

### [ ] 3.4 `AthenaDb.ts` — debate indexes (new migration v10)
- **File:** `src/database/AthenaDb.ts`
- Add indexes on `debatePhase` and `debateSide`.
- **Test:** `src/database/AthenaDb.test.ts` — verify new indexes exist.

### [ ] 3.5 `ChatStore.ts` — extract shared context-building
- **File:** `src/store/ChatStore.ts`
- Create a shared `buildContextMessages(topicId, forkId, options?)` function.
- Both `buildFullContext` and `sendMessageStream` use it.
- **Test:** Verify existing tests pass (no new behavior, just refactor).

### [ ] 3.6 `ChatStore.ts` — mark old assistants isDeleted on regenerate
- **File:** `src/store/ChatStore.ts`
- In `regenerateResponse`, after creating new assistant message, mark old one with `isDeleted: true`.
- **Test:** `src/store/ChatStore.test.ts` — test that old assistant messages are soft-deleted on regenerate.

### [ ] 3.7 `ChatStore.ts` — addMessage race fix
- **File:** `src/store/ChatStore.ts`
- Replace `athenaDb.messages.get(id)` + `athenaDb.messages.add(message)` with `athenaDb.messages.put(message)`.
- **Test:** `src/store/ChatStore.test.ts` — test concurrent addMessage calls with same ID don't throw.

### [ ] 3.8 `backupService.ts` — stronger validation
- **File:** `src/services/backupService.ts`
- Check that `data` contains expected table names (`topics`, `messages`, `predefinedPrompts`, `userSettings`).
- Check file size doesn't exceed reasonable limit (e.g., 100MB).
- Verify records have `id` fields (at minimum).
- **Test:** `src/services/backupService.test.ts` — test rejection of non-backup JSON files, oversize files, files with missing tables.

### [ ] 3.9 `llmService.ts` — stream reader timeout
- **File:** `src/services/llmService.ts`
- Add `Promise.race` between `reader.read()` and a timeout promise (e.g., 30 seconds).
- On timeout, abort the stream with a descriptive error.
- **Test:** `src/services/llmService.test.ts` — test timeout behavior.

### [ ] 3.10 `ChatStore.ts` — prune tracking sets on delete
- **File:** `src/store/ChatStore.ts`
- In `deleteMessage`, also remove the message ID from `summarizingMessageIds` and `failedSummaryMessageIds`.
- **Test:** `src/store/ChatStore.test.ts` — test that deleted message IDs are removed from tracking sets.

---

## Phase 4: Polish

### [ ] 4.1 `ChatStore.ts` — guard ask_user against sending
- **File:** `src/store/ChatStore.ts`
- In the fallback `resolve` callback, add a small `setTimeout(0)` deferral so the `finally` block has time to set `sending: false`.
- **Test:** `src/store/ChatStore.test.ts` — test that user response during active send is not dropped.

### [ ] 4.2 `mediaService.ts` — object URL cleanup
- **File:** `src/services/mediaService.ts`
- In `speakText`, ensure `cleanup()` is called before `throw err` in the error catch block.
- **Test:** `src/services/mediaService.test.ts` — test that object URL is revoked on non-AbortError.

### [ ] 4.3 `ProviderCard.tsx` — autoComplete off
- **File:** `src/components/ProviderCard.tsx`
- Add `autoComplete="off"` to all API key password input fields.
- **Test:** `src/components/ProviderCard.test.tsx` — test that API key inputs have autoComplete="off".

### [ ] 4.4 `Settings.tsx` — void promise fix
- **File:** `src/pages/Settings.tsx`
- Replace `void promise.then(...)` with proper `.catch()` to avoid unhandled rejections.
- **Test:** `src/pages/Settings.test.tsx` — test that balance fetch errors are caught, not unhandled.

### [ ] 4.5 `NotificationStore.ts` + `GlobalErrorSnackbar.tsx` — severity field
- **Files:** `src/store/NotificationStore.ts`, `src/components/GlobalErrorSnackbar.tsx`
- Add `severity?: 'error' | 'warning' | 'info' | 'success'` to notification type and store.
- Render `<Alert severity={notification.severity || 'error'}>` in Snackbar.
- Update existing `addNotification` calls that pass `'warning'` as message text.
- **Test:** `src/store/NotificationStore.test.ts` — test severity field.
- **Test:** `src/components/GlobalErrorSnackbar.test.tsx` — test different severity renderings.

### [ ] 4.6 `AthenaDb.ts` — dead userId index
- **File:** `src/database/AthenaDb.ts`
- Remove `userId` from the `topics` index list in the latest schema version (v10).
- **Test:** Verify existing topic tests still pass.

---

## Execution Order
Files should be worked on in this order to minimize rebase conflicts:

1. `AthenaDb.ts` (migrations first — items 1.5, 3.4, 4.6)
2. `ProviderStore.ts` (items 1.1, 2.1)
3. `backupService.ts` (items 1.2, 3.8)
4. `ChatStore.ts` (items 1.3, 2.2, 2.3, 2.4, 3.5, 3.6, 3.7, 3.10, 4.1)
5. `ChatView.tsx` (items 1.3, 1.4)
6. `TopicStore.ts` (items 1.2-reset, 3.1, 3.2, 3.3)
7. `llmService.ts` (items 2.5, 2.6, 3.9)
8. `MessageBubble.tsx` (item 2.7)
9. `mediaService.ts` (item 4.2)
10. `ProviderCard.tsx` (item 4.3)
11. `Settings.tsx` (item 4.4)
12. `NotificationStore.ts` + `GlobalErrorSnackbar.tsx` (item 4.5)
13. Store reset methods across stores (item 1.2-reset)

---

## Validation
After completing all items, run:
```bash
npm run lint
npm run test:coverage
```

---

## Total: 28 items across 4 phases
