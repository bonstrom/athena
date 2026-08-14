# UI/UX Remediation Plan

Remediation of the product-design findings from the final review. Locked scope: **items 1–8
(Most Important) + item 16 (shared ConfirmDialog)**. Visual-system items (9–15) and the
remaining secondary workflow items (17–19) are deferred to a follow-up pass.

## Locked decisions
- **Home becomes a full empty-composer** — no more "doorway" hero or duplicated Recent Topics.
- **Confirmations use a shared MUI dialog** (replacing `window.confirm`).

## Implementation

1. **Home = empty composer** (`Home.tsx`) — replace the hero with an inline composer; on first
   send: `createTopic()` → `sendMessageStream(draft, newId)` → navigate `/chat/:id`; preserve
   the draft in component state.
2. **Provider setup state** — when `!useProviderStore.getState().hasAnyApiKey()`, show a focused
   "add a provider / API key" panel (draft preserved) linking to Settings.
3. **Dead button** — mobile "View more in the sidebar" → `openDrawer()`; drop the redundant
   desktop button (sidebar is always visible there).
4. **Mobile density** (`MessageBubble.tsx`) — mobile bubbles show only Copy + More; Pin and
   Read aloud move into the More menu.
5. **Metadata a11y** (`MessageBubble.tsx`) — model/author label becomes a keyboard-focusable
   control (`ButtonBase`) with `aria-label` and a visible info affordance.
6. **Terminology** — "Pin to context" → "Keep for future replies"; "Fork" → "Branch from this
   message" (tooltip / aria-label / menu).
7. **Mode state** (`Composer.tsx`) — `aria-pressed` on web-search/auto-read/image/music toggles
   plus a persistent active-state text indicator near the composer.
8. **Header** (`ChatLayout.tsx`) — collapse prompt chips to `Prompts (N)` at narrow widths; show
   an explicit "2×" label beside the DeepSeek flame.
9. **Shared ConfirmDialog** — new component; migrate `window.confirm` sites in `Settings.tsx`,
   `ModelsSettings.tsx`, `ProviderCard.tsx`, `ProvidersSettings.tsx`, `ScratchpadDialog.tsx` and
   update the tests that mock `window.confirm`.

## Testing

- Home: renders composer; on send creates a topic and navigates; no-provider state shows the
  setup panel and preserves the draft.
- MessageBubble: mobile shows only Copy + More; metadata is a button; new labels appear.
- Composer/ChatLayout: `aria-pressed` present; prompt chips collapse; "2×" shown.
- Confirm dialogs: each migrated site opens the dialog and confirms on action.
- Gate: `npm run lint`, `npm run test:coverage`, `npm run build`.
