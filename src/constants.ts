export const SCRATCHPAD_LIMIT = 5000;
export const USD_TO_SEK = 10;
export const DEFAULT_SCRATCHPAD_RULES = `You have a private scratchpad for long-term memory (max {{SCRATCHPAD_LIMIT}} chars). 

**Rules for the Scratchpad:**
* **What to store:** Only persistent, long-term facts (user preferences, ongoing goals, core character details, or established rules). 
* **What NOT to store:** Transient conversation history, short-term tasks that were just completed, or immediate context (I already remember recent messages).
* **Managing space:** If the scratchpad is getting full or contains outdated facts (e.g., a goal was completed, or a preference changed), use the \`replace\` action to rewrite the entire scratchpad, keeping only the currently relevant facts and discarding the dead ones.`;
