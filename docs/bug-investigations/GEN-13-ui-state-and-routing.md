# GEN-13: UI State and Routing

**Status:** Completed  
**Priority:** High

## Evidence

The application combines lazy routes, global Zustand stores, IndexedDB loads, dialogs, notifications, and entities that can be deleted while selected.

## Suspicion

Late async results and stale selections may render deleted entities, overwrite the next route's state, or leave loading and dialog states attached to the wrong topic.

## Verify

- [x] Complete dedicated checklist route-race fixes.
- [x] Broadcast successful topic deletions across browser tabs.
- [x] Remove remotely deleted topics from local Zustand state.
- [x] Move an active deleted-topic route to an explicit not-found state.

## Verified Assessment

ChatStore contains topic-switch and deletion guards, but global async stores still rely on local checks and do not synchronize deletions across browser tabs. Checklist-specific stale-state failures are confirmed separately in `CHK-01`, `CHK-02`, `CHK-14`, and `CHK-24`.

## What Should Be Done

- Implement the checklist fixes in their dedicated files rather than a broad routing refactor.
- Add route-race tests for chat clarification, suggestions, debate, curator, and checklist modes.
- If cross-tab consistency is required, add a shared broadcast/storage invalidation mechanism and test two app contexts.

## Completion

Successful single and bulk topic deletions now publish a typed `BroadcastChannel` signal. Other tabs remove those IDs from `TopicStore` immediately. `ChatView` observes removal of its displayed topic and transitions to an explicit not-found state, hiding stale mode views and their mutation controls.

Checklist-specific stale load, edit, generation, and failed-load behavior was resolved in CHK-01, CHK-02, CHK-14, and CHK-24. Executable two-context route verification is deferred until the remediation pass is complete, as requested.
