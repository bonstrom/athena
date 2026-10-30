export const LATEX_INSTRUCTIONS = `You can use LaTeX syntax for mathematical expressions: \`$...$\` for inline math and \`$$...$$\` for display (block) math.`;

export const SVG_INSTRUCTIONS = `For inline-rendered SVG diagrams, use a complete SVG document inside a \`svg\` fenced code block. Close the fence on its own line after </svg>. Use viewBox and reasonable dimensions.`;

export const SVG_EDIT_INSTRUCTIONS = `You are editing an existing SVG diagram. Apply ONLY the change the user requests and preserve everything else exactly as-is.

Return the COMPLETE updated SVG in a single \`\`\`svg fenced code block: exactly one <svg> root element, one closing </svg>, and nothing after it. Do not add commentary or explanation.`;

export const SHORTENED_ID_LENGTH = 8; // prefix length for shortened UUID display

export const SCRATCHPAD_LIMIT = 8000;

export const DEEPSEEK_PEAK_HOURS_UTC: { start: number; end: number }[] = [
  { start: 1, end: 4 }, // 01:00–04:00 UTC
  { start: 6, end: 10 }, // 06:00–10:00 UTC
];

export const DEEPSEEK_PEAK_MULTIPLIER = 2;

// RAG (Retrieval-Augmented Generation) tuning constants
export const RAG_TOP_K = 5; // number of semantically similar messages to retrieve
export const RAG_MIN_SCORE = 0.3; // discard weakly-related matches below this cosine similarity
export const RAG_MAX_CHARS = 4000; // hard cap on total RAG block size injected into context
export const RAG_CONTENT_LIMIT = 800; // truncate individual messages; LLM can fetch full content via read_messages
export const MESSAGE_RETRIEVAL_INSTRUCTIONS = `Use message summaries ([SUMMARY] or [S]) and previews to locate relevant historical messages, not as replacement answers or verified evidence. When needed details are missing or marked [TRUNCATED], call read_messages before answering; do not reconstruct them from a summary. No retrieval is needed when the relevant original content is already available in full. Use list_messages when the provided directory is insufficient.`;
export const CLARIFICATION_INSTRUCTIONS = `Ask a concise clarifying question only when missing information would materially change your answer. Check the relevant conversation history first when appropriate. Otherwise, proceed using a reasonable assumption and state it briefly. Do not ask unnecessary follow-up questions.`;

// ── Web search & fetch (DeepSeek Search API) ─────────────────────────────────

/** Base URL for DeepSeek's standalone Search/Fetch APIs. */
export const DEEPSEEK_TOOLS_BASE_URL = 'https://api.deepseek.com';
/** $0.75 per 1,000 successful Search requests. */
export const SEARCH_COST_PER_CALL = 0.00075;
/** $0.75 per 1,000 successful Fetch requests. */
export const FETCH_COST_PER_CALL = 0.00075;
export const SEARCH_DEFAULT_COUNT = 5;
export const SEARCH_MAX_COUNT = 10;
/** Results at or above this combined relevance/authority/freshness score are considered high quality. */
export const SEARCH_MIN_RERANK_SCORE = 1.5;
/** Hard cap on the model-facing search/fetch block, to protect the context window. */
export const SEARCH_RESULT_CHAR_LIMIT = 6000;

export const WEB_SEARCH_INSTRUCTIONS = `Use web_search when an answer needs current information or external factual verification. Prefer specific queries; fetch pages with fetch_url when snippets are insufficient. Cite supporting sources as Markdown links using URLs returned by the tools. If verification is inconclusive, state the uncertainty rather than guessing.`;

export const DEFAULT_SCRATCHPAD_RULES = `Keep durable user preferences, ongoing goals, important facts and decisions, and labeled message bookmarks in this topic's private scratchpad (max {{SCRATCHPAD_LIMIT}} chars). Bookmarks should include the message ID and a short description. Avoid transient details and conversation transcripts. Update memory when useful information changes; prefer a concise replacement that removes stale entries.`;

export const CURATOR_SYSTEM_PROMPT = `Plan a factual, engaging learning course answering the user's question. Match their prior knowledge and correct false premises rather than rationalizing them. Use 3-6 parts with one distinct core idea per part and a clear progression toward the answer. Prefer concrete mechanisms and examples over padding or artificial suspense. Return only the requested JSON object, without code fences or commentary.`;

export const CURATOR_VOICE_RULES = `Write like a knowledgeable friend: clear, concrete, and accurate. Use specific examples instead of hype, stock openings, or repeated rhetorical flourishes. Match the learner's prior knowledge: explain unfamiliar terms for beginners; assume the fundamentals and explore deeper mechanisms for advanced learners. Never invent anecdotes, evidence, or certainty to make the story more engaging.`;

export const CHECKLIST_GENERATION_PROMPT = `You create practical checklists. Based on the user's request, produce one or more titled sections (groups), each containing an ordered list of tasks.

## OUTPUT RULES

Your ENTIRE response must be ONLY raw JSON matching exactly this shape:

{"groups":[{"title":"Section title","items":[{"content":"Task text","details":"Optional extra note"}]}]}

- "details" is optional per item. Omit the field entirely unless you have genuinely useful extra information (a concrete tip, link, rationale, or clarifying note). Do NOT add "details" just to fill it in — an empty or redundant note is worse than none. Most items should have no "details" at all.
- "title" is required for every group; "content" is required for every item.
- Order matters: groups in the order shown, items within each group in the order shown.
- Use clear, specific task wording. Group related tasks under a meaningful heading.
- No markdown, no code fences, no preamble or closing text. Just the JSON object.`;

export const CHECKLIST_EDITING_INSTRUCTIONS = `You are editing a checklist the user maintains. The current checklist state is provided below, followed by the user's instruction.

Earlier turns of this conversation (the user's prior instructions and your prior summaries) are included as normal messages. Use them to resolve references such as "the section I just made" or "add more to that".

## RULES

1. Perform every change by calling the provided checklist tools. NEVER restate the checklist as text — the UI already shows it.
2. Groups and items are referenced by the exact short IDs in their JSON "id" fields. Copy those IDs exactly; never invent or infer an ID.
3. To add a single task, call add_checklist_item with the target groupId; to add several tasks to an existing group at once, call add_checklist_items. To add a new section, call add_checklist_group.
4. To mark something done/undone, call update_checklist_item with the checked field.
5. To move one group or task, call reorder_checklist_groups or reorder_checklist_items. To reorder many or all tasks in a group at once (e.g. to sort them), call set_checklist_item_order with every task ID of the group in the desired order. To delete several tasks at once, call delete_checklist_items.
6. Make at most one structural change (add, delete, or reorder) per response — a single batch call (add_checklist_items, delete_checklist_items, or set_checklist_item_order) counts as one change. Wait for its tool result, which contains the refreshed checklist, before making the next structural change.
7. If a tool returns an error, use the refreshed checklist in that result to correct the call. Never claim a change succeeded unless its tool result starts with "Success:".
8. If the instruction is ambiguous, make the most reasonable choice rather than asking.
9. After finishing the edits, reply with a single short sentence summarizing only the successful changes. Do not re-list the checklist.`;

export function buildCourseOutlinePrompt(question: string, priorKnowledgeLevel: string, completedCourses: string): string {
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
- hookArchetype: paradox / everyday / myth_bust / question / anecdote — vary across parts; reuse one if there are six parts
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
  answerSpine: string,
  currentPartTitle: string,
  currentPartCoreIdea: string,
  hookArchetype: string,
  partDevice: string,
  coveredTitles: string,
  nextPartTitle: string,
): string {
  const isFirst = partNumber === 1;
  const isLast = partNumber === totalParts;

  const coveredBlock = coveredTitles
    ? `
Parts the reader has already completed (do NOT re-teach or recap these):
${coveredTitles}`
    : '';

  return `Writing part ${partNumber} of ${totalParts} of the course "${courseTitle}" (answering "${question}").

${isLast ? 'The answer to explain and synthesize in this final part:' : 'The answer this course builds toward — develop only this part\'s contribution, leaving the full synthesis for the final part:'}
${answerSpine}

This part's title: "${currentPartTitle}"
This part's single core idea: ${currentPartCoreIdea}
Your device for this part: "${partDevice}"
Your hook archetype for this part: "${hookArchetype}".
${coveredBlock}
${nextPartTitle ? `\nNext part builds toward: "${nextPartTitle}". Create anticipation for it in your bridge.` : ''}

Rules for this part:
${isFirst ? '- This is the OPENING part. Frame why the question is fascinating and what makes it worth a whole course. Create mystery — do NOT give away the answer.' : ''}
${isLast ? '- This is the FINAL part. Synthesize everything from prior parts and deliver the satisfying answer. Include a memorable, bolded keyTakeaway.' : ''}
${!isFirst && !isLast ? '- This is a MIDDLE part. Deliver exactly one core idea that builds toward the answer. Layer on prior parts.' : ''}
- One core idea only. No sprawling tangents.

${CURATOR_VOICE_RULES}

Generate the following fields:
- title: use the part title above
- hook: 1-2 sentences using the "${hookArchetype}" hook angle. Create a specific curiosity gap without exaggeration.
- body: 150-300 words of core content (budget, not quota; stop when the idea lands). Well-structured markdown with paragraph breaks, **bold** for key terms. Deliver through the "${partDevice}" device.
${isLast ? "- keyTakeaway: one bolded sentence stating the course's answer." : "- keyTakeaway: one bolded sentence stating this part's NEW piece — do NOT spoil the course's final answer."}
${isLast ? '- Omit bridge: this is the final part.' : '- bridge: one sentence connecting this idea to the next part and creating anticipation.'}
- reflection: 1-2 questions. At least one must be an application question ("How would you use this to explain...") or a prediction question ("What would happen if..."). No pure recall questions.
- furtherReading: 2-3 descriptive search phrases or named resources, such as "Wikipedia: [topic]" or "search: [specific search query]". Do not generate URLs.
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
  const difficultyGuide =
    priorKnowledgeLevel === 'beginner'
      ? 'Target difficulty 1: the question should assume zero prerequisites.'
      : priorKnowledgeLevel === 'intermediate'
        ? 'Target difficulty 2: the question can assume some familiarity but still be broadly accessible.'
        : 'Target difficulty 3: the question can be complex and push deeper into the topic, and may assume familiarity with the fundamentals.';

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
