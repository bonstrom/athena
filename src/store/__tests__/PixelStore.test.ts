import { usePixelStore } from '../PixelStore';
import { TRANSPARENT } from '../../pixel/types';
import { DEFAULT_PALETTE } from '../../pixel/palette';

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    pixelDocuments: {
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      orderBy: jest.fn((): unknown => ({
        reverse: () => ({ toArray: jest.fn().mockResolvedValue([]) }),
      })),
    },
    pixelPalettes: {
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      orderBy: jest.fn((): unknown => ({
        reverse: () => ({ toArray: jest.fn().mockResolvedValue([]) }),
      })),
    },
  },
}));

function resetStore(): void {
  usePixelStore.setState({
    documents: [],
    activeDocumentId: null,
    savedPalettes: [],
    undoStacks: {},
    redoStacks: {},
    isLoaded: false,
    palettesLoaded: false,
  });
}

async function openSprite(width = 4, height = 4): Promise<string> {
  const id = await usePixelStore.getState().createDocument({ name: 'hero', width, height });
  if (!id) throw new Error('document was not created');
  return id;
}

function firstDocument(): { revision: number; pixels: number[] } {
  const document = usePixelStore.getState().documents[0];
  const layer = document.layers[0];
  return { revision: document.revision, pixels: layer.pixels };
}

describe('PixelStore', () => {
  beforeEach(resetStore);

  it('creates a document, persists it and makes it active', async () => {
    const id = await openSprite(8, 6);
    const state = usePixelStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.activeDocumentId).toBe(id);
    expect(state.documents[0].width).toBe(8);
    expect(state.documents[0].height).toBe(6);
  });

  it('refuses to create a canvas larger than the ceiling', async () => {
    const id = await usePixelStore.getState().createDocument({ name: 'too big', width: 128, height: 8 });
    expect(id).toBeNull();
    expect(usePixelStore.getState().documents).toHaveLength(0);
  });

  it('adopts the first saved palette, including its grid width', async () => {
    usePixelStore.setState({
      palettesLoaded: true,
      savedPalettes: [
        {
          id: 'p1',
          name: 'Otterisk 96',
          colors: [
            { id: 'one', hex: '#111111' },
            { id: 'two', hex: '#222222' },
          ],
          columns: 6,
          createdOn: '2024-01-01T00:00:00.000Z',
          updatedOn: '2024-01-01T00:00:00.000Z',
        },
      ],
    });

    const id = await usePixelStore.getState().createDocument({ name: 'knight', width: 4, height: 4 });
    const document = usePixelStore.getState().documents.find((candidate) => candidate.id === id);

    expect(document?.palette.map((color) => color.id)).toEqual(['one', 'two']);
    expect(document?.paletteColumns).toBe(6);
  });

  it('falls back to the built-in palette when none is saved', async () => {
    const id = await usePixelStore.getState().createDocument({ name: 'knight', width: 4, height: 4 });
    const document = usePixelStore.getState().documents.find((candidate) => candidate.id === id);

    expect(document?.palette).toHaveLength(DEFAULT_PALETTE.length);
  });

  it('applies a batch as one undo step and keeps revisions monotonic', async () => {
    await openSprite();
    const errors = usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[1, 1]], color: 2 }]);
    expect(errors).toEqual([]);

    const applied = firstDocument();
    expect(applied.revision).toBe(2);
    expect(applied.pixels[1 * 4 + 1]).toBe(2);
    expect(usePixelStore.getState().undoStacks[usePixelStore.getState().activeDocumentId ?? '']).toHaveLength(1);

    usePixelStore.getState().undo();
    const undone = firstDocument();
    expect(undone.revision).toBe(3);
    expect(undone.pixels[1 * 4 + 1]).toBe(TRANSPARENT);

    usePixelStore.getState().redo();
    const redone = firstDocument();
    expect(redone.revision).toBe(4);
    expect(redone.pixels[1 * 4 + 1]).toBe(2);
  });

  it('reports errors and changes nothing when a batch is invalid', async () => {
    await openSprite();
    const before = firstDocument();
    const errors = usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[99, 99]], color: 0 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('outside');
    expect(firstDocument()).toEqual(before);
    const stacks = usePixelStore.getState().undoStacks;
    const activeId = usePixelStore.getState().activeDocumentId;
    expect(activeId ? stacks[activeId] : undefined).toHaveLength(0);
  });

  it('errors when no sprite is open', () => {
    const errors = usePixelStore.getState().applyOps([{ type: 'flip', axis: 'horizontal' }]);
    expect(errors[0].message).toContain('No sprite is open');
  });

  it('makes undo and redo no-ops when the stacks are empty', async () => {
    await openSprite();
    const before = firstDocument();
    usePixelStore.getState().undo();
    usePixelStore.getState().redo();
    expect(firstDocument()).toEqual(before);
  });

  it('replaces the palette and clears pixels that fall outside it', async () => {
    const id = await openSprite();
    usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[0, 0]], color: 3 }]);
    await usePixelStore.getState().replacePalette(id, [{ id: 'only', hex: '#112233' }]);
    const document = usePixelStore.getState().documents[0];
    expect(document.palette).toHaveLength(1);
    expect(document.layers[0].pixels[0]).toBe(TRANSPARENT);
    // The active subset must be rebuilt, not left empty (which would disable painting).
    expect(document.activeColorIds).toEqual(['only']);
  });

  it('renames and deletes documents', async () => {
    const id = await openSprite();
    await usePixelStore.getState().renameDocument(id, '  knight  ');
    expect(usePixelStore.getState().documents[0].name).toBe('knight');

    await usePixelStore.getState().deleteDocument(id);
    expect(usePixelStore.getState().documents).toHaveLength(0);
    expect(usePixelStore.getState().activeDocumentId).toBeNull();
  });

  it('toggles colours in and out of the active palette', async () => {
    const id = await openSprite();
    const document = usePixelStore.getState().documents[0];
    const last = document.palette[document.palette.length - 1];

    const removed = await usePixelStore.getState().toggleActiveColor(id, last.id);
    expect(removed.ok).toBe(true);
    expect(usePixelStore.getState().documents[0].activeColorIds).not.toContain(last.id);

    const added = await usePixelStore.getState().toggleActiveColor(id, last.id);
    expect(added.ok).toBe(true);
    expect(usePixelStore.getState().documents[0].activeColorIds).toContain(last.id);
  });

  it('refuses to deactivate a colour the sprite still uses', async () => {
    const id = await openSprite();
    const document = usePixelStore.getState().documents[0];
    usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);

    const result = await usePixelStore.getState().toggleActiveColor(id, document.palette[1].id);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('still used');
  });

  it('allows deactivating every colour', async () => {
    const id = await openSprite();
    const document = usePixelStore.getState().documents[0];
    for (const color of document.palette) {
      await usePixelStore.getState().toggleActiveColor(id, color.id);
    }

    expect(usePixelStore.getState().documents[0].activeColorIds).toEqual([]);
  });

  it('clears the active palette in one step and bumps the revision', async () => {
    const id = await openSprite();
    expect(usePixelStore.getState().documents[0].activeColorIds.length).toBeGreaterThan(0);

    await usePixelStore.getState().clearActiveColors(id);

    const document = usePixelStore.getState().documents[0];
    expect(document.activeColorIds).toEqual([]);
    expect(document.revision).toBe(2);
  });

  it('rejects a colour that is not in the palette', async () => {
    const id = await openSprite();
    const result = await usePixelStore.getState().toggleActiveColor(id, 'nope');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not in the palette');
  });

  it('saves a palette, reuses it and deletes it', async () => {
    const id = await openSprite();
    const colors = [
      { id: 'a', hex: '#000000' },
      { id: 'b', hex: '#ffffff' },
    ];

    const paletteId = await usePixelStore.getState().savePalette('Test ramp', colors);
    expect(paletteId).not.toBeNull();
    expect(usePixelStore.getState().savedPalettes).toHaveLength(1);

    await usePixelStore.getState().applySavedPalette(id, paletteId ?? '');
    expect(usePixelStore.getState().documents[0].palette).toHaveLength(2);

    await usePixelStore.getState().deleteSavedPalette(paletteId ?? '');
    expect(usePixelStore.getState().savedPalettes).toHaveLength(0);
  });

  it('updates a saved palette with the same name instead of duplicating it', async () => {
    await usePixelStore.getState().savePalette('Test ramp', [{ id: 'a', hex: '#000000' }]);
    await usePixelStore.getState().savePalette('test ramp', [{ id: 'b', hex: '#ffffff' }]);

    const saved = usePixelStore.getState().savedPalettes;
    expect(saved).toHaveLength(1);
    expect(saved[0].colors[0].id).toBe('b');
  });

  it('keeps the chat link when undoing an edit', async () => {
    const id = await openSprite();
    usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);
    await usePixelStore.getState().attachChatTopic(id, 'topic-1');

    usePixelStore.getState().undo();

    const document = usePixelStore.getState().documents[0];
    expect(document.chatTopicId).toBe('topic-1');
    // The artwork itself is still reverted.
    expect(document.layers[0].pixels[0]).toBe(TRANSPARENT);
  });

  it('keeps the palette layout when undoing an edit', async () => {
    const id = await openSprite();
    usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);
    await usePixelStore.getState().setPaletteColumns(id, 6);

    usePixelStore.getState().undo();

    expect(usePixelStore.getState().documents[0].paletteColumns).toBe(6);
  });

  it('makes a palette replacement undoable', async () => {
    const id = await openSprite();
    usePixelStore.getState().applyOps([{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);
    const before = usePixelStore.getState().documents[0];

    await usePixelStore.getState().replacePalette(id, [{ id: 'only', hex: '#112233' }]);
    expect(usePixelStore.getState().documents[0].palette).toHaveLength(1);

    usePixelStore.getState().undo();
    const restored = usePixelStore.getState().documents[0];
    expect(restored.palette).toHaveLength(before.palette.length);
    expect(restored.layers[0].pixels[0]).toBe(1);
  });

  it('sets a colour to an explicit state and treats a repeat as a no-op', async () => {
    const id = await openSprite();
    const document = usePixelStore.getState().documents[0];
    const last = document.palette[document.palette.length - 1];

    const first = await usePixelStore.getState().setActiveColorState(id, last.id, false);
    expect(first.ok).toBe(true);
    const revision = usePixelStore.getState().documents[0].revision;

    const again = await usePixelStore.getState().setActiveColorState(id, last.id, false);
    expect(again.ok).toBe(true);
    expect(usePixelStore.getState().documents[0].revision).toBe(revision);
  });

  it('rejects setting a colour it does not own', async () => {
    const id = await openSprite();
    const result = await usePixelStore.getState().setActiveColorState(id, 'nope', true);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not in the palette');
  });

  it('sets the whole active palette at once, de-duplicating and dropping unknowns', async () => {
    const id = await openSprite();
    const document = usePixelStore.getState().documents[0];
    const [first, second] = document.palette;

    const result = await usePixelStore.getState().setActiveColors(id, [second.id, first.id, second.id, 'nope']);

    expect(result.ok).toBe(true);
    expect(usePixelStore.getState().documents[0].activeColorIds).toEqual([second.id, first.id]);
  });

  it('stores the palette grid width and reapplies it with the palette', async () => {
    const id = await openSprite();

    await usePixelStore.getState().setPaletteColumns(id, 6);
    expect(usePixelStore.getState().documents[0].paletteColumns).toBe(6);

    const paletteId = await usePixelStore.getState().savePalette('Six wide', [{ id: 'a', hex: '#000000' }], 6);
    expect(usePixelStore.getState().savedPalettes[0].columns).toBe(6);

    await usePixelStore.getState().setPaletteColumns(id, 8);
    expect(usePixelStore.getState().documents[0].paletteColumns).toBe(8);

    await usePixelStore.getState().applySavedPalette(id, paletteId ?? '');
    expect(usePixelStore.getState().documents[0].paletteColumns).toBe(6);
  });
});
