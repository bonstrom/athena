export const SCRATCHPAD_LIMIT = 8000;
export const SHORT_SCRATCHPAD_RULES = `You have a private scratchpad for long-term memory (max {{SCRATCHPAD_LIMIT}} chars). Proactively store user preferences, goals, key decisions, and message bookmarks. Prefer 'replace' over 'append' to stay concise.`;
export const USD_TO_SEK = 10;

// RAG (Retrieval-Augmented Generation) tuning constants
export const RAG_TOP_K = 5; // number of semantically similar messages to retrieve
export const RAG_MIN_SCORE = 0.3; // discard weakly-related matches below this cosine similarity
export const RAG_MAX_CHARS = 4000; // hard cap on total RAG block size injected into context
export const RAG_CONTENT_LIMIT = 250; // truncate individual messages; LLM can fetch full content via read_messages
export const DEFAULT_SCRATCHPAD_RULES = `You have a private scratchpad for long-term memory (max {{SCRATCHPAD_LIMIT}} chars).

**What to store proactively — act on this every reply if relevant:**
* Stated preferences, opinions, or constraints
* Ongoing tasks, projects, or goals that span multiple sessions
* Key decisions made together and their rationale
* Bookmarks for critical historical messages (e.g. "[Bookmarked ID: xxxxxxxx] - pactl digital audio routing config"). ALWAYS include a concise label so you know what the ID contains without wasting space.
* Important facts the user has shared

**What NOT to store:**
* Completed one-off tasks with no future relevance
* Raw conversation history (summaries only if truly valuable)

**Managing space:**
* Prefer \`replace\` over \`append\` — rewrite the whole scratchpad to stay concise and remove stale facts.
* When a goal is completed or a preference changes, update or remove the old entry immediately.
* Aim for dense, factual notes rather than sentences.`;
