# CHK-03: Stop Leaves Partial Unrecorded Edits

**Status:** Completed  
**Priority:** High

## Evidence

Checklist tools persist mutations as the LLM loop progresses. `stopEdit` aborts the request and clears the summary. The `AbortError` path returns before instruction and assistant history entries are added. No transaction spans the complete edit session.

## Suspicious Scenario

Stopping after two of five tool calls leaves two permanent mutations but no history or summary explaining the partial operation.

## Verify

- [x] Preserve incremental tool commits on stop.
- [x] Persist the user instruction before tool execution.
- [x] Count successful non-error tool mutations.
- [x] Record an explicit stopped result for future edit context.

## Verified Assessment

Tool mutations commit incrementally. The `AbortError` path skips both history writes and `stopEdit` clears the summary, so stopped edits can persist without any continuity record.

## What Should Be Done

- Preserve partial commits rather than attempting a long-lived Dexie transaction across network calls.
- Record the user instruction before execution or record an explicit aborted result after the loop stops.
- Include the number or descriptions of completed tool mutations in the aborted history entry.
- Add a test that aborts after one successful tool and verifies data plus history remain consistent after reload.

## Completion

Checklist edits now persist the user instruction before the LLM loop begins. Successful non-error tool mutations are counted, and a user-triggered abort appends an assistant history entry stating how many operations completed. Navigation and deletion aborts do not publish that stopped entry under another topic.

Partial database commits remain intentional and are now represented in continuity history. Executable verification is deferred until the remediation pass is complete, as requested.
