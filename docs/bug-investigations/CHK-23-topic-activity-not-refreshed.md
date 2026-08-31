# CHK-23: Checklist Mutations Do Not Refresh Topic Activity

**Status:** Completed  
**Priority:** Medium

## Evidence

ChecklistStore CRUD, reorder, generation, and LLM edit paths do not call `TopicStore.updateTopicTimestamp`. Topic lists sort by `updatedOn`, while checklist data lives outside normal chat messages that may otherwise refresh topic activity.

## Suspicious Scenario

A heavily edited checklist remains buried at its old sidebar position and appears inactive because its topic timestamp never reflects checklist changes.

## Verify

- [x] Refresh activity after successful manual checklist mutations.
- [x] Refresh activity after successful generation and AI tool mutations.
- [x] Resolve item-only ownership from persisted item and group records.
- [x] Exclude failed and cancelled operations from timestamp updates.

## Verified Assessment

No checklist mutation updates `Topic.updatedOn`, while chat activity does. Consequently checklist work does not move the topic in the sidebar's recent ordering.

## What Should Be Done

- Define which successful checklist mutations count as activity; generation, AI edits, and content changes should be explicit decisions.
- Update the owning topic only after the checklist mutation commits, in a transaction where atomicity matters.
- Ensure item-only methods can resolve the owning topic without relying on currently displayed global state.
- Add timestamp and sidebar-order tests for each selected mutation; failures and cancelled edits must not update activity.

## Completion

Successful checklist creation, content changes, toggles, deletion, reordering, generation, and LLM tool mutations now call the established `TopicStore.updateTopicTimestamp` API after their checklist write commits. Item-only operations resolve topic ownership through persisted item and group records rather than assuming the currently displayed arrays own the record.

Failed, stale, and cancelled operations do not touch topic activity. Executable timestamp and sidebar-order verification is deferred until the remediation pass is complete, as requested.
