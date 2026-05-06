The main thing to improve is trustworthiness. AGENTS.md is mostly solid on stable repo facts, but its backlog has drifted enough that a future agent could prioritize the wrong work.

Key findings:

The backlog in AGENTS.md does not match the checked-in raw coverage data in lcov.info. The clearest example is ProviderStore.ts, which AGENTS still treats as a low-coverage problem even though the current LCOV entry shows 227 of 245 lines covered, about 92.7%.
The same drift shows up for ProviderCard.tsx and Composer.tsx. Those both look much healthier in raw coverage than the older prose reports imply.
DebateView.tsx still looks like a real gap. I found the component, but no matching test file in the current tree.
COVERAGE_ANALYSIS.md appears stale relative to both the workspace and lcov.info, so AGENTS should not hard-code coverage percentages unless they are regenerated in the same change.
A smaller clarity fix: package.json already makes build run the version stamp automatically through prebuild, so that behavior can be explained more directly in the guide.
Plan

Keep the stable repo facts in AGENTS.md that still match package.json and the current source tree.
Rework the backlog so it separates persistent repo issues from coverage-driven opportunities, instead of mixing them together.
Remove or demote stale backlog items, especially the ProviderStore.ts item.
Keep or refresh items that still appear valid, especially the missing test coverage around DebateView.tsx.
Add a short note explaining trust order for coverage evidence: fresh test coverage run first, then lcov.info, then generated narrative docs like COVERAGE_ANALYSIS.md.
Tighten the command section so it reflects package.json exactly and makes the prebuild behavior clearer.
Do a final consistency pass so AGENTS.md, package.json, and the checked-in coverage artifacts no longer contradict each other.
I saved this plan in session memory. If this direction is right, approve it and I’ll hand it off for implementation.