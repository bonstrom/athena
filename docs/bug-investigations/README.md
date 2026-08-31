# Bug Investigation Backlog

All 40 investigations have been reviewed and closed. Confirmed defects were remediated; unconfirmed investigations record the automated evidence collected and preserve any browser, provider-fixture, migration-matrix, or benchmark follow-up without treating it as a proven bug.

## Verification Summary

| Verdict             | Count | Meaning                                                                                               |
| ------------------- | ----: | ----------------------------------------------------------------------------------------------------- |
| Completed           |    38 | The fix or no-defect verification is complete, with remaining test improvements recorded explicitly.  |
| Confirmed           |     0 | Current code establishes the described behavior and it warrants remediation.                          |
| Partially confirmed |     0 | The behavior or weakness exists, but scope or desired product behavior must be decided before coding. |
| Verification-only   |     0 | No defect was proven; add the specified executable coverage before changing production code.          |
| Dismissed           |     2 | Current behavior is safe or intentional enough that this should not be treated as a bug.              |

Final validation passed 951 tests across 71 suites. Coverage is 82.12% statements and 75.48% branches overall, and the production build compiles successfully with ESLint disabled as requested.

## General Areas

- [x] [GEN-01 Cost and analytics accounting](GEN-01-cost-and-analytics-accounting.md)
- [x] [GEN-02 Database migrations and integrity](GEN-02-database-migrations-and-integrity.md)
- [x] [GEN-03 Backup, restore, and import](GEN-03-backup-restore-and-import.md)
- [x] [GEN-04 Streaming and cancellation](GEN-04-streaming-and-cancellation.md)
- [x] [GEN-05 Tool-loop completion](GEN-05-tool-loop-completion.md)
- [x] [GEN-06 Debate lifecycle](GEN-06-debate-lifecycle.md)
- [x] [GEN-07 Provider compatibility](GEN-07-provider-compatibility.md)
- [x] [GEN-08 Context construction and RAG](GEN-08-context-construction-and-rag.md)
- [x] [GEN-09 Provider and model lifecycle](GEN-09-provider-and-model-lifecycle.md)
- [x] [GEN-10 Workers and browser APIs](GEN-10-workers-and-browser-apis.md)
- [x] [GEN-11 Rendering security and privacy](GEN-11-rendering-security-and-privacy.md)
- [x] [GEN-12 Large-data behavior](GEN-12-large-data-behavior.md)
- [x] [GEN-13 UI state and routing](GEN-13-ui-state-and-routing.md)
- [x] [GEN-14 Accessibility and responsive behavior](GEN-14-accessibility-and-responsive-behavior.md)
- [x] [GEN-15 Test blind spots](GEN-15-test-blind-spots.md)

## Checklist Feature

- [x] [CHK-01 Cross-topic load race](CHK-01-cross-topic-load-race.md)
- [x] [CHK-02 LLM edit crossing topics](CHK-02-llm-edit-crossing-topics.md)
- [x] [CHK-03 Stop leaves partial unrecorded edits](CHK-03-stop-leaves-partial-unrecorded-edits.md)
- [x] [CHK-04 Partial group creation](CHK-04-partial-group-creation.md)
- [x] [CHK-05 Regeneration leaves old records](CHK-05-regeneration-leaves-old-records.md)
- [x] [CHK-06 Concurrent sort-order collisions](CHK-06-concurrent-sort-order-collisions.md)
- [x] [CHK-07 History persistence divergence](CHK-07-history-persistence-divergence.md)
- [x] [CHK-08 Short-ID ambiguity](CHK-08-short-id-ambiguity.md)
- [x] [CHK-09 Duplicate IDs accepted during reorder](CHK-09-duplicate-ids-in-reorder.md)
- [x] [CHK-10 Missing rows reported as updated](CHK-10-missing-rows-reported-as-updated.md)
- [x] [CHK-11 Checklist LLM usage is untracked](CHK-11-llm-usage-untracked.md)
- [x] [CHK-12 Search excludes checklist contents](CHK-12-search-excludes-checklist-contents.md)
- [x] [CHK-13 UI closes before writes complete](CHK-13-ui-closes-before-writes-complete.md)
- [x] [CHK-14 Generation result crosses topics](CHK-14-generation-result-crosses-topics.md)
- [x] [CHK-15 Unbounded generated checklist](CHK-15-unbounded-generated-checklist.md)
- [x] [CHK-16 Tool arguments lack runtime validation](CHK-16-tool-arguments-lack-runtime-validation.md)
- [x] [CHK-17 Checklist state can inject instructions](CHK-17-checklist-state-prompt-injection.md)
- [x] [CHK-18 Operations can recreate deleted-topic data](CHK-18-operations-after-topic-deletion.md)
- [x] [CHK-19 Manual and AI edits can interleave](CHK-19-manual-and-ai-edits-interleave.md)
- [x] [CHK-20 Rapid toggles can lose intent](CHK-20-rapid-toggle-loses-intent.md)
- [x] [CHK-21 Checklist details need hostile-rendering coverage](CHK-21-details-hostile-rendering.md)
- [x] [CHK-22 Generated JSON parser contract is permissive](CHK-22-generated-json-parser-contract.md)
- [x] [CHK-23 Checklist mutations do not refresh topic activity](CHK-23-topic-activity-not-refreshed.md)
- [x] [CHK-24 Failed loads can display stale checklist data](CHK-24-failed-load-shows-stale-data.md)
- [x] [CHK-25 Invalid generation has no repair attempt](CHK-25-generation-has-no-repair-attempt.md)

## Suggested Order

No open confirmed or partially confirmed defects remain in this backlog. Future integration or benchmark work should create focused defects only when it reproduces incorrect behavior or exceeds a documented budget.
