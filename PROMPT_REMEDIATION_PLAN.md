# Prompt Audit Remediation Plan

Remediation of the "Prompt Audit" findings. Decisions locked in: **all six areas**, debate
consensus uses **anonymize + stable format** (no UI change), and Curator outline generation
**keeps `sendMessageStream`** for now.

## Findings (verified)

| # | Finding | Evidence |
|---|---|---|
| 1 | Inspector ≠ runtime prompts | `buildFullContext` (`ChatStore.ts:267`) has ask-user/retrieval/Curator; `sendMessageStream` (`:776`) omits them. |
| 2 | Custom instructions leak into every internal task | `llmService.ts:695` (`buildPayload`) prepends to naming/summary/suggestions/SVG/curator/debate; debate also adds its own (`DebateStore.ts:33`). |
| 3 | Inconsistent structured output | permissive curator parsing (`CuratorView.tsx:176-341`); two reply-suggestion parsers (`ChatStore.ts:1372/1400`). |
| 4 | Contradictory difficulty | `constants.ts:237` vs `:259`. |
| 5 | Dead Curator rules | `CURATOR_SYSTEM_PROMPT` inspector-only. |
| 6 | Part prompt repeats context | `constants.ts:170-226`. |
| 7 | Clickbait wording | `constants.ts:216`. |
| 8 | RAG elevated to system message | `TopicStore.ts:333`. |
| 9 | Retrieval limits disagree | `llmService.ts:98` "500 chars" vs `RAG_CONTENT_LIMIT=800`. |
| 10 | Debate review criticism-only / consensus Model A / duplicated prompts | `DebateStore.ts`. |

## Implementation

1. **Shared assembler** — `assembleChatSystemEntries(opts)` → `{content, sourceLabel}[]` (curator → LaTeX → SVG → scratchpad rules → scratchpad content → web search → ask-user → retrieval → predefined prompts). Used by `buildFullContext` (inspector) and `sendMessageStream` (runtime). Custom instructions remain a separate leading entry (inspector) and injected via `buildPayload` (runtime).

2. **Custom-instruction scope** — `LlmRequestOptions { includeCustomInstructions?: boolean }` (default `true`) on `askLlm`/`askLlmStream`/`buildPayload`; pass `false` for naming, summarization, reply suggestions, SVG edit, Curator ops; debate passes `false` (keeps its explicit `buildSystemMessage` injection, removing duplication).

3. **Structured schemas** — shared strict parser + per-schema validators; one repair retry; permissive aliases kept only for legacy persisted data.

4. **Curator** — level-conditional prerequisites + difficulty validation; split `CURATOR_SYSTEM_PROMPT` into operation-specific snippets; trim part prompt; replace clickbait phrasing.

5. **Core chat** — quoted RAG evidence with boundaries + do-not-follow-instructions; `READ_MESSAGES_TOOL` description generated from `RAG_CONTENT_LIMIT`; leave ask-user fallback undocumented.

6. **Debate** — structured review rubric; anonymized consensus with Common ground/Remaining disagreement/Bottom line; shared phase builders.

## Testing

- Prompt assembler includes ask-user/retrieval/curator when enabled.
- `askLlm`/`askLlmStream` callers pass `includeCustomInstructions: false` (naming/summary/suggestions/SVG/curator/debate).
- Strict parser rejects malformed JSON; legacy aliases still parse persisted data.
- Curator difficulty text is conditional; part prompt drops full outline; clickbait removed.
- RAG content has quoting boundaries.
- Debate review contains rubric; consensus anonymized + stable format; `continueDebate` reuses phase builders.

Run: `npm run lint`, `npm run test:coverage`, `npm run build`.
