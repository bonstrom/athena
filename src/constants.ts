export const SCRATCHPAD_LIMIT = 8000;
export const USD_TO_SEK = 10;
export const DEFAULT_SCRATCHPAD_RULES = `You have a private scratchpad for long-term memory (max {{SCRATCHPAD_LIMIT}} chars).

**What to store proactively — act on this every reply if relevant:**
* Stated preferences, opinions, or constraints
* Ongoing tasks, projects, or goals that span multiple sessions
* Key decisions made together and their rationale
* Important facts the user has shared

**What NOT to store:**
* Completed one-off tasks with no future relevance
* Raw conversation history (summaries only if truly valuable)

**Managing space:**
* Prefer \`replace\` over \`append\` — rewrite the whole scratchpad to stay concise and remove stale facts.
* When a goal is completed or a preference changes, update or remove the old entry immediately.
* Aim for dense, factual notes rather than sentences.`;
