# Task 8: Deprecated Dependency Remediation

Date: 2026-10-27

Status: Not started. Warning inventory captured; dependency upgrades and security verification have not been performed.

## Goal

Resolve the deprecated packages reported by the user's successful `npm install`. Every warning below needs either remediation through its owning dependency or a documented, time-bounded deferral. Deprecation alone does not establish an exploitable vulnerability or production exposure.

The current [package manifest](../../package.json) directly declares `eslint` at `8.57.0` and `react-scripts` at `5.0.1`. The other warned packages are not directly declared. Determine their actual dependency chains before choosing changes; do not assume CRA owns every warning.

## Warning Inventory

Priorities are triage order, not verified security severity. Replacement names below come from the supplied warnings or describe a migration direction; version, platform, and API compatibility still need verification.

### Investigate First

| Package/version | Reported concern | Required action |
| --- | --- | --- |
| `glob@10.5.0` | Unsupported; warning explicitly reports security vulnerabilities. | Identify every parent path and applicable advisories. Upgrade the owning packages to versions using supported, patched glob releases; verify the installed result. |
| `core-js@3.18.3` | Unsupported; warning reports severe feature-detection slowdowns and web compatibility issues in old releases. | Find the polyfill owner and update to a maintained compatible release. Check whether this version reaches the browser bundle and test the supported browser targets. |
| `inflight@1.0.6` | Unsupported and reported to leak memory. | Remove via parent upgrades/replacements. If directly using its behavior is ever discovered, evaluate a maintained request-coalescing implementation such as `lru-cache`; do not treat it as a drop-in transitive override. |

### Tooling and Build Dependencies

| Package/version | Reported concern | Required action |
| --- | --- | --- |
| `eslint@8.57.0` | Unsupported ESLint release. | Plan a supported ESLint upgrade together with compatible TypeScript/React plugins and configuration. Check CRA's lint integration before changing major versions. |
| `@humanwhocodes/config-array@0.11.14` | Deprecated in favor of `@eslint/config-array`. | Upgrade the owning lint tooling; verify the legacy package disappears from every parent path. |
| `@humanwhocodes/object-schema@2.0.3` | Deprecated in favor of `@eslint/object-schema`. | Address through compatible lint-toolchain upgrades rather than adding the replacement alongside the old dependency. |
| `@babel/plugin-proposal-nullish-coalescing-operator@7.18.6` | Standardized syntax; proposal plugin no longer maintained. | Upgrade the owning preset/toolchain to use `@babel/plugin-transform-nullish-coalescing-operator`. |
| `@babel/plugin-proposal-private-methods@7.18.6` | Standardized syntax; proposal plugin no longer maintained. | Upgrade the owning preset/toolchain to use `@babel/plugin-transform-private-methods`. |
| `@babel/plugin-proposal-class-properties@7.18.6` | Standardized syntax; proposal plugin no longer maintained. | Upgrade the owning preset/toolchain to use `@babel/plugin-transform-class-properties`. |
| `@babel/plugin-proposal-numeric-separator@7.18.6` | Standardized syntax; proposal plugin no longer maintained. | Upgrade the owning preset/toolchain to use `@babel/plugin-transform-numeric-separator`. |
| `@babel/plugin-proposal-private-property-in-object@7.21.11` | Standardized syntax; proposal plugin no longer maintained. | Upgrade the owning preset/toolchain to use `@babel/plugin-transform-private-property-in-object`. |
| `@babel/plugin-proposal-optional-chaining@7.21.0` | Standardized syntax; proposal plugin no longer maintained. | Upgrade the owning preset/toolchain to use `@babel/plugin-transform-optional-chaining`. |
| `rimraf@3.0.2` | Releases before v4 are unsupported. | Upgrade the parent to a supported rimraf dependency; check Node requirements and API changes. |
| `glob@7.2.3` | Releases before v9 are unsupported. | Upgrade each owning package. Treat this separately from the warned `glob@10.5.0` installation; reaching v9 alone is not a lasting support policy. |
| `rollup-plugin-terser@7.0.2` | Deprecated in favor of `@rollup/plugin-terser`. | Upgrade the owning bundler integration and verify production minification. |
| `sourcemap-codec@1.4.8` | Deprecated in favor of `@jridgewell/sourcemap-codec`. | Upgrade the parent and verify generated source maps remain usable. |
| `svgo@1.3.2` | Unsupported SVGO major. | Upgrade the parent to a maintained SVGO integration, accounting for configuration/API changes. Check rendered SVG output. |
| `prebuild-install@7.1.3` | No longer maintained. | Identify the native addon owner and its supported installation path. Upgrade or replace the addon owner; verify installation on supported platforms. |

### Legacy Compatibility and Service-Worker Packages

| Package/version | Reported concern | Required action |
| --- | --- | --- |
| `stable@0.1.8` | Native JavaScript sorting is now stable. | Upgrade/remove the parent dependency that still requires the polyfill, considering the supported engines. |
| `q@1.5.1` | Legacy Promise library; migration to native promises recommended. | Upgrade or replace the owner. Preserve error/async behavior if application-level migration is needed. The warning's CapTP alternatives are not a general replacement recommendation for this app. |
| `abab@2.0.6` | Native `atob()`/`btoa()` recommended. | Upgrade the compatibility/test-environment owner; verify encoding behavior in the supported runtimes. |
| `domexception@2.0.1` | Native `DOMException` recommended. | Upgrade the environment/polyfill owner and verify exception names and abort handling in tests. |
| `w3c-hr-time@1.0.2` | Native `performance.now()` and `performance.timeOrigin` recommended. | Upgrade the environment owner and verify timing-dependent tests. |
| `workbox-cacheable-response@6.6.0` | npm marked deprecated; supplied warning text only names Workbox packages and is not a clear migration instruction. | Inspect registry metadata, the owning Workbox integration, and upstream guidance before selecting an upgrade/removal. Do not assume `workbox-background-sync` is a drop-in replacement. |
| `workbox-google-analytics@6.6.0` | Unmaintained and incompatible with GA4. | Determine whether it is used or merely installed transitively. Remove an unused integration; replace any actual analytics/offline-queue behavior with a supported approach rather than retaining the obsolete package. |

## Execution Plan

1. Capture the Node/npm versions, install output, and resolved dependency tree. Use `npm explain <package>` for each inventory entry and account for multiple installed versions/parent paths. Record runtime versus build/test-only use separately.
2. Run `npm audit --json` and inspect applicable advisories, including their affected ranges and reachability. Record the security result separately from npm's deprecation text; audit output alone does not prove browser exploitability.
3. Group remediation by direct dependency owner. Prefer compatible owner upgrades, then supported replacements. Do not install replacement leaf packages merely to make them appear in the manifest, edit installed package files, suppress logging, or use `npm audit fix --force` as the plan.
4. If `react-scripts@5.0.1` prevents supported dependencies, present a separate build/test-toolchain migration decision with effort, compatibility risks, and deployment implications. Do not silently expand this task into a framework migration.
5. Add reusable regression tests in the existing suite for behavior affected by replacements. Keep dependency updates in small, independently verifiable groups. Use overrides only with explicit compatibility evidence and a removal plan.
6. Reinstall reproducibly using the project's chosen lockfile policy. Compare warnings and dependency paths with the baseline, and document each remaining warning's owner, reason, risk, and follow-up date.

## Acceptance Criteria

- Every package/version in this inventory has a recorded outcome: removed, upgraded through its owner, or explicitly deferred with rationale and a follow-up date.
- Applicable security advisories are resolved or explicitly accepted with evidence; do not equate warning suppression with remediation.
- A clean install succeeds without unexpected new deprecations, peer-dependency conflicts, or native-addon installation failures. Remaining accepted warnings are listed explicitly.
- `npm run lint`, `npm run test:coverage`, and `npm run build` pass. Use `npm test` for focused regressions, not a standalone Jest invocation that bypasses CRA configuration.
- Startup, production asset loading at the configured GitHub Pages base path, routing, embedding-worker loading, Markdown/SVG rendering, and backup import/export still work. Check service-worker behavior only if an actual registration/integration is present.
- Do not remove lint/type checks, tests, browser support, or functionality simply to make the installation quiet. This task records work to be done; no dependency changes have been made as part of creating it.