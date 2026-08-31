# CHK-21: Checklist Details Need Hostile-Rendering Coverage

**Status:** Dismissed  
**Priority:** High

## Evidence

Checklist details can originate from users, models, or imports and are persisted before being rendered by `MarkdownWithCode` when expanded. Existing ChecklistView tests replace `MarkdownWithCode` with a plain mock, so they do not exercise sanitization or expensive render paths here.

## Suspicious Scenario

Hostile SVG, HTML, links, Mermaid, MathML, or deeply nested Markdown stored in item details bypasses an expected sanitizer boundary or freezes the view when expanded.

## Verify

- [ ] Render checklist details with the real Markdown component and hostile fixtures.
- [ ] Inspect DOM attributes and URL protocols after sanitization.
- [ ] Test very large and deeply nested Markdown.
- [ ] Verify imported and LLM-generated details use the same safe path.

## Verified Assessment

Checklist details use the shared `MarkdownWithCode` component, whose focused tests already cover script tags and event-handler sanitization. Mocking that child in ChecklistView unit tests is appropriate isolation and does not establish a checklist-specific vulnerability.

## What Should Be Done

- Do not change ChecklistView for this lead.
- Maintain hostile-rendering tests at the shared `MarkdownWithCode` boundary.
- Add a single integration smoke test only if future checklist code bypasses that component or supplies a different sanitizer configuration.
