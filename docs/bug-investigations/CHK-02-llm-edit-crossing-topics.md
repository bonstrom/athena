# CHK-02: LLM Edit Crossing Topics

**Status:** Completed  
**Priority:** Critical

## Evidence

`applyLlmEdit` starts for a supplied `topicId`, but each tool execution reads the current global checklist through `get()`. Navigation can replace that state while the old tool loop remains active. Existing update/delete tools resolve IDs from whichever checklist is currently loaded.

## Suspicious Scenario

An edit started on topic A continues after navigation to B. A later tool call resolves and mutates B's groups or items, while newly created groups use A's `topicId`.

## Verify

- [x] Pause the tool loop after its first call.
- [x] Load topic B, then release another A tool call.
- [x] Inspect topic-scoped target resolution and visible Zustand state.
- [x] Guard all update, delete, add, and reorder tools through the shared executor.

## Verified Assessment

The edit request keeps its original `topicId`, but every tool call resolves existing IDs from the current global checklist arrays. Navigation can replace those arrays while the old loop continues, allowing updates or deletes against another topic's records.

## What Should Be Done

- Bind each edit session to a topic and abort or ignore it when that topic is no longer active.
- Resolve existing records from topic-scoped data, not whichever checklist is currently loaded.
- Before every persistent tool mutation, verify the target record belongs to the edit session's topic.
- Add deferred multi-tool tests that load B between A's tool calls and cover add, update, delete, and reorder.

## Completion

Added explicit `activeTopicId` ownership to `ChecklistStore`. Loads claim ownership immediately, tool targets are filtered to groups and items belonging to the edit topic, and tool execution plus final edit completion abort after a topic change.

Added focused tests proving that a late tool cannot mutate topic B and a late final response cannot publish its summary or history under topic B.

Validation:

- `npm test -- --testPathPattern="ChecklistStore" --watchAll=false` - 16 tests passed.
- `npx eslint src/store/ChecklistStore.ts src/store/__tests__/ChecklistStore.test.ts` - passed.
- `$env:DISABLE_ESLINT_PLUGIN='true'; npm run build` - compiled successfully.
