# Task 3: Context Selection and Fork Isolation

Date: 2026-10-27

Status: Review complete. Four findings; no application fixes implemented.

## Scope

Reviewed `getTopicContext`, recent/pinned message selection, response-version fallback, RAG candidates, retry cutoffs, `buildFullContext`, runtime message mapping, final payload trimming, and the context inspector's budget simulation. Inspected nearby tests and the prior [GEN-08 investigation](../bug-investigations/GEN-08-context-construction-and-rag.md), without treating its closure as proof of correctness.

Task 2's Anthropic tool-history trimming defect is not repeated. No cross-fork disclosure is claimed: the focused isolation control passed.

## Findings

### CTX-01: A deleted active response can hide an older valid answer from all context

Priority: Medium.

Locations: [assistant version index](../../src/store/TopicStore.ts#L230), [active-response selection](../../src/store/TopicStore.ts#L254), [request sets active response](../../src/store/ChatStore.ts#L1030), [failed request deletes that response](../../src/store/ChatStore.ts#L1454), [manual assistant deletion](../../src/store/ChatStore.ts#L439).

Trigger and path:

1. A user message has a surviving assistant response A1 and a newer selected response A2.
2. A2 is deleted or a regeneration fails after setting `activeResponseId` to A2. The failure path marks A2 deleted without restoring the previous active response. Manual assistant deletion likewise does not repair the parent's active-response pointer.
3. `getTopicContext` skips deleted messages but still accepts the parent's stale active-response ID when considering A1. Since A1 does not match that ID, it is excluded.
4. Without an explicit active-response ID, the fallback can fail the same way: `assistantByParent` includes deleted versions, so its newest entry can be A2, which is subsequently skipped.

Impact: A valid older answer silently disappears from the conversation supplied to the model. Pinned selection, RAG, and the history directory all derive from the same active sequence, so they cannot restore that answer. The next turn can retain the user's question while losing its surviving response.

Evidence: Executed the actual `getTopicContext` function with a real in-memory implementation of its topic/fork query predicates. With `activeResponseId: 'a2'`, surviving A1, and deleted A2, the result included the user but no assistant. A second fixture without the active pointer produced the same omission because the fallback index chose deleted A2. The request-failure and manual-deletion paths were inspected, not executed end to end in these probes.

Suggested fix: Resolve versions from eligible, non-deleted responses. Validate a stored active-response ID against those candidates, with an explicit fallback policy if it is missing or deleted. Repair the pointer when deleting a selected response or rolling back a failed regeneration. Keep the same policy across rendering, context selection, and retrieval.

Regression tests: Delete the selected response while an older response survives; fail a regeneration after its active pointer is assigned; and test a legacy user without a pointer whose newest version is deleted. Assert the intended surviving answer reaches base context and can be retrieved, while intentionally inactive versions remain excluded.

### CTX-02: RAG reinjects messages already present in the normal context

Priority: Medium.

Locations: [base IDs and candidate construction](../../src/store/TopicStore.ts#L332), [retrieved pair construction](../../src/store/TopicStore.ts#L346), [history-directory deduplication](../../src/store/TopicStore.ts#L417).

Trigger and path: A recent or pinned message has an embedding and ranks among the semantic matches. The code creates `baseIds`, but does not exclude those IDs from the search candidates or the triggering retrieved messages. It only uses the set to avoid adding an already-present companion assistant response. The triggering message can therefore be emitted once as an ordinary message and again inside `__rag_context__`.

Impact: Duplicate evidence consumes context and the RAG character budget. Already-retained matches also compete for the top-K retrieval slots, potentially displacing older material that is actually outside the recent window. Deduplicating the history directory against RAG IDs does not solve duplication between RAG and base context.

Evidence: Executed the actual selector with one recent user/assistant pair, an embedding on the user message, and a high-scoring search result referring to that same user. The result retained the original user row and included its exact content again in the generated RAG system message. The search implementation was mocked to return the eligible candidate; it was not given any foreign-fork or post-cutoff row.

Suggested fix: Exclude base-context IDs before top-K selection and defensively deduplicate expanded pairs against both base IDs and previously injected IDs. If enriching an already-truncated base entry is intentional, replace or enrich that entry explicitly rather than duplicating it in another message.

Regression tests: Return recent, pinned, and out-of-window matches together. Assert base messages occur only once, outside-window messages remain eligible for top-K, and paired responses do not duplicate either base context or another retrieved pair. Preserve the existing history-directory deduplication checks.

### CTX-03: The context inspector omits image parts sent by runtime assembly

Priority: Medium.

Locations: [inspector message assembly](../../src/store/ChatStore.ts#L380), [runtime attachment mapping](../../src/store/ChatStore.ts#L796), [current-message attachment mapping](../../src/store/ChatStore.ts#L853).

Trigger and path: A historical user message has an image attachment and the selected model supports vision. Runtime assembly produces a content array containing both the text part and an `image_url` part. `buildFullContext` always assigns `content: m.content` for historical messages, losing the attachment representation. Its current-message preview also accepts only a text string, not pending attachments.

Impact: The inspector does not accurately disclose the content being sent to the model. A user inspecting a seemingly text-only history can still send an attached image in the actual request. Any context estimate based on those inspector entries is also not a complete account of the multimodal request; this review does not claim an exact provider-specific image-token count.

Evidence: Executed the actual `buildFullContext` and shared system-entry assembler, then executed the exact runtime `existingContext.map` block against the same historical image fixture and vision-capable model. The inspector entry's content was a string; the runtime message contained an `image_url` part. This compared actual assembly code, not rendered screenshots or a live provider request.

Suggested fix: Share conversation-to-LLM-message mapping between runtime and inspector, including attachment capability checks. Extend the inspector's preview inputs to include pending attachments if it is intended to show the next request. Represent image costs as an explicit estimate or unknown where exact provider accounting is unavailable.

Regression test: For the same model/state, compare inspector message parts with the captured outgoing request for an older image attachment and a newly attached image. Include a text-only model to verify both paths consistently omit unsupported image parts. Never log real attachment contents or API keys in the test.

### CTX-04: The inspector's budget simulation disagrees with runtime trimming

Priority: Medium.

Locations: [inspector effective budget](../../src/components/TopicContextDialog.tsx#L51), [inspector trimming simulation](../../src/components/TopicContextDialog.tsx#L90), [runtime completion reserve](../../src/services/llmService.ts#L955), [runtime minimum-retention policy](../../src/services/llmService.ts#L961).

Trigger and path: The dialog uses the minimum of the user token limit and 90% of the model window as its input budget. Runtime subtracts `maxTokensOverride ?? 4096` from that value before deciding what conversation history fits. Thus a message set can appear fully included in the inspector but be trimmed before sending. In addition, the dialog removes individual non-system messages without reproducing runtime's minimum-two-message and atomic tool-group rules.

Impact: The inspector can label messages as included even though the next request drops them, making it unreliable for diagnosing lost conversational context. In other boundary cases its local simulation can drop messages runtime retains. This finding concerns inconsistent simulation, not a claim that the minimum-retention policy itself is necessarily wrong.

Evidence: Executed the actual dialog simulation callback and actual `buildPayload` against four alternating messages with 1,000-character contents, a 6,000-unit user limit, a sufficiently large model window, and a 4,096-unit completion reserve. Using the actual estimator with a mocked character-count encoder, the inspector marked zero messages dropped, while runtime retained only two. Both paths used the same deterministic estimator; provider tokenization was not measured.

Suggested fix: Use one shared payload-selection/budgeting function for runtime and preview, returning retained and dropped message metadata. Apply the same completion reserve, model-specific role rules, and tool-history grouping. Keep tool-schema and multimodal overhead accounting explicit rather than presenting a separate heuristic as equivalent to runtime.

Regression tests: Compare displayed retained/dropped IDs with a captured final request just below, at, and above the input budget. Vary completion overrides, large system instructions, tool groups, and the minimum retained conversation count. Test the final serialized request, not just `getTopicContext` output.

## Verified Controls and Remaining Limits

- A focused selector control contained another fork, two assistant versions, a retry boundary, and future messages. Only the selected fork's active response before the cutoff survived; excluded rows were also absent from the candidates passed to semantic search. No cross-fork or post-retry RAG leak was reproduced.
- The retry cutoff itself is applied before recent, pinned, directory, and RAG construction. CTX-01 concerns stale version selection, not evidence that the cutoff is ignored.
- Topic-level pinning exempts messages from the initial snippet truncation. It does not by itself prove final retention after provider-level budgeting; no independent pin-retention defect is asserted here without an agreed policy.
- The selector reserves a fraction of the configured token budget for the recent window. Actual prompt size can still depend on system instructions, summaries, retrieval wrappers, tool schemas, reasoning, and images. Exact provider limits and malformed embedding-vector handling were not validated in a browser or against live APIs.
- The inspector and runtime also differ in scratchpad wrapping and sprite-specific prompt assembly on inspection. Those were not separately reproduced here and are not counted as additional findings.
- Task 2 already records Anthropic tool-group corruption under trimming. CTX-04 does not count that same protocol failure again.

## Validation and Existing Coverage

- Application code, tests, and dependencies were not changed.
- Source-extracted probes used Node v26's `node:module.stripTypeScriptTypes` and `node:vm` against the current functions. Executed code included `getTopicContext`, `mergeClarifications`, `buildFullContext`, `assembleChatSystemEntries`, runtime conversation mapping, `buildPayload`, `findOldestRemovableUnit`, `estimateTokens`, and the dialog simulation callback.
- Five defect observations support the four findings: RAG duplication; stale explicit active pointer; deleted latest-version fallback; missing inspector image parts; and budget-simulation disagreement. One separate fork/version/retry isolation control passed. The probe's final console summary misstated the defect-observation count as six; the individual assertions and this report account for five.
- Database queries, stores, semantic ranking, static prompt values, peripheral payload helpers, and the encoder were mocked. Query mocks applied the actual topic/fork predicates. No real IndexedDB, embedding worker, browser, or provider integration was exercised.
- Existing suite command attempted: `npm test -- --testPathPattern="(TopicStore|ChatStore|TopicContextDialog|estimateTokens|llmService)\.test\.(ts|tsx)$" --watchAll=false --runInBand`.
- Result: Blocked before Jest started because `react-scripts` is unavailable. No claim is made that these suites pass or fail.
- [Topic context tests](../../src/store/__tests__/TopicStore.test.ts#L198) cover normal retrieval, truncation, minimum recent history, retry cutoff, and valid active-version selection. The new fixtures exercise already-retained RAG matches and deleted/missing active-response candidates.
- [Inspector-building tests](../../src/store/__tests__/ChatStore.test.ts#L1376) cover prompt and message entry construction. They do not establish parity with the final multimodal, budgeted provider request.

Recommended next step: Add the deterministic regressions above when dependencies are available, then implement fixes separately. Tasks 4-7 remain unreviewed.