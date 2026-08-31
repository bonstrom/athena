# CHK-11: Checklist LLM Usage Is Untracked

**Status:** Completed  
**Priority:** High

## Evidence

`generateChecklist` uses `askLlm` and retains only response content. `applyLlmEdit` uses `orchestrateLlmLoop` and retains only final content. Checklist operations do not persist normal chat messages containing token and cost fields.

## Suspicious Scenario

Checklist generation and editing consume paid API tokens but do not appear in analytics, token totals, or cost reports.

## Verify

- [x] Add a first-class non-chat LLM usage table.
- [x] Record generation and aggregate multi-tool edit usage.
- [x] Include operation records in the exactly-once analytics rollup stream.
- [x] Remove topic-owned operation records during topic deletion.

## Verified Assessment

Generation discards `askLlm` usage fields and editing does not persist the aggregate loop usage. Paid checklist requests are absent from message-based analytics and cost totals.

## What Should Be Done

- Define a first-class persisted usage record for non-chat operations instead of fabricating visible chat messages.
- Record operation type, topic, provider/model, prompt/completion/cache tokens, cost, timestamp, failure, and abort policy.
- Include these records exactly once in local and rolled-up analytics.
- Add generation, multi-tool edit, cached-token, failed-call, and aborted-call accounting tests.

## Completion

Added schema v17 with first-class `LlmOperationUsage` records for checklist generation and editing. Completed paid responses persist model, prompt, completion, cache, cost, search, latency, and tool-trace data without fabricating visible chat messages.

Analytics rollup now merges message and operation records through its existing `(created, id)` checkpoint, preserving exactly-once aggregation. Topic deletion includes the new table in its cleanup transaction. Executable verification is deferred until the remediation pass is complete, as requested.
