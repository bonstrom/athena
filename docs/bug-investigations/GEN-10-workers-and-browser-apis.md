# GEN-10: Workers and Browser APIs

**Status:** Completed  
**Priority:** Medium

## Evidence

Local inference and embeddings use workers; speech, camera, storage, and idle scheduling depend on optional browser APIs.

## Suspicion

Worker creation, model download, permission denial, timeout, and unsupported APIs may leave unresolved promises, stale progress, or no recovery action.

## Verify

- [ ] Block worker construction and model downloads.
- [ ] Abort during initialization and active inference.
- [ ] Deny speech/camera permissions and remove optional browser APIs.
- [ ] Repeatedly mount and unmount consumers while checking worker cleanup.

## Verified Assessment

Worker error handlers, termination, and model-load timeout handling exist. No lifecycle leak or unresolved promise was proven.

## What Should Be Done

- Test constructors that throw, crashes with pending requests, initialization timeout, and component unmount.
- Verify every pending request settles exactly once and progress state returns to idle or error.
- Add browser-capability tests for denied permissions and absent optional APIs.

## Final Validation

Worker, embedding, media, and speech lifecycle tests pass in the full 951-test run, and the production build passes. No unresolved request or lifecycle leak was reproduced. Permission denial and absent-API behavior remain browser-integration coverage.
