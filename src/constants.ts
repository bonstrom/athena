export const LATEX_INSTRUCTIONS = `You can use LaTeX syntax for mathematical expressions: \`$...$\` for inline math and \`$$...$$\` for display (block) math.`;

export const SVG_INSTRUCTIONS = `You can output SVG code to create visualizations, diagrams, charts, or illustrations directly in your responses. Wrap the SVG in a markdown code block with the language tag \`\`\`svg, and ALWAYS close the code block with \`\`\` on its own line after the SVG. The SVG will be rendered inline in the chat. Keep SVGs reasonably sized and use viewBox for responsiveness.

Example:
\`\`\`svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="blue" />
</svg>
\`\`\`
Note: it is critical to end the code block with \`\`\` after the closing </svg> tag, otherwise the rest of your response will not render correctly.`;

export const SVG_EDIT_INSTRUCTIONS = `You are editing an existing SVG diagram. Apply ONLY the change the user requests and preserve everything else exactly as-is.

Return the COMPLETE updated SVG in a single \`\`\`svg fenced code block: exactly one <svg> root element, one closing </svg>, and nothing after it. Do not add commentary or explanation.`;

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
- **body** — 150-300 words (budget, not quota; stop when the idea lands), one core idea, delivered through the assigned device (story/analogy/thought_experiment/real_case/simple_experiment), plain language at smart 15-year-old level, define all jargon inline
- **keyTakeaway** — one bolded sentence capturing this part's new piece of the answer, not the course's final answer (unless this is the last part)
- **bridge** — one sentence creating anticipation for the next part (omit on final part)
- **reflection** — 1-2 questions, at least one application or prediction, not pure recall
- **furtherReading** — 2-3 items as search phrases or named resources, NEVER invent URLs
- **estimatedReadingMinutes** — your best estimate (1-6)

## LINKS POLICY

NEVER invent URLs. For further reading, provide search phrases or named resources (e.g. "Wikipedia: Double-slit experiment", "Feynman Lectures on Physics Vol 3", "search: how does quantum decoherence work"). The app will render these as clickable search links. If you are absolutely certain a URL is correct (e.g. a well-known wikipedia.org/wiki/... page), you may include it, but search phrases are strongly preferred.

## VOICE — HARD RULES

Drama comes from facts, not adjectives.
- Ban hype words (violent, deadly, brutal, insane, catastrophic, betrayal) unless literally accurate.
- Specific beats dramatic: "a 0.5 mm gap" beats "a tiny, treacherous gap". Prefer numbers, names, dates, places over adjectives.

Rhythm:
- At most ONE punchy one-line aphorism per part. If every paragraph ends with a zinger, none land.
- At most ONE rhetorical question per part.
- Never use: "Here's the thing", "The catch?", "But here's what X hides", "Think of...", "Imagine...". Introduce examples directly: "A camera tripod on gravel..." — not "Think of a camera tripod."
- The "X is not Y — it's Z" reversal: at most once per part.
- If two parts' keyTakeaways could be swapped between them, one part is redundant.

Target a smart 15-year-old. Write like a knowledgeable friend, not a textbook. Use simple language for complex ideas.

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

${completedCourses}${completedCourses ? '\nThe courses above are ones the user already finished. If one connects naturally, plan a callback in the relevant part; otherwise ignore them.' : ''}

STEP 1 — answerSpine: In 2-3 sentences, state the actual, correct answer to the
question. If the question rests on a popular-but-wrong premise, the spine says so —
the course will correct it, never rationalize it.

STEP 2 — parts: use as FEW parts as the spine needs (3-6). Three tight parts beat
five padded ones. Padding is the worst failure mode.
- Part 1 frames the puzzle. It must NOT reveal the answer — including in its takeaway.
- Each middle part delivers one piece of the answer: a mechanism, a key concept, a
  discovery, a decisive experiment. Only include a "wrong turn" part if a real
  historical dead end genuinely illuminates the answer.
- Final part delivers the satisfying answer + memorable takeaway.

For each part:
- title: curiosity gap, honest. "The Trick Your Ears Play on You" beats "Psychoacoustics Explained".
- coreIdea: the single idea in one sentence
- newInformation: what the reader knows AFTER this part that they did NOT know after
  the previous one. If you can't fill this in without repeating another part's
  coreIdea, MERGE the parts and reduce the count.
- hookArchetype: paradox / everyday / myth_bust / question / anecdote (all different)
- device: story / analogy / thought_experiment / real_case / simple_experiment —
  vary across parts; "analogy" at most twice per course

Return ONLY a JSON object:
{"answerSpine": "...", "courseTitle": "...", "parts": [{"title": "...", "coreIdea": "...", "newInformation": "...", "hookArchetype": "...", "device": "..."}, ...]}`;
}

export function buildPartGenerationPrompt(
  partNumber: number,
  totalParts: number,
  courseTitle: string,
  question: string,
  outline: string,
  hookArchetype: string,
  partDevice: string,
  coveredSoFar: string,
): string {
  const isFirst = partNumber === 1;
  const isLast = partNumber === totalParts;

  const coveredBlock = coveredSoFar
    ? `
Ideas covered by other parts (the reader JUST read these):
${coveredSoFar}

HARD RULES:
- NEVER re-teach or recap a covered idea. Reference it in at most one short clause
  ("remember the tipping boundary") and build on it immediately. No recap paragraphs.
- Deliver this part's ONE new idea through the assigned device: "${partDevice}".
  One example, fully used — not three analogies that make the same point.
- Do not open the body with a heading that repeats the title.
- 150-300 words is a budget, not a quota. When the idea has landed, stop.`
    : '';

  return `Writing part ${partNumber} of ${totalParts} of the course "${courseTitle}" (answering "${question}").

Course outline (all parts):
${outline}
Your device for this part: "${partDevice}"
Your hook archetype for this part: "${hookArchetype}".
${coveredBlock}

Rules for this part:
${isFirst ? '- This is the OPENING part. Frame why the question is fascinating and what makes it worth a whole course. Create mystery — do NOT give away the answer.' : ''}
${isLast ? '- This is the FINAL part. Synthesize everything from prior parts and deliver the satisfying answer. Include a memorable, bolded keyTakeaway.' : ''}
${!isFirst && !isLast ? '- This is a MIDDLE part. Deliver exactly one core idea that builds toward the answer. Layer on prior parts.' : ''}
- One core idea only. No sprawling tangents.
- Use plain language (smart 15-year-old level). Define all jargon inline — never assume the reader knows a term.
- Deliver the idea through the assigned device: "${partDevice}".
- NEVER begin with "In this part..." or "Let's explore..."

Generate the following fields:
- title: the part title from the outline
- hook: 1-2 sentences using the "${hookArchetype}" hook angle. Make it irresistible — the user should NEED to keep reading.
- body: 150-300 words of core content (budget, not quota; stop when the idea lands). Well-structured markdown with paragraph breaks, **bold** for key terms. Deliver through the "${partDevice}" device.
${isLast ? '- keyTakeaway: the keyTakeaway here IS the course\'s answer — this is the screenshot-worthy line.' : "- keyTakeaway: your keyTakeaway states this part's NEW piece — do NOT spoil the course's final answer."}
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
  priorKnowledgeLevel: string,
): string {
  const difficultyGuide = priorKnowledgeLevel === 'beginner'
    ? 'Target difficulty 1: the question should assume zero prerequisites.'
    : priorKnowledgeLevel === 'intermediate'
    ? 'Target difficulty 2: the question can assume some familiarity but still be broadly accessible.'
    : 'Target difficulty 3: the question can be complex and push deeper into the topic.';

  return `The user selected subtopic "${subtopic}" (category: "${category}").
The user's knowledge level is "${priorKnowledgeLevel}".

${pastRatings}

${excludedQuestions}

Generate exactly ONE ${flavor} question about "${subtopic}".

${flavorInstructions}

The question must:
- Be exactly ONE question (not multiple)
- Be about a specific, nameable phenomenon — ban survey questions ('How do ecosystems work?')
- The answer must contain a story or mechanism worth telling, not a one-line fact
- Be answerable in a 3-6 part course
- Assume no prerequisites
- Have an intriguing title that creates a curiosity gap
- Be max 15 words

${difficultyGuide}

Return ONLY a single JSON object. No array, no other text:
{"question": "...", "context": "...", "difficulty": <1|2|3>}

The context is one sentence that expands on the question — what makes it interesting, what broader theme or subfield it connects to, why it matters. Do NOT reveal or hint at the answer. The context should make the user more curious, not satisfy their curiosity. Never include any factual claims that would constitute part of an answer.`;
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
