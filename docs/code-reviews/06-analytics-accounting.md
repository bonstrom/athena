# Task 6: Exactly-Once Analytics Accounting

Date: 2026-10-28

Status: Review complete. Five findings; nine enabled, intentionally failing regression cases and four passing controls added. No application fixes implemented.

## Scope And Evidence

Reviewed `runRollup`, `mergeSnapshots`, checkpoint reads/writes, the per-module rollup queue, ownership rebuild, and aggregation in `analyticsService`. Traced the initial/final chat-message writes, checklist operation-usage persistence, and analytics UI loading/export paths. Read both existing analytics service test suites. Existing investigation documents were not used as proof.

Tests execute the actual service modules with mocked persistence. The cross-instance test creates two isolated module instances, shares persisted state, gates source reads, and explicitly serializes transaction commits. This models independent browser tabs without claiming a real multi-tab/IndexedDB integration run. Failure controls model database rollback; they do not prove IndexedDB's transaction implementation. No sleeps, live providers, application-source changes, or new test files were needed.

The defects below affect displayed/exported analytics, not the charges levied by providers. All are Medium priority.

## Findings

### ACC-01: The creation-time checkpoint permanently excludes late records

Priority: Medium.

Locations: [timestamp queries](../../src/services/analyticsRollupService.ts#L162), [shared timestamp/ID filter](../../src/services/analyticsRollupService.ts#L168), [checkpoint writes](../../src/services/analyticsRollupService.ts#L236).

Trigger and dataset:

1. Roll up message `z`, created at `2026-01-01T12:00:00.000Z`, with cost $0.10 and 100/50 prompt/completion tokens. The checkpoint becomes `(12:00, z)`.
2. Persist message `a` with cost $0.20 and another 100/50 tokens, either at 10:00 or at the same 12:00 timestamp.
3. Roll up twice more. An older timestamp is outside `aboveOrEqual`; the same-timestamp lower ID is rejected by `id <= lastId`.

Expected: two records, $0.30, 200/100 tokens. Actual: one record, $0.10, 100/50 tokens. Repetition never repairs the omission. UUID lexical order does not encode commit order; equal timestamps alone do not make a safe ingestion cursor. Import/merge of historical rows can also introduce records behind the timestamp boundary.

The two source tables share the same cursor. A separate regression first counts message `z`, then persists operation `a` at the checkpoint timestamp with $0.20 and 20/10 tokens. Expected totals are $0.30 and 120/60 tokens; actual totals remain $0.10 and 100/50. Distinct records in different tables do not need duplicate IDs to expose this loss.

Impact: Trends, provider totals, tool totals, and counts permanently omit legitimate late messages and operations until a full rebuild. Local message totals may disagree with snapshots because they scan current rows.

Suggested fix: Track ingestion independently of source creation time, with durable per-source identities or a monotonic commit sequence. Include the source table in contribution identity. A bounded lookback alone is insufficient for arbitrary historical imports unless those imports explicitly invalidate/rebuild affected aggregates.

Regression cases: [late timestamps and lower IDs](../../src/services/__tests__/analyticsRollupService.test.ts#L200), [late operation behind a message checkpoint](../../src/services/__tests__/analyticsRollupService.test.ts#L288). All three fail on omitted cost, after repeated runs.

### ACC-02: Finalizing a previously counted message never corrects its contribution

Priority: Medium.

Locations: [creation-time selection](../../src/services/analyticsRollupService.ts#L162), [checkpoint exclusion](../../src/services/analyticsRollupService.ts#L168), [additive snapshot merge](../../src/services/analyticsRollupService.ts#L98), [initial chat persistence](../../src/store/ChatStore.ts#L1019), [final usage persistence](../../src/store/ChatStore.ts#L1333).

Trigger:

1. A request persists its initial user/assistant rows before generation completes. A startup rollup or a rollup from another tab counts those rows while usage is provisional.
2. Generation finalizes the same rows, updating tokens, cost, latency, and tool metadata without changing their creation timestamp or ID.
3. The next rollup skips those rows because their identities are at or behind the checkpoint. There is no update/version cursor or old-contribution correction.

Dataset: count one provisional message at $0.00 and 0/0 tokens; update that same row to $0.30 and 100/50 tokens, with `failed: true`; roll up again. Expected: one message, $0.30, 100/50 tokens, one failure. Actual: one message, $0.00, 0/0 tokens, zero failures. The regression uses a failed terminal row to assert failure-count correction as well as usage; the traced successful chat-finalization path has the same unchanged identity.

Impact: A normally completed request can be permanently absent from snapshot cost/token totals if a rollup observes it mid-flight. Changes to tool traces, failure state, latency, continuations, or existing rows have the same accounting gap. Current-row totals can show the correct value while trends/provider/tool snapshots remain stale even after manual rollup.

Suggested fix: Aggregate immutable finalized usage events or track record revisions and replace each record's previous contribution. Merely admitting updated rows into the current additive merge would count the old contribution twice. Define correction/invalidation behavior for updates and deletes.

Regression case: [ACC-02](../../src/services/__tests__/analyticsRollupService.test.ts#L227). It fails on cost remaining zero; token, failure-count, and exactly-one-message assertions are also present.

### ACC-03: A checkpoint-read error replays all source records into existing snapshots

Priority: Medium.

Locations: [checkpoint read and catch](../../src/services/analyticsRollupService.ts#L17), [empty-marker full scan](../../src/services/analyticsRollupService.ts#L162), [additive merge](../../src/services/analyticsRollupService.ts#L98), [transactional snapshot writes](../../src/services/analyticsRollupService.ts#L230).

Trigger:

1. Roll up one $0.10 message with 100/50 tokens successfully.
2. A later checkpoint-setting read rejects transiently. `getRollupState` catches the exception and substitutes an empty marker/ID, treating unreadable state as a first run.
3. The source scan and writes subsequently succeed. Existing snapshots are retained, so the full scan is added to them again.

Expected after the failed-read attempt and another normal run: one message, $0.10, 100/50 tokens. Actual: two messages, $0.20, 200/100 tokens. The final normal run does not correct the duplication because the replay also advances the checkpoint. Each further such read failure can add another copy.

Impact: A recoverable settings-read error causes durable overcounting of cost, tokens, failures, provider usage, and tool usage. The write transaction cannot protect against choosing an incorrect starting cursor before entering it.

Suggested fix: Fail closed when checkpoint reads fail. Distinguish genuinely missing initial state from unreadable state. If rebuilding is required, replace derived snapshots and reset/recreate the cursor coherently rather than appending a replay into existing snapshots.

Regression case: [ACC-03](../../src/services/__tests__/analyticsRollupService.test.ts#L247). It accepts either a safely aborted attempt or safe recovery, then verifies that a normal retry has not doubled the totals. Current code fails at $0.20 versus $0.10.

### ACC-04: Independent rollup instances duplicate the same batch despite serialized writes

Priority: Medium.

Locations: [module-local queue](../../src/services/analyticsRollupService.ts#L33), [checkpoint read before transaction](../../src/services/analyticsRollupService.ts#L159), [snapshot merge inside transaction](../../src/services/analyticsRollupService.ts#L230), [startup rollup](../../src/App.tsx#L35).

Trigger:

1. Two tabs/independent module instances read the same old checkpoint and select the same unprocessed $0.10 message.
2. Instance A enters the write transaction, creates the snapshot, and advances the checkpoint.
3. Instance B enters a later, correctly serialized write transaction. It reads A's snapshot but does not reread/revalidate the checkpoint. It adds its already-prepared batch to that snapshot and writes the same checkpoint again.

Expected: one message, $0.10, 100/50 tokens. Actual: two messages, $0.20, 200/100 tokens. No overlapping write transactions are needed. The in-memory queue is effective for calls using one module instance, but is not shared across tabs.

Impact: Opening or refreshing Athena in multiple tabs can permanently inflate rolled-up analytics. Source-row live totals still contain one contribution, while snapshots contain two. The same issue can affect concurrent rebuild/rollup ownership, though the regression specifically exercises two ordinary rollups.

Evidence: The test gates both source reads until both instances have obtained the initial cursor, then commits their transaction callbacks sequentially against shared snapshot/settings maps. This establishes the service-level stale-cursor interleaving, not browser scheduling frequency.

Suggested fix: Make contribution admission idempotent across contexts, or acquire a database/cross-tab ownership mechanism before selecting the batch. Revalidate the cursor atomically at commit and retry stale prepared work. A write transaction that only protects merge/checkpoint publication is not sufficient.

Regression case: [ACC-04](../../src/services/__tests__/analyticsRollupService.test.ts#L260). It fails on doubled cost with explicitly serialized commits. Existing same-instance concurrency tests continue to pass.

### ACC-05: Current totals and no-snapshot fallbacks omit operation usage

Priority: Medium.

Locations: [local totals scan](../../src/services/analyticsService.ts#L91), [provider fallback](../../src/services/analyticsService.ts#L342), [tool fallback](../../src/services/analyticsService.ts#L362), [analytics export consumes local totals](../../src/services/analyticsService.ts#L415), [rollup includes both source tables](../../src/services/analyticsRollupService.ts#L162), [checklist usage persistence](../../src/store/ChecklistStore.ts#L250).

Dataset: one message costs $0.10 with 10/5 tokens, and one checklist operation costs $0.20 with 20/10 tokens. Both use the same known provider; the operation also has one successful tool call, seven cached tokens, two cache-creation tokens, and one web search. The message has three cached tokens.

Expected usage totals: $0.30, 30/15 tokens, ten cached tokens, two cache-creation tokens, and one search. `computeLocalStats` returns only message usage: $0.10, 10/5 tokens, three cached tokens, zero cache-creation tokens/searches. This omission is permanent in local/exported totals, even after rollup, because that function never reads operation rows or snapshots.

Before snapshots exist, provider fallback reports $0.10 and 15 combined tokens instead of $0.30 and 45 tokens; tool fallback reports no calls instead of the operation's successful call. After a successful rollup, snapshot-based provider/tool aggregation includes operations, so changing aggregation paths changes the apparent accounting universe.

Impact: Checklist and other persisted non-message usage is absent from headline/exported usage totals and initial provider/tool breakdowns. Trends and local totals can disagree even when every operation has already been rolled up correctly. This finding concerns rows already persisted to `llmOperationUsages`, not whether every feature records its usage successfully.

Suggested fix: Use the same usage-source contract for local totals, export, and fallbacks as for rollup. Include non-message token/cost/cache/search/tool usage without conflating operation counts with literal chat-message counts or adding snapshots on top of already-counted source rows.

Regression cases: [local totals](../../src/services/__tests__/analyticsService.test.ts#L159), [provider fallback](../../src/services/__tests__/analyticsService.test.ts#L170), [tool fallback](../../src/services/__tests__/analyticsService.test.ts#L178). All three fail at their accounting assertions. Export impact is traced through its direct call to `computeLocalStats`; the new regression does not exercise browser file downloading.

## Protected Boundaries And Remaining Limits

- Repeated/concurrent calls through one module's queue do not duplicate immutable records already visible in the selected window. A new passing control includes a message and an operation at the same timestamp, runs overlapping calls and a retry, and verifies $0.30 and 120/60 tokens exactly once.
- Snapshot writes and both checkpoint writes share one transaction. New controls inject failure at snapshot put, marker put, and last-ID put; the persistence mock rolls that transaction back, then retry produces one contribution per day. There is no finding claiming that ordinary failure between these writes bypasses transactional rollback.
- `mergeSnapshots` is additive and existing tests cover provider merging, tool extraction, daily totals, and the 300-sample latency cap. Addition is correct for disjoint immutable batches. It does not itself deduplicate replayed contributions or revise an old one, which is why the admission defects above survive the merge.
- Local totals scan current messages, whereas trends and percentile functions read snapshots. Provider/tool functions choose snapshots exclusively once any exist; they do not merge an unrolled live tail. Some snapshot lag is therefore expected. No separate defect is asserted solely for the period before a scheduled/manual rollup; ACC-01/02 describe omissions that survive further rollups, and ACC-05 survives even a correct rebuild.
- Ownership rebuild clears snapshots/checkpoints and recomputes from corrected source data. It can repair some accumulated omissions/duplicates, but its one-time completion flag means ordinary manual rollup is not a rebuild and does not repair these cases. No concurrent ownership-rebuild integration test was added.
- True multi-tab IndexedDB behavior, browser termination during commit, source deletion/correction policy, and live provider requests were not integration-tested. The transaction controls deliberately test the service under an atomic persistence contract rather than fabricating a partial commit that Dexie promises to roll back.

## Tests And Verification

Added 13 cases across the existing [rollup suite](../../src/services/__tests__/analyticsRollupService.test.ts) and [aggregation suite](../../src/services/__tests__/analyticsService.test.ts): nine desired-behavior failures covering all five findings and four passing boundary controls. New names start with `ACC-`.

Run the new cases:

```bash
npm test -- --watchAll=false --runInBand --testPathPattern="analyticsRollupService.test|analyticsService.test" --testNamePattern="ACC-"
```

Run the complete reviewed service slice and touched-file lint:

```bash
npm test -- --watchAll=false --runInBand --testPathPattern="analyticsRollupService.test|analyticsService.test"
npx eslint src/services/__tests__/analyticsRollupService.test.ts src/services/__tests__/analyticsService.test.ts
```

Full slice result: **41 passed, 9 failed** across two suites. Only the new desired-behavior regressions fail, at omitted/doubled cost or missing tool-call assertions. The four new controls pass. Touched-file ESLint passes with no output, and editor diagnostics report no errors in either modified test file. No application types/interfaces changed; production build and the unrelated full suite were not run.