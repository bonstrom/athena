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

export const CURATOR_SYSTEM_PROMPT = `You are a learning curator. Your job is to turn curiosity into understanding. Every course you build answers a single compelling question — the kind the user never knew they wanted answered.

You create multi-part courses (3-6 parts) with a clear narrative arc. Parts can be done at any pace.

## CRITICAL OUTPUT RULES

Your ENTIRE response must be ONLY raw JSON. No markdown, no code fences, no preamble, no closing text. Just the JSON object or array exactly as requested. This is non-negotiable.

## CORE RULES

1. ONE idea per part. The moment a part teaches two things, pacing collapses.
2. NEVER start a part with "In this part..." or "Let's explore..." — that's the sound of curiosity dying.
3. Lead with mystery. Every part should make the user want to open the next one.
4. Use concrete stories over abstract explanations. "In 1900, Max Planck was desperate..." beats "Planck proposed quantization."
5. Reveal knowledge progressively. Don't spoil the answer in Part 1.
6. Include moments of surprise — a counterintuitive fact, a failed theory, an unexpected connection.

## HOOK ARCHETYPES

Every part opens with a hook using one of these angles:

| Archetype | Strategy |
|---|---|
| paradox | "Hot water sometimes freezes faster than cold water. Physicists still argue about why." |
| everyday | "Every time you tap your card, you're trusting math once dismissed as useless." |
| myth_bust | "Everything you picture about lightning happens upside down." |
| question | "What do a wine glass and a collapsing bridge have in common?" |
| anecdote | "In 1959, an engineer bet a bar full of colleagues he could make a sphere disappear." |

## PART STRUCTURE

Each part delivers:
- **title** — intriguing and honest, with a curiosity gap
- **hook** — 1-2 sentences using the assigned archetype; never "In this part..." or "Let's explore..."
- **body** — 150-300 words, one core idea, one analogy or concrete example, plain language at smart 15-year-old level, define all jargon inline
- **keyTakeaway** — one bolded sentence, skimmable and screenshot-able
- **bridge** — one sentence creating anticipation for the next part (omit on final part)
- **reflection** — 1-2 questions, at least one application or prediction, not pure recall
- **furtherReading** — 2-3 items as search phrases or named resources, NEVER invent URLs
- **estimatedReadingMinutes** — your best estimate (1-6)

## LINKS POLICY

NEVER invent URLs. For further reading, provide search phrases or named resources (e.g. "Wikipedia: Double-slit experiment", "Feynman Lectures on Physics Vol 3", "search: how does quantum decoherence work"). The app will render these as clickable search links. If you are absolutely certain a URL is correct (e.g. a well-known wikipedia.org/wiki/... page), you may include it, but search phrases are strongly preferred.

## STYLE

Conversational, enthusiastic, clear. Use simple language for complex ideas. Target a smart 15-year-old. Write like a knowledgeable friend, not a textbook.

## MARKDOWN FORMATTING

Summaries are rendered as Markdown. Never a single wall of text.

- Break text into short paragraphs (3-5 sentences each). Use blank lines between paragraphs.
- Use **bold** for key concepts, names, and important terms.
- Use bullet points (beginning with -) for lists of concepts, steps, or examples.
- Use headings (###) to divide the summary into clear sections.
- Use blockquotes (beginning with >) for memorable quotes or striking facts.
- You can use LaTeX syntax (\\$...\\$ inline, \\$\\$...\\$\\$ block) for mathematical expressions.
- You can output SVG code in a markdown code block with language tag svg for diagrams and visualizations.
- Every summary must have at least 2 paragraph breaks and some bold text.`;

export function buildCourseOutlinePrompt(
  question: string,
  priorKnowledgeLevel: string,
  completedCourses: string,
): string {
  return `The user chose: "${question}". Prior knowledge: ${priorKnowledgeLevel}.

${completedCourses}

Design a course answering this question. Rules:
- 3-6 parts; each teaches exactly ONE core idea
- Part 1 frames why the question is fascinating — not a dry intro. Set the stage and create a mystery.
- Middle parts build pieces of the answer — key concepts, experiments, discoveries. If there were fascinating dead ends or wrong turns, include one part about what didn't work.
- Final part delivers the satisfying answer + a memorable takeaway. The user should feel a genuine "aha" moment.
- Reference a prior course if a natural connection exists — make callbacks like "Remember when you learned about X? This builds on it."
- For titles: aim for a curiosity gap. "The Trick Your Ears Play on You" beats both "Psychoacoustics Explained" and "You Won't Believe What Your Ears Do."

For each part provide:
- title: intriguing and honest
- coreIdea: the single core idea in one sentence
- hookArchetype: one of paradox / everyday / myth_bust / question / anecdote — assign a different archetype to each part

Return ONLY a JSON object. No other text:
{"courseTitle": "The intriguing, honest course title", "parts": [{"title": "...", "coreIdea": "...", "hookArchetype": "paradox"}, ...]}`;
}

export function buildPartGenerationPrompt(
  partNumber: number,
  totalParts: number,
  courseTitle: string,
  question: string,
  outline: string,
  hookArchetype: string,
  prevSummary: string,
): string {
  const isFirst = partNumber === 1;
  const isLast = partNumber === totalParts;

  return `Writing part ${partNumber} of ${totalParts} of the course "${courseTitle}" (answering "${question}").

Course outline (all parts):
${outline}
${prevSummary ? `Previous part summary (summarize what the user just learned):\n${prevSummary}` : ''}
Your hook archetype for this part: "${hookArchetype}".

Rules for this part:
${isFirst ? '- This is the OPENING part. Frame why the question is fascinating and what makes it worth a whole course. Create mystery — do NOT give away the answer.' : ''}
${isLast ? '- This is the FINAL part. Synthesize everything from prior parts and deliver the satisfying answer. Include a memorable, bolded keyTakeaway.' : ''}
${!isFirst && !isLast ? '- This is a MIDDLE part. Deliver exactly one core idea that builds toward the answer. Layer on prior parts.' : ''}
- One core idea only. No sprawling tangents.
- Use plain language (smart 15-year-old level). Define all jargon inline — never assume the reader knows a term.
- Include one concrete analogy or real-world example that grounds the abstract concept.
- NEVER begin with "In this part..." or "Let's explore..."

Generate the following fields:
- title: the part title from the outline
- hook: 1-2 sentences using the "${hookArchetype}" hook angle. Make it irresistible — the user should NEED to keep reading.
- body: 150-300 words of core content. Well-structured markdown with paragraph breaks, **bold** for key terms, and at least one concrete analogy or example.
- keyTakeaway: one bolded sentence that captures the single most important idea. This should be skimmable and screenshot-able — if the user remembers only one thing from this part, this is it.
- bridge: one sentence creating anticipation for the next part. ${isLast ? 'Omit this field — this is the final part.' : 'Make the user genuinely curious about what comes next.'}
- reflection: 1-2 questions. At least one must be an application question ("How would you use this to explain...") or a prediction question ("What would happen if..."). No pure recall questions.
- furtherReading: 2-3 items. Use descriptive search phrases or named resources like "Wikipedia: [topic]" or "search: [specific search query]". NEVER invent URLs. If you are completely certain of a wikipedia URL, you may include it, but search phrases are strongly preferred.
- estimatedReadingMinutes: your best estimate (1-6)

Return ONLY a JSON object. No other text:
{"title": "...", "hook": "...", "body": "...", "keyTakeaway": "...", ${isLast ? '' : '"bridge": "...", '}"reflection": [{"question": "...", "answer": "..."}], "furtherReading": ["..."], "estimatedReadingMinutes": 3}`;
}

export function buildSingleQuestionPrompt(
  subtopic: string,
  category: string,
  flavor: string,
  flavorInstructions: string,
  excludedQuestions: string,
  pastRatings: string,
): string {
  return `The user selected subtopic "${subtopic}" (category: "${category}").

${pastRatings}

${excludedQuestions}

Generate exactly ONE ${flavor} question about "${subtopic}".

${flavorInstructions}

The question must:
- Be exactly ONE question (not multiple)
- Be answerable in a 3-6 part course
- Assume no prerequisites
- Have an intriguing title that creates a curiosity gap
- Be max 15 words

Return ONLY a single JSON object. No array, no other text:
{"question": "...", "teaser": "...", "difficulty": 2}

The teaser is one sentence hinting why the answer is surprising or fascinating.
Difficulty: 1 (beginner-friendly), 2 (some background helps), or 3 (complex but accessible).`;
}

export interface LearningCategory {
  id: string;
  label: string;
}

export interface LearningSection {
  title: string;
  categories: LearningCategory[];
}

export const LEARNING_SECTIONS: LearningSection[] = [
  {
    title: 'Natural Sciences',
    categories: [
      { id: 'biology', label: 'Biology' },
      { id: 'physics', label: 'Physics' },
      { id: 'chemistry', label: 'Chemistry' },
      { id: 'astronomy', label: 'Astronomy' },
      { id: 'earth-science', label: 'Earth Science' },
      { id: 'neuroscience', label: 'Neuroscience' },
      { id: 'ecology', label: 'Ecology' },
      { id: 'oceanography', label: 'Oceanography' },
      { id: 'genetics', label: 'Genetics' },
    ],
  },
  {
    title: 'Technology & Math',
    categories: [
      { id: 'computer-science', label: 'Computer Science' },
      { id: 'mathematics', label: 'Mathematics' },
      { id: 'engineering', label: 'Engineering' },
      { id: 'ai-data', label: 'AI & Data Science' },
      { id: 'cybersecurity', label: 'Cybersecurity' },
      { id: 'robotics', label: 'Robotics' },
      { id: 'statistics', label: 'Statistics' },
      { id: 'game-dev', label: 'Game Development' },
    ],
  },
  {
    title: 'Humanities & Society',
    categories: [
      { id: 'history', label: 'History' },
      { id: 'philosophy', label: 'Philosophy' },
      { id: 'psychology', label: 'Psychology' },
      { id: 'economics', label: 'Economics' },
      { id: 'political-science', label: 'Political Science' },
      { id: 'sociology', label: 'Sociology' },
      { id: 'linguistics', label: 'Linguistics' },
      { id: 'anthropology', label: 'Anthropology' },
      { id: 'law', label: 'Law' },
    ],
  },
  {
    title: 'Arts & Culture',
    categories: [
      { id: 'literature', label: 'Literature' },
      { id: 'art-architecture', label: 'Art & Architecture' },
      { id: 'music', label: 'Music' },
      { id: 'film-media', label: 'Film & Media' },
      { id: 'photography', label: 'Photography' },
      { id: 'design', label: 'Design' },
      { id: 'theater', label: 'Theater & Drama' },
      { id: 'mythology', label: 'Myth & Folklore' },
    ],
  },
];
