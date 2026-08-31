# GEN-09: Provider and Model Lifecycle

**Status:** Completed  
**Priority:** High

## Evidence

Topics persist model IDs while providers and user models can be edited or deleted. Multiple modes select models through shared stores.

## Suspicion

Deleting or changing a provider can leave stale references, select unsupported capabilities, or silently fall back to an unexpected model.

## Verify

- [ ] Delete the active model in chat, debate, curator, and checklist modes.
- [ ] Delete a provider while a request is active.
- [ ] Reload topics containing stale model IDs.
- [ ] Verify fallback visibility and capability checks.

## Verified Assessment

Provider deletion applies a fallback and topic model restoration handles stale IDs. Continuing an already-started request with its captured model object is observable behavior, but not by itself a correctness defect.

## What Should Be Done

- Define whether deleting a model should cancel in-flight requests or affect only future requests.
- Add tests for stale topic IDs, provider deletion during a request, and capability changes between selection and send.
- If cancellation is required, connect provider/model deletion to active request controllers rather than merely rechecking state.

## Final Validation

ProviderStore, provider settings, model settings, ChatStore, and mode-specific tests pass in the full 951-test run; ProviderStore reports 87.41% branch coverage. No stale-reference defect was reproduced. In-flight deletion semantics remain a product decision rather than a confirmed bug.
