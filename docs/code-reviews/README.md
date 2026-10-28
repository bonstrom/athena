# Focused Code Reviews

Run each task independently. Keep findings in one report per task; do not combine unrelated reviews or implement fixes during a review.

## Review Standard

Review only the specified behavior and its direct dependencies. Read relevant tests. Report actionable bugs with file/line references, a concrete triggering scenario, impact, and a suggested regression test. Distinguish confirmed defects from unverified risks. Treat existing investigation documents as leads, not proof. Avoid style advice, broad refactoring, and finding quotas. Do not modify application code.

## Regression Test Follow-Up

On 2026-10-27, dependencies were installed and 25 permanent Jest regression cases were added for all 17 findings in reviews 1-4. The reports' earlier missing-dependency and temporary-probe notes describe their original review runs; this follow-up supersedes that test-availability status. No application fixes were made.

| Review | Cases | Test locations |
| --- | --- | --- |
| 1. Streaming and cancellation | 8 | [Service tests](../../src/services/__tests__/llmService.test.ts#L1), [chat-store tests](../../src/store/__tests__/ChatStore.test.ts#L1); names start with `STR-`. |
| 2. Tool-call protocol | 5 | [Service tests](../../src/services/__tests__/llmService.test.ts#L1); names start with `TOOL-`. |
| 3. Context and fork isolation | 6 | [Topic-store tests](../../src/store/__tests__/TopicStore.test.ts#L1), [chat-store tests](../../src/store/__tests__/ChatStore.test.ts#L1), [inspector tests](../../src/components/TopicContextDialog.test.tsx#L1); names start with `CTX-`. |
| 4. Checklist concurrency | 6 | [Checklist-store tests](../../src/store/__tests__/ChecklistStore.test.ts#L1); names start with `CHKREV-`. |

Full suite result: **1,117 passed, 25 failed; 73 suites passed, 5 failed**. All failures were the new desired-behavior regressions, not fixture exceptions; they remain enabled and failing until fixes are implemented. The checklist manual/AI exclusion case was subsequently refined to accept either safe serialization order and rerun separately, still failing at its behavioral assertion. TypeScript diagnostic comparison against the original five test files found no newly introduced diagnostics; existing diagnostics were not fixed.

These are real module/component tests with mocked transport and persistence, not live-provider or real IndexedDB integration. The reversed toggle-lookup case explicitly tests adversarial mock scheduling, not demonstrated browser scheduling. Concurrency gates use deferred promises; checklist tests use Node's immediate task queue to drain microtasks rather than sleeps.

Run only the review regressions:

```bash
npm test -- --watchAll=false --runInBand --testNamePattern="STR-0|TOOL-0|CTX-0|CHKREV-0"
```

## Tasks

### 1. Streaming and Cancellation

- Status: Review complete; five findings recorded. Fixes not implemented. Existing Jest suites could not run because dependencies are not installed.
- Report: [Streaming and cancellation findings](01-streaming-and-cancellation.md).
- Prompt: Review `askLlmStream` in `src/services/llmService.ts` and its lifecycle in `sendMessageStream` in `src/store/ChatStore.ts`. Focus on network chunks splitting UTF-8 characters or SSE events, incomplete final events, abrupt EOF, provider errors, and cancellation during pending reads. Trace what happens when the user stops, switches topics, or starts another request. Can stale callbacks update the wrong message, resources remain open, or interrupted output be persisted as successful?

### 2. Tool-Call Protocol Correctness

- Status: Review complete; three findings recorded. Fixes not implemented. Existing Jest suite could not run because dependencies are not installed.
- Report: [Tool-call protocol findings](02-tool-call-protocol.md).
- Prompt: Review `orchestrateLlmLoop` and the provider adapters in `src/services/llmService.ts`. Trace assistant tool calls through execution, tool-result messages, and the next request. Check multiple calls, missing IDs, malformed arguments, execution failures, cancellation, and iteration-limit finalization. Verify OpenAI, Anthropic, and Moonshot builtin tool behavior separately. Look for invalid conversation histories, skipped or duplicated execution, and lost content or usage.

### 3. Context Selection and Fork Isolation

- Status: Review complete; four findings recorded. Fixes not implemented. Existing Jest suites could not run because dependencies are not installed.
- Report: [Context selection and fork isolation findings](03-context-and-fork-isolation.md).
- Prompt: Review `getTopicContext` in `src/store/TopicStore.ts`, plus `buildFullContext` and runtime request assembly in `src/store/ChatStore.ts`. Check fork and response-version isolation, retry boundaries, pinned messages, summaries, RAG deduplication, and token budgets. Trace oversized prompts and attachments. Can excluded messages leak back through retrieval, essential recent messages disappear, or the context inspector disagree with the actual request?

### 4. Checklist Concurrency and Persistence

- Status: Review complete; five findings recorded. Fixes not implemented. Existing Jest suites could not run because dependencies are not installed.
- Report: [Checklist concurrency and persistence findings](04-checklist-concurrency.md).
- Prompt: Review async mutation ownership in `src/store/ChecklistStore.ts`, especially `applyLlmEdit`, `stopEdit`, and `persistItemUpdate`. Trace topic switching, deletion during pending work, rapid toggles, manual edits overlapping AI edits, and cancellation after some mutations commit. Check database/state consistency, multi-record atomicity, history accuracy, and cleanup ownership. Use explicit event timelines to demonstrate any race rather than merely noting that awaits exist.

### 5. Backup Restore and Merge Safety

- Status: Review complete; three findings recorded. Three enabled, intentionally failing regression tests and three passing boundary controls added. No application fixes implemented. Reviewed test slice: 44 passed, 3 failed; touched-test ESLint passes.
- Report: [Backup restore and merge findings](05-backup-restore-and-merge.md).
- Tests: [Backup-service suite](../../src/services/__tests__/backupService.test.ts#L537); new case names start with `BAK-`. Run `npm test -- --watchAll=false --runInBand --testPathPattern="backupService.test" --testNamePattern="BAK-"`.
- Prompt: Review restore, merge, and operation serialization in `src/services/backupService.ts`. Trace validation, safety export, destructive import, rollback, and UI refresh. Inject failures at each boundary, including rollback failure. Check concurrent backup requests and ordinary application writes during import. Determine exactly what can be lost or partially imported, whether recovery is reliable, and whether notifications accurately describe the resulting database state.

### 6. Exactly-Once Analytics Accounting

- Status: Review complete; five findings recorded. Nine enabled, intentionally failing regression cases and four passing boundary controls added. No application fixes implemented. Reviewed service slice: 41 passed, 9 failed; touched-test ESLint passes.
- Report: [Exactly-once analytics accounting findings](06-analytics-accounting.md).
- Tests: [Rollup suite](../../src/services/__tests__/analyticsRollupService.test.ts#L200), [aggregation suite](../../src/services/__tests__/analyticsService.test.ts#L159); new case names start with `ACC-`. Run `npm test -- --watchAll=false --runInBand --testPathPattern="analyticsRollupService.test|analyticsService.test" --testNamePattern="ACC-"`.
- Prompt: Review `runRollup`, `mergeSnapshots`, and rollup checkpoints in `src/services/analyticsRollupService.ts`, together with aggregation in `src/services/analyticsService.ts`. Check repeated or concurrent rollups, identical timestamps, late-arriving records, updates to previously processed records, and failure between snapshot writes and checkpoint updates. Trace live versus rolled-up records and operation usage. Can costs or tokens be omitted or counted twice? Demonstrate discrepancies with a small concrete dataset.

### 7. Untrusted Content Rendering

- Status: Review complete; three findings recorded. Six intentionally failing component regressions and two passing controls retained; no application fixes implemented. Earlier focused runs verified the retained cases; final slimmed suite was not rerun after slow/cancelled invocations. Subprocess parser probes were removed. See report for verification limits.
- Report: [Untrusted content rendering findings](07-untrusted-content-rendering.md).
- Tests: [Component suite](../../src/components/MarkdownWithCode.test.tsx#L186); new case names start with `REN-`. Optional focused command: `npm test -- --watchAll=false --runInBand --testPathPattern="MarkdownWithCode.test" --testNamePattern="REN-"`.
- Prompt: Review the rendering trust boundaries in `src/components/MarkdownWithCode.tsx`. Trace model-controlled Markdown, SVG, Mermaid, math, links, and images to their final DOM or network sinks. Check sanitizer configuration, external resource loading, unsafe URL schemes, asynchronous diagram rendering, and expensive hostile inputs. Separate executable injection, privacy leaks, and availability problems. For each finding, provide a minimal payload and explain why it survives the actual rendering pipeline.

### 8. Deprecated Dependency Remediation

- Status: Not started; warning inventory and acceptance criteria recorded.
- Task: [Dependency warning inventory and remediation task](08-deprecated-dependencies.md).
- Prompt: Trace the deprecated package versions listed in Task 8 to their direct dependency owners. Verify applicable security advisories and distinguish browser-runtime exposure from build/test tooling. Propose compatible parent upgrades or replacements, including a separate tooling migration decision if CRA blocks remediation. Preserve lint, Jest, production builds, workers, and deployment behavior. Do not suppress warnings or force incompatible transitive versions. Record a fix or justified deferral for every warning, with reusable regression tests where behavior changes.