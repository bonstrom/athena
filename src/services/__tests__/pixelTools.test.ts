import { executePixelTool, spriteFocusPrompt } from '../pixelTools';
import { usePixelStore, PixelStoreState } from '../../store/PixelStore';
import { applyOps, createDocument } from '../../pixel/ops';
import { ApplyOpsOptions, PixelDocument, PixelOp } from '../../pixel/types';

jest.mock('../../store/PixelStore', () => ({
  usePixelStore: { getState: jest.fn() },
}));

interface FakeState {
  documents: PixelDocument[];
  applyOpsTo: (documentId: string, ops: PixelOp[], options?: ApplyOpsOptions) => unknown[];
}

const getStateMock = usePixelStore.getState as jest.MockedFunction<typeof usePixelStore.getState>;

/** Minimal in-memory stand-in that drives the real op engine. */
function makeState(documents: PixelDocument[] = []): FakeState {
  const state: FakeState = {
    documents,
    applyOpsTo: (documentId, ops, options): unknown[] => {
      const current = state.documents.find((document) => document.id === documentId);
      if (!current) return [{ opIndex: -1, opType: 'document', message: 'missing' }];
      const result = applyOps(current, ops, options);
      if (!result.ok) return result.errors;
      state.documents = state.documents.map((document) => (document.id === documentId ? result.document : document));
      return [];
    },
  };
  return state;
}

function install(state: FakeState): void {
  getStateMock.mockReturnValue(state as unknown as PixelStoreState);
}

function firstDoc(state: FakeState): PixelDocument {
  const document = state.documents.at(0);
  if (!document) throw new Error('state has no document');
  return document;
}

async function call(tool: string, args: Record<string, unknown> = {}): Promise<string> {
  return executePixelTool(tool, JSON.stringify(args));
}

describe('pixel tools', () => {
  beforeEach((): void => {
    getStateMock.mockReset();
  });

  it('reports an empty workspace', async () => {
    install(makeState());
    expect(await call('pixel_list_sprites')).toContain('No sprites in this workspace yet');
  });

  it('lists sprites that already exist', async () => {
    const state = makeState([createDocument({ name: 'slime', width: 8, height: 8 })]);
    install(state);

    const listed = await call('pixel_list_sprites');
    expect(listed).toContain('slime');
    expect(listed).toContain('8x8');
  });

  it('inspects a whole sprite as a grid', async () => {
    const state = makeState([createDocument({ name: 'hero', width: 4, height: 3 })]);
    install(state);
    const result = await call('pixel_inspect', {});
    expect(result).toContain('sprite "hero"');
    expect(result).toContain('4x3');
    expect(result).toContain('columns 0..3');
    expect(result).toContain('legend:');
  });

  it('inspects a single region with coordinates', async () => {
    const state = makeState([createDocument({ name: 'hero', width: 16, height: 16 })]);
    install(state);
    const result = await call('pixel_inspect', { region: { x: 2, y: 3, width: 4, height: 2 } });
    expect(result).toContain('region x=2 y=3 4x2');
  });

  it('applies a batch and reports the revision and bbox', async () => {
    const state = makeState([createDocument({ name: 'hero', width: 4, height: 4 })]);
    install(state);

    const result = await call('pixel_edit', {
      operations: [{ type: 'set_pixels', points: [[1, 1]], color: 2 }],
    });

    expect(result).toContain('Applied 1 operation(s)');
    expect(result).toContain('rev 2');
    expect(result).toContain('1 pixel(s) changed in (1,1)-(1,1)');
    expect(firstDoc(state).revision).toBe(2);
  });

  it('rejects a stale baseRevision without touching the sprite', async () => {
    const state = makeState([createDocument({ name: 'hero', width: 4, height: 4 })]);
    install(state);

    const result = await call('pixel_edit', {
      baseRevision: 7,
      operations: [{ type: 'set_pixels', points: [[0, 0]], color: 1 }],
    });

    expect(result).toContain('Rejected');
    expect(result).toContain('revision 1');
    expect(firstDoc(state).revision).toBe(1);
  });

  it('rejects invalid operations with the failing index', async () => {
    const state = makeState([createDocument({ name: 'hero', width: 4, height: 4 })]);
    install(state);

    const result = await call('pixel_edit', {
      operations: [{ type: 'set_pixels', points: [[99, 99]], color: 1 }],
    });

    expect(result).toContain('Rejected, no changes made');
    expect(result).toContain('op[0]');
    expect(firstDoc(state).revision).toBe(1);
  });

  it('confines edits to the region boundary', async () => {
    const state = makeState([createDocument({ name: 'hero', width: 4, height: 4 })]);
    install(state);

    const result = await call('pixel_edit', {
      region: { x: 0, y: 0, width: 2, height: 2 },
      operations: [
        {
          type: 'set_pixels',
          points: [
            [0, 0],
            [3, 3],
          ],
          color: 1,
        },
      ],
    });

    expect(result).toContain('1 pixel(s) changed in (0,0)-(0,0)');
  });

  it('requires a documentId when several sprites exist', async () => {
    const state = makeState([
      createDocument({ name: 'hero', width: 4, height: 4 }),
      createDocument({ name: 'slime', width: 4, height: 4 }),
    ]);
    install(state);

    const result = await call('pixel_edit', {
      operations: [{ type: 'flip', axis: 'horizontal' }],
    });
    expect(result).toContain('documentId is required');
  });

  it('resolves a sprite by name', async () => {
    const state = makeState([
      createDocument({ name: 'hero', width: 4, height: 4 }),
      createDocument({ name: 'slime', width: 4, height: 4 }),
    ]);
    install(state);

    const result = await call('pixel_edit', {
      documentId: 'slime',
      operations: [{ type: 'set_pixels', points: [[0, 0]], color: 1 }],
    });
    expect(result).toContain('Applied');
    expect(result).toContain('slime');
  });

  it('answers unknown tools and malformed JSON', async () => {
    install(makeState());
    expect(await executePixelTool('pixel_nope', '{}')).toContain('Unknown pixel tool');
    expect(await executePixelTool('pixel_edit', 'not json')).toContain('not valid JSON');
  });

  it('uses the chat-bound sprite when documentId is omitted', async () => {
    const first = createDocument({ name: 'hero', width: 4, height: 4 });
    const second = createDocument({ name: 'slime', width: 4, height: 4 });
    install(makeState([first, second]));

    const result = await executePixelTool(
      'pixel_edit',
      JSON.stringify({ operations: [{ type: 'set_pixels', points: [[0, 0]], color: 1 }] }),
      { defaultDocumentId: second.id },
    );

    expect(result).toContain('Applied');
    expect(result).toContain('slime');
  });

  it('refuses to retarget another sprite when the bound one is gone', async () => {
    const survivor = createDocument({ name: 'survivor', width: 4, height: 4 });
    const state = makeState([survivor]);
    install(state);

    const result = await executePixelTool(
      'pixel_edit',
      JSON.stringify({ operations: [{ type: 'set_pixels', points: [[0, 0]], color: 1 }] }),
      { defaultDocumentId: 'deleted-sprite-id' },
    );

    expect(result).toContain('no longer exists');
    expect(firstDoc(state).revision).toBe(1);
  });

  it('describes the bound sprite for the system prompt without volatile fields', () => {
    const document = createDocument({ name: 'Knight', width: 24, height: 16 });
    const prompt = spriteFocusPrompt(document);

    expect(prompt).toContain('"Knight"');
    expect(prompt).toContain('24x16');
    expect(prompt).toContain('pixel_inspect');
    expect(prompt).not.toContain('rev');
  });
});
