# GEN-11: Rendering Security and Privacy

**Status:** Completed  
**Priority:** Critical

## Evidence

`src/components/MarkdownWithCode.tsx` renders model-controlled Markdown, SVG, MathML, code, and Mermaid with sanitization. API keys are recoverably obfuscated in local storage, and backups contain user data.

## Suspicion

Sanitizer configuration, URL protocols, rendered diagrams, logs, or exports may expose executable or sensitive content.

## Verify

- [x] Retain existing hostile SVG and event-handler sanitizer coverage.
- [x] Identify privacy transparency as the only verified unresolved gap.
- [x] Disclose recoverable local obfuscation beside both API-key controls.
- [x] Warn against saving keys on shared devices.

## Verified Assessment

Hostile SVG and event-handler sanitization already have focused `MarkdownWithCode` tests, so no current executable rendering defect was found. The Settings UI does not visibly disclose that API keys are only obfuscated in localStorage, leaving the privacy-transparency part unresolved.

## What Should Be Done

- Add a concise notice beside provider API-key controls explaining recoverable local obfuscation and shared-device risk.
- Keep the existing sanitizer regression tests and add URL-protocol cases only where absent.
- Verify errors, exports, and logs never contain plaintext credentials.

## Completion

Both add-provider and edit-provider API-key fields now state that keys are stored locally using recoverable obfuscation rather than encryption and warn against saving keys on shared devices. This resolves the verified privacy-transparency gap without weakening or changing existing rendering sanitization.

Broader protocol and credential-leak fuzz verification remains deferred to the final verification pass, as requested.
