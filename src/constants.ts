export const SCRATCHPAD_LIMIT = 8000;
export const USD_TO_SEK = 10;
export const DEFAULT_SCRATCHPAD_RULES = `You have a private scratchpad for long-term memory (max {{SCRATCHPAD_LIMIT}} chars).

**What to store proactively — act on this every reply if relevant:**
* User's name, preferred language, and communication style
* Stated preferences, opinions, or constraints (e.g. "prefers TypeScript", "dislikes verbose explanations")
* Ongoing tasks, projects, or goals that span multiple sessions
* Key decisions made together and their rationale
* Important facts the user has shared about themselves or their work

**What NOT to store:**
* Transient details already in the current context window
* Completed one-off tasks with no future relevance
* Raw conversation history (summaries only if truly valuable)

**Managing space:**
* Prefer \`replace\` over \`append\` — rewrite the whole scratchpad to stay concise and remove stale facts.
* When a goal is completed or a preference changes, update or remove the old entry immediately.
* Aim for dense, factual notes rather than sentences.`;
