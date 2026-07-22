export const LATEX_INSTRUCTIONS = `You can use LaTeX syntax for mathematical expressions: \`$...$\` for inline math and \`$$...$$\` for display (block) math.`;

export const SVG_INSTRUCTIONS = `You can output SVG code to create visualizations, diagrams, charts, or illustrations directly in your responses. Wrap the SVG in a markdown code block with the language tag \`\`\`svg, and ALWAYS close the code block with \`\`\` on its own line after the SVG. The SVG will be rendered inline in the chat. Keep SVGs reasonably sized and use viewBox for responsiveness.

Example:
\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="blue" />
</svg>
\`\`\`
Note: it is critical to end the code block with \`\`\` after the closing </svg> tag, otherwise the rest of your response will not render correctly.`;

export const SHORTENED_ID_LENGTH = 8; // prefix length for shortened UUID display

export const SCRATCHPAD_LIMIT = 8000;
export const SHORT_SCRATCHPAD_RULES = `You have a private scratchpad for long-term memory (max {{SCRATCHPAD_LIMIT}} chars). Proactively store user preferences, goals, key decisions, and message bookmarks. Prefer 'replace' over 'append' to stay concise.`;
export const USD_TO_SEK = 10;

export const DEEPSEEK_PEAK_HOURS_UTC: { start: number; end: number }[] = [
  { start: 1, end: 4 },  // 01:00–04:00 UTC
  { start: 6, end: 10 }, // 06:00–10:00 UTC
];

export const DEEPSEEK_PEAK_MULTIPLIER = 2;

// RAG (Retrieval-Augmented Generation) tuning constants
export const RAG_TOP_K = 5; // number of semantically similar messages to retrieve
export const RAG_MIN_SCORE = 0.3; // discard weakly-related matches below this cosine similarity
export const RAG_MAX_CHARS = 4000; // hard cap on total RAG block size injected into context
export const RAG_CONTENT_LIMIT = 800; // truncate individual messages; LLM can fetch full content via read_messages
export const MESSAGE_RETRIEVAL_INSTRUCTIONS = `You have access to historical messages via list_messages and read_messages tools.
IMPORTANT: Messages in your context may be truncated (marked with [TRUNCATED]). When the user asks about specific past messages, quotes, or details from earlier in the conversation, you MUST call read_messages to fetch the full content before answering. Do NOT guess or rely on truncated previews — always verify with the tool.`;
export const ASK_USER_INSTRUCTIONS = `When information is insufficient to answer confidently, follow this decision hierarchy:
1. If you can answer with confidence — answer directly.
2. If the answer might exist in conversation history — use list_messages / read_messages to find it.
3. If genuinely uncertain after searching — call the ask_user tool to request clarification with one targeted question.
4. Never guess or produce lengthy speculation when a short clarifying question would be more helpful.
IMPORTANT: When you need to ask the user a question, you MUST use the ask_user tool. Do NOT embed questions in your reply text. Always call ask_user instead of writing a question directly.`;

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
