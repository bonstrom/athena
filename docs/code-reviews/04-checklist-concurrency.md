# Task 4: Checklist Concurrency and Persistence

Date: 2026-10-27

Status: Review complete. Five findings; no application fixes implemented.

## Scope

Reviewed checklist load ownership, manual mutations, per-item persistence queues, edit admission, tool mutations, cancellation, history persistence, and cleanup. Inspected nearby store/component tests and UI guards. Prior investigations, including [manual/AI interleaving](../bug-investigations/CHK-19-manual-and-ai-edits-interleave.md), [rapid toggles](../bug-investigations/CHK-20-rapid-toggle-loses-intent.md), and [history persistence](../bug-investigations/CHK-07-history-persistence-divergence.md), were treated as leads rather than proof of correctness.

Findings distinguish deterministic source-level interleavings from browser/IndexedDB integration. In particular, the toggle probe deliberately reverses prerequisite lookup completion; that scheduling has not been demonstrated against real Dexie.

## Findings

### CHKREV-01: Edit admission and cleanup do not preserve request ownership

Priority: High.

Locations: [entry guard and awaited tab lookup](../../src/store/ChecklistStore.ts#L1080), [controller assignment and busy state](../../src/store/ChecklistStore.ts#L1099), [unconditional finalizer](../../src/store/ChecklistStore.ts#L1196), [stop releases busy state immediately](../../src/store/ChecklistStore.ts#L1202).

Two triggering timelines expose the same missing ownership discipline:

1. Call `applyLlmEdit` twice before either call resumes from `getActiveTabId`. Both observe `editing === false`, then both assign controllers and reach the orchestrator. There is no admission recheck after the await. The second controller overwrites the first while both edits remain active.
2. Start edit A, stop it while its orchestrator promise is still pending, and start edit B. B owns the shared controller and sets `editing` true. Let A reject with `AbortError`: A's `finally` sets `editing` false and clears the shared controller. A subsequent `stopEdit` cannot abort B.

Impact: Multiple AI edits can mutate the same checklist concurrently. A replacement edit can run with controls unlocked and no stop ownership. Streaming/tool-log callbacks also write shared state without a request identity, so concurrent requests can mix progress. The probes directly establish duplicate orchestration and lost cancellation ownership, not a particular downstream corruption of tool results.

Evidence: The complete current store, with mocked persistence and deferred orchestration, admitted two same-tick calls. A separate probe executed the actual `applyLlmEdit` and `stopEdit` methods with mocked helpers: A's signal was aborted, B started, A settled, and B's signal remained un-aborted after another stop.

Suggested fix: Reserve an operation identity synchronously before the first await. Make controller assignment, callbacks, busy state, and final cleanup conditional on that identity. Either retain the lock until cancellation settles or explicitly transfer ownership to the replacement without allowing the old operation to clear it.

Regression tests: Invoke two edits without yielding and assert only one is admitted. Stop A, start B before A settles, then settle A and assert B remains busy and stoppable. Also assert A cannot append progress or overwrite B's summary/logs after replacement.

### CHKREV-02: A committed mutation can publish into a different topic's active state

Priority: Medium.

Locations: [createGroup transaction and unconditional state append](../../src/store/ChecklistStore.ts#L753), [load resets and replaces the active view](../../src/store/ChecklistStore.ts#L640).

Trigger and path:

1. Topic A is active. Start `createGroup(A)` and leave its persistence pending.
2. Load topic B to completion. The store now owns B and contains B's groups.
3. Allow A's insert to commit. `createGroup` appends the captured A group to whatever `state.groups` exists now, without checking the active topic/tab or load generation.

Impact: The active checklist state contains a group belonging to another topic. The database insert itself still targets A; this is a stale publication defect, not evidence that this insert writes B's records. The load request guard does not protect later mutation continuations.

Evidence: In the complete-store probe, group insertion was deferred, `loadChecklist(B)` completed, and insertion was released. Final state had `activeTopicId === 'B'` and an A-owned group in `groups`. Persistence was an in-memory mock; real transaction scheduling was not tested.

Suggested fix: Capture topic/tab ownership at mutation admission and revalidate it before publishing. Keep a legitimate completed write in its original topic, but do not append it into an unrelated active view. Apply the same rule to other post-await mutation publications rather than relying only on loader guards.

Regression tests: Delay an A mutation, complete a B load, then release the mutation. Assert A's row persists and B's state remains unchanged. Repeat across tabs and with a failed late mutation to check that rollback cannot alter the replacement view.

### CHKREV-03: The item queue orders completed lookups, not toggle intent

Priority: Medium; the reversed-lookup schedule is verified with deferred mocks, not real IndexedDB.

Locations: [topic lookup prerequisites](../../src/store/ChecklistStore.ts#L218), [per-item persistence queue](../../src/store/ChecklistStore.ts#L225), [optimistic toggle and subsequent enqueue](../../src/store/ChecklistStore.ts#L886).

Trigger and path:

1. An unchecked item is toggled once. The UI immediately becomes checked, but its `getItemTopicId` lookup is delayed before `persistItemUpdate` is called.
2. Toggle again. The UI becomes unchecked. Let the second lookup and persistence complete first, storing `checked: false`.
3. Release the first lookup. Its older `checked: true` patch enters the per-item queue last and persists after the newer intent.

Impact: The final optimistic UI is unchecked while the stored item is checked; reloading can reverse the user's latest choice. The queue correctly serializes operations already submitted to it, but admission happens after asynchronous prerequisites and therefore does not guarantee invocation order.

Evidence: The complete-store probe deferred the first item lookup, completed the second toggle, then released the first. Both calls succeeded; final persistence was `true` and current state was `false`. This establishes a missing ordering guarantee in the store. It does not establish how frequently, or whether, that exact completion inversion occurs in the current browser/Dexie implementation.

Suggested fix: Reserve each item's queue position synchronously with the optimistic intent, and perform asynchronous prerequisites inside that queued operation. Alternatively, version intents and explicitly prevent an older version from persisting over a newer one. Rollbacks should also be tied to intent identity rather than checked-value equality alone.

Regression tests: Resolve two prerequisite lookups in reverse order and assert that persisted and optimistic state both reflect the latest toggle. Include a failed older write followed by a newer successful toggle, and repeated checked values, so rollback cannot erase newer intent.

### CHKREV-04: An already-pending manual mutation can commit during an AI edit

Priority: Medium.

Locations: [manual update admission and awaited lookup](../../src/store/ChecklistStore.ts#L872), [AI snapshot capture and editing flag](../../src/store/ChecklistStore.ts#L1090).

Trigger and path:

1. With `editing === false`, call `updateItem` and delay its item/topic lookup. Its entry guard has already passed.
2. Start an AI edit. It captures the current checklist and reaches the orchestrator with `editing === true`.
3. Release the manual lookup. `updateItem` persists its patch without rechecking edit ownership or participating in a shared mutation lock.

Impact: The model's initial snapshot can become stale while the edit is active, despite disabled UI controls and entry guards. Manual and model changes can overwrite one another depending on execution order. This differs from CHKREV-01: even perfectly exclusive AI admission would not drain or exclude previously admitted manual work.

Evidence: The complete-store probe admitted a manual content update before starting the AI edit, then released it while the orchestrator remained pending. The database changed while `editing` was still true. A resulting model overwrite was not separately simulated.

Suggested fix: Coordinate manual and AI mutations through a shared topic/tab operation boundary. Wait for already-admitted manual writes before capturing the model snapshot, and prevent new manual admissions until the edit releases ownership. Do not silently drop a previously accepted manual edit just because it resumes after the flag changes.

Regression test: Hold a manual update before persistence, start an AI edit, then release the manual update. Assert the chosen ordering policy: either the edit waits and snapshots the committed manual value, or the manual operation is explicitly queued until the AI edit finishes. Verify that accepted user intent is not lost.

### CHKREV-05: A provider failure after committed tools leaves no terminal history record

Priority: Medium.

Locations: [user instruction persisted before orchestration](../../src/store/ChecklistStore.ts#L1109), [successful mutation count](../../src/store/ChecklistStore.ts#L1148), [summary persistence and error handling](../../src/store/ChecklistStore.ts#L1185).

Trigger and path:

1. Start an AI edit; its user instruction is committed to history.
2. Execute a successful checklist tool. Its mutation commits independently of the remaining model loop.
3. The next provider step throws an ordinary error. The catch path only notifies the user. It neither rolls back completed mutations nor persists an interrupted/failed assistant history entry. The partial-operation count is recorded only for a particular explicit-abort path.

Impact: Durable checklist changes survive, but history contains only the initiating instruction, without a completion or partial-failure record. Later editing context and users reviewing history cannot distinguish this partially applied request from one that made no changes. Transactional history insertion does not solve a terminal entry that is never attempted.

Evidence: The complete-store probe's orchestrator invoked the actual tool callback to add a group, then threw a provider error. One group remained persisted; history contained exactly one user entry and no assistant completion/failure entry. Error notification and final cleanup occurred.

Suggested fix: Persist a terminal outcome for every admitted edit, including non-abort failures after partial commits. Associate it with the original topic/tab and distinguish completed operations, failures, and interrupted work. If partial commits are the intended policy, describe them accurately instead of implying atomic rollback.

Regression tests: Commit a tool mutation, then fail the next provider call and assert both the surviving mutation and a partial-failure history entry. Separately test navigation/cancellation after committed work and failure to persist the terminal record; make the persistence failure visible without claiming history and state are synchronized.

## Verified Controls and Remaining Limits

- An actual-source `loadChecklist` control passed: start A's load, complete B's load, then resolve A. B's state remained active. Existing [stale-load tests](../../src/store/__tests__/ChecklistStore.test.ts#L297) cover stale success and failure. CHKREV-02 concerns mutation publication outside that protection.
- Inspection found transactions around multi-record mutations and history writes, persisted sort-order reads, and topic/group existence checks in several mutation paths. No rollback or isolation guarantees were tested with real Dexie; these protections must not be interpreted as proof that deletion races are fully covered.
- Tool execution checks topic ownership before dispatch, validates arguments/targets, limits structural changes per round, and disables result caching for edits. Those are useful protections, but do not provide exclusive ownership across pending work or undo already-committed tools.
- Existing [topic-change tests](../../src/store/__tests__/ChecklistStore.test.ts#L858) cover rejecting later tool execution and ignoring a final result after navigation. They do not establish safe publication for a mutation already in flight.
- UI controls disable actions while editing, but that cannot cancel an already-admitted manual mutation or make store admission atomic.
- No real browser, provider, IndexedDB deletion interleaving, transaction rollback, or cross-tab writer was exercised. Findings do not claim a complete proof of multi-record atomicity or absence of additional deletion races.

## Validation and Existing Coverage

- Application code, tests, and dependencies were not changed. The probes below were temporary terminal scripts, not saved Jest regression tests. Regression cases described above still need to be added to the existing test suite.
- Five deferred-interleaving probes executed the complete current store using Node v26's `node:module.stripTypeScriptTypes` and `node:vm`, with mocked Zustand, persistence, orchestration, and peripheral services. All five observations passed: duplicate admission, cross-topic publication, reversed toggle persistence, partial-failure history, and pending manual-write interleaving.
- A sixth defect observation executed the actual edit/stop methods with mocked helpers and confirmed lost stop ownership after restart. A separate actual-source load-ownership control passed.
- Database tables were in-memory mocks. The transaction mock ran callbacks directly: it did not reproduce Dexie transaction serialization or rollback. The deferred schedules establish store-level ownership/ordering defects and explicitly bounded risks, not integration-test results.
- Existing suite command attempted: `npm test -- --testPathPattern="(ChecklistStore|ChecklistView|ChecklistComposer)\.test\.(ts|tsx)$" --watchAll=false --runInBand`.
- Result: Blocked before Jest started because `react-scripts` is unavailable. No claim is made that these suites pass or fail.
- The existing [error-cleanup test](../../src/store/__tests__/ChecklistStore.test.ts#L849) checks that a failed edit clears its own busy state. It does not cover an older finalizer clearing a replacement edit, nor committed mutations preceding provider failure.

Recommended next step: Add the deterministic regressions above when dependencies are available, then implement fixes separately. Tasks 5-7 remain unreviewed.