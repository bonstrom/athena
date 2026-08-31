# CHK-09: Duplicate IDs Accepted During Reorder

**Status:** Completed  
**Priority:** High

## Evidence

Reorder tools require the supplied ID array length to equal the current record count, then resolve each ID independently. `resolveAllById` does not require uniqueness or prove that every current record appears once.

## Suspicious Scenario

For groups A and B, `[A, A]` passes the length and resolution checks. A is updated twice, B retains its old order, and duplicate sort positions can result while the tool reports success.

## Verify

- [x] Reject duplicate resolved group IDs and omitted siblings.
- [x] Apply the same shared validation to item reorder.
- [x] Require the resolved set to equal the current sibling set.
- [x] Reject mixed full IDs and prefixes that resolve to one record.

## Verified Assessment

Length validation does not establish a permutation. Duplicate identifiers resolve successfully, one record can be written multiple times, and omitted records retain conflicting order values.

## What Should Be Done

- Resolve all IDs, reject ambiguity, then require resolved IDs to be a unique set exactly equal to the current sibling-ID set.
- Apply this shared permutation validator to group and item reorder tools.
- Add tests for duplicates, omissions, unknown IDs, mixed aliases of the same ID, and a valid permutation.
- Assert both state and IndexedDB have contiguous unique orders after success.

## Completion

The shared reorder resolver now requires equal cardinality, successful unambiguous resolution, unique resolved record IDs, and exact equality with the current sibling-ID set. Both group and item reorder tools therefore accept only true permutations and reject duplicate aliases, omissions, and unknown IDs before persistence.

Executable verification is deferred until the remediation pass is complete, as requested.
