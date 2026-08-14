# Rendering Performance Remediation Plan

Remediation of the "Rendering Findings" from the Athena Audit Report. Decisions locked in:
**full transient streaming refactor**, **remove the legacy modelId backfill entirely**, and **cover
all items 1–8**. Virtualization (item 9) is deferred until after profiling.

## Verified findings

| # | Finding | Evidence |
|---|---|---|
| 1 | Whole-store subscriptions defeat `memo` | `MessageBubble.tsx:193` `useChatStore()`; `MessageList.tsx:130`; `Composer.tsx:134`; `ChatView.tsx:19` `useAuthStore()`. |
| 2 | Streaming rebuilds the full topic array | `ChatStore.ts:581` `updateMessageStateOnly` maps the whole array; called ~64 ms from `onTokenCallback`/`onReasoningCallback`, unthrottled from `onToolLogCallback`. Invalidates `MessageList.tsx:134`. |
| 3 | Broad subscriptions follow unrelated state | `Composer.tsx:141` pulls `messagesByTopic` for `fetchSuggestion`; re-renders throughout streaming. |
| 4 | Markdown re-parsed every update | `MarkdownWithCode.tsx:345` not memoized; `markdownComponents` recreated each render; `ReactMarkdown` reparses; `mermaid` statically imported. |
| 5 | Debate smooth-scrolls every token | `DebateView.tsx:42-44`. |
| 6 | Fuse indexes blanket-cleared | `GlobalSearch.tsx:129-136` clears all 5 indexes on `sidebarFilter` change. |
| 7 | Redundant all-message backfill | `TopicStore.ts:75-105` scans all messages whenever a topic lacks `modelId`. |
| 8 | Unbounded `messagesByTopic` cache | no eviction in `preloadTopics`/`fetchMessages`. |

Debate already models the fix for #2/#3: `DebateStore` keeps `streamingContentA/B` as transient state.

---

## Implementation

### 1. Focused selectors
Narrow subscriptions in `MessageBubble.tsx`, `MessageList.tsx`, `Composer.tsx`, `ChatView.tsx`:
- `MessageBubble`: select `summarizingMessageIds` + `failedSummaryMessageIds`; actions via `useChatStore.getState()`; narrow `useAuthStore`/`useUiStore`/`useTopicStore`/`useNotificationStore`.
- `MessageList`: select `visibleMessageCount`, `highlightedMessageId`.
- `Composer`: select the fields actually used; read `messagesByTopic` via `useChatStore.getState()` inside `fetchSuggestion`.
- `ChatView`: `useAuthStore((s) => s.chatWidth)` + `defaultMaxContextMessages`; `useChatStore` selectors.

### 2 & 3. Transient streaming state + commit-on-complete
- Add `streaming: { topicId; assistantMessageId; content; reasoning } | null` to `ChatStore`.
- `onTokenCallback`/`onReasoningCallback`/`onToolLogCallback` write transient `streaming` (throttled) instead of `updateMessageStateOnly`.
- `MessageList` renders historical groups unchanged and appends a `<StreamingMessage>` row for the active stream.
- On completion, the final transaction commits content/reasoning and clears `streaming`. `stopSending`/abort clear it too.

### 4. Memoize/defer Markdown
- `React.memo` on `MarkdownWithCode`; `useMemo` the `markdownComponents` map.
- Dynamic-import `mermaid` inside `MermaidDiagram`.

### 5. Throttle Debate scrolling
- `requestAnimationFrame`-coalesced; `auto` during streaming growth, `smooth` on message-count change.

### 6. Reuse Fuse indexes
- Key indexes by filter mode; invalidate only the affected index.

### 7. Remove legacy backfill
- Delete the `loadTopics` all-message `modelId` scan (v9 migration owns backfill).

### 8. Bounded messagesByTopic cache
- LRU eviction (~20 topics); never evict current topic or in-flight request.

---

## Testing

- Existing suites must stay green: `ChatStore`, `MessageList`, `MessageBubble`, `Composer`, `ChatView`, `DebateView`, `GlobalSearch`, `MarkdownWithCode`.
- New tests:
  - `ChatStore.test.ts`: transient streaming — `messagesByTopic` unchanged per-token, `streaming` updated; commit-on-complete finalizes; abort clears `streaming`.
  - `MessageList`: renders streaming row without regrouping history.
  - eviction: `preloadTopics` beyond cap evicts LRU topic.
  - `TopicStore.test.ts`: `loadTopics` no longer scans messages.
  - Markdown: `memo` prevents unrelated re-render.

### Run

```bash
npm run lint
npm test -- --testPathPattern="ChatStore|MessageList|MessageBubble|Composer|ChatView|DebateView|GlobalSearch|MarkdownWithCode|TopicStore" --watchAll=false
npm run build
npm run test:coverage
```
