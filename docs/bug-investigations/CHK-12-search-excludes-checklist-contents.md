# CHK-12: Search Excludes Checklist Contents

**Status:** Completed  
**Priority:** Medium

## Evidence

`GlobalSearch.searchChecklists` delegates only to topic search. It does not query `checklistGroups` or `checklistItems` for list titles, task text, or details.

## Suspicious Scenario

The Checklists search filter returns no result for text visibly present in a checklist unless the same text is also in the topic name.

## Verify

- [x] Include group titles, task text, and task details in checklist search.
- [x] Return one deduplicated result per matching topic.
- [x] Exclude deleted and non-checklist topics.
- [x] Apply the existing 20-result cap in Checklists and All modes.

## Verified Assessment

The behavior is confirmed: checklist search only searches checklist topic metadata. Whether that violates the product contract is not documented.

## What Should Be Done

- Confirm that “Checklists” search is expected to find group titles, task content, and details.
- If yes, build a checklist content index keyed to topic ID, deduplicate topic/content matches, and invalidate it after checklist mutations.
- Exclude deleted topics and cap result work for large datasets.
- Add tests for topic name, group title, task text, details, deduplication, and deleted-topic filtering.

## Completion

The Checklists and All search modes now build current topic-level entries from checklist topic names, group titles, task content, and task details. Results are naturally deduplicated to one entry per live checklist topic, include a matching snippet, navigate through the existing topic route, and retain the global 20-result cap.

The content is read from current tables for each debounced search, so checklist mutations do not leave a stale cached index. Executable search verification is deferred until the remediation pass is complete, as requested.
