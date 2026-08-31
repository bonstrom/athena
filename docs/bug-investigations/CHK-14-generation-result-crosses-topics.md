# CHK-14: Generation Result Crosses Topics

**Status:** Completed  
**Priority:** Critical

## Evidence

`generateChecklist(topicId, prompt)` awaits the LLM and then unconditionally replaces the global checklist state. The global `generating` flag is not tied to a topic, and navigation does not abort generation.

## Suspicious Scenario

Generation starts for topic A, the user navigates to topic B, and A's result later replaces B's visible groups and items. The records are persisted under A, so a reload makes the displayed result disappear from B.

## Verify

- [x] Defer A's LLM response and navigate to B before resolving it.
- [x] Inspect visible state, persistence, history, and topic naming after stale completion.
- [x] Confirm generation remains globally locked while one request is pending.
- [x] Track pending-generation topic deletion separately under `CHK-18`.

## Verified Assessment

Generation persists records for its supplied topic, then unconditionally replaces the one global checklist state. Navigation does not cancel or invalidate the pending result, so A can be rendered under B.

## What Should Be Done

- Bind generation state and completion to its topic and a request token.
- Before persistence, verify the topic still exists; before committing UI state, verify the request still owns the displayed topic.
- Do not let a stale completion clear another topic's generating/loading state.
- Add deferred navigation, deletion, and overlapping-attempt tests.

## Completion

Generation now claims `activeTopicId` when it starts and verifies that ownership immediately after the LLM response. If navigation has loaded another topic, the stale response is discarded before parsing, database writes, history updates, topic naming, or visible-state publication.

Added a deferred regression test that starts generation for topic A, loads topic B, resolves A, and verifies B retains ownership with no generated records, history, or naming side effects. Topic deletion remains covered by `CHK-18` rather than this navigation-race fix.

Validation:

- `npm test -- --testPathPattern="ChecklistStore" --watchAll=false` - 17 tests passed.
- `$env:DISABLE_ESLINT_PLUGIN='true'; npm run build` - compiled successfully.
- ESLint intentionally skipped at the user's request; the normal build is currently blocked by unrelated existing diagnostics in `ForkTabs.tsx` and `MarkdownWithCode.tsx`.
