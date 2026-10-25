import {
  ApplyOpsOptions,
  DEFAULT_PALETTE_COLUMNS,
  MAX_GLYPH_COLORS,
  PixelDocument,
  PixelLayer,
  PixelOp,
  PixelPaletteColor,
  SavedPixelPalette,
  TRANSPARENT,
} from '../types';
import {
  activeLayerOf,
  applyOps,
  createDocument,
  linePoints,
  normalizePixelDocument,
  normalizeSavedPalette,
} from '../ops';
import { DEFAULT_PALETTE } from '../palette';

const PALETTE = DEFAULT_PALETTE.slice(0, 4);

function makeDoc(width = 4, height = 4): PixelDocument {
  return createDocument({ name: 'test', width, height, palette: PALETTE });
}

function layerOf(document: PixelDocument): PixelLayer {
  const layer = activeLayerOf(document);
  if (!layer) throw new Error('document has no layer');
  return layer;
}

function pixelsOf(document: PixelDocument): number[] {
  return layerOf(document).pixels;
}

function at(document: PixelDocument, x: number, y: number): number {
  return pixelsOf(document)[y * document.width + x];
}

/** Assert the batch succeeded and return the new document. */
function applyOk(document: PixelDocument, ops: PixelOp[], options?: ApplyOpsOptions): PixelDocument {
  const result = applyOps(document, ops, options);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  return result.document;
}

function filledDocument(color = 2): PixelDocument {
  return applyOk(makeDoc(), [{ type: 'fill_rect', x: 0, y: 0, width: 4, height: 4, color }]);
}

describe('createDocument', () => {
  it('starts with one blank layer and revision 1', () => {
    const document = makeDoc(3, 2);
    expect(document.layers).toHaveLength(1);
    expect(document.revision).toBe(1);
    expect(pixelsOf(document)).toHaveLength(6);
    expect(pixelsOf(document).every((value) => value === TRANSPARENT)).toBe(true);
  });

  it('rejects oversized and invalid canvases', () => {
    expect(() => makeDoc(65, 4)).toThrow(/64x64/);
    expect(() => makeDoc(0, 4)).toThrow(/positive whole numbers/);
  });

  it('copies the palette so documents cannot alias each other', () => {
    const first = makeDoc();
    const second = makeDoc();
    first.palette[0].hex = '#000000';
    expect(second.palette[0].hex).not.toBe('#000000');
  });
});

describe('applyOps - bounds and atomicity', () => {
  it('rejects an out-of-bounds point with an actionable message', () => {
    const document = makeDoc(24, 24);
    const result = applyOps(document, [{ type: 'set_pixels', points: [[99, 4]], color: 0 }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].opIndex).toBe(0);
    expect(result.errors[0].message).toContain('0-indexed');
  });

  it('leaves the document completely untouched when any op fails', () => {
    const document = makeDoc();
    const result = applyOps(document, [
      { type: 'set_pixels', points: [[0, 0]], color: 1 },
      { type: 'fill_rect', x: 3, y: 3, width: 5, height: 1, color: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].opIndex).toBe(1);
    expect(result.document).toBe(document);
    expect(document.revision).toBe(1);
    expect(at(result.document, 0, 0)).toBe(TRANSPARENT);
  });

  it('rejects unknown colours and empty batches', () => {
    const document = makeDoc();
    expect(applyOps(document, [{ type: 'set_pixels', points: [[0, 0]], color: 99 }]).ok).toBe(false);
    expect(applyOps(document, []).ok).toBe(false);
  });

  it('bumps the revision on success', () => {
    const document = makeDoc();
    const next = applyOk(document, [{ type: 'set_pixels', points: [[0, 0]], color: 2 }]);
    expect(next.revision).toBe(document.revision + 1);
    expect(at(next, 0, 0)).toBe(2);
  });
});

describe('applyOps - drawing primitives', () => {
  it('fills a rectangle inclusively', () => {
    const next = applyOk(makeDoc(), [{ type: 'fill_rect', x: 1, y: 1, width: 2, height: 2, color: 3 }]);
    expect(at(next, 1, 1)).toBe(3);
    expect(at(next, 2, 2)).toBe(3);
    expect(at(next, 0, 0)).toBe(TRANSPARENT);
    expect(at(next, 3, 3)).toBe(TRANSPARENT);
  });

  it('skips points outside a clip', () => {
    const next = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0], [1, 1]], color: 1 }], {
      clip: { x: 1, y: 1, width: 2, height: 2 },
    });
    expect(at(next, 0, 0)).toBe(TRANSPARENT);
    expect(at(next, 1, 1)).toBe(1);
  });

  it('draws a line including both endpoints', () => {
    const next = applyOk(makeDoc(), [{ type: 'line', x0: 0, y0: 0, x1: 3, y1: 0, color: 1 }]);
    expect([at(next, 0, 0), at(next, 1, 0), at(next, 2, 0), at(next, 3, 0)]).toEqual([1, 1, 1, 1]);
    expect(linePoints(0, 0, 0, 0)).toEqual([[0, 0]]);
  });

  it('clears a rectangle to transparent', () => {
    const next = applyOk(filledDocument(2), [{ type: 'clear_rect', x: 1, y: 1, width: 2, height: 2 }]);
    expect(at(next, 1, 1)).toBe(TRANSPARENT);
    expect(at(next, 0, 0)).toBe(2);
  });
});

describe('applyOps - flood fill', () => {
  it('stops at a barrier and stays inside the canvas', () => {
    const document = applyOk(makeDoc(), [{ type: 'line', x0: 2, y0: 0, x1: 2, y1: 3, color: 1 }]);
    const next = applyOk(document, [{ type: 'flood_fill', x: 0, y: 0, color: 3 }]);
    expect(at(next, 0, 0)).toBe(3);
    expect(at(next, 1, 3)).toBe(3);
    expect(at(next, 2, 0)).toBe(1);
    expect(at(next, 3, 0)).toBe(TRANSPARENT);
  });

  it('is a no-op when the seed already has the target colour', () => {
    const next = applyOk(filledDocument(2), [{ type: 'flood_fill', x: 0, y: 0, color: 2 }]);
    expect(at(next, 0, 0)).toBe(2);
  });

  it('respects a clip rect while flooding', () => {
    const document = filledDocument(1);
    const next = applyOk(document, [{ type: 'flood_fill', x: 0, y: 0, color: 3 }], {
      clip: { x: 0, y: 0, width: 2, height: 4 },
    });
    expect(at(next, 1, 1)).toBe(3);
    expect(at(next, 2, 1)).toBe(1);
  });
});

describe('applyOps - stamps', () => {
  it('replace mode lets transparent cells erase', () => {
    const next = applyOk(filledDocument(2), [
      { type: 'stamp', x: 0, y: 0, rows: ['00', '.1'], mode: 'replace' },
    ]);
    expect(at(next, 0, 0)).toBe(0);
    expect(at(next, 1, 0)).toBe(0);
    expect(at(next, 0, 1)).toBe(TRANSPARENT);
    expect(at(next, 1, 1)).toBe(1);
    expect(at(next, 2, 0)).toBe(2);
  });

  it('overlay mode leaves transparent cells untouched', () => {
    const next = applyOk(filledDocument(2), [
      { type: 'stamp', x: 0, y: 0, rows: ['00', '.1'], mode: 'overlay' },
    ]);
    expect(at(next, 0, 1)).toBe(2);
    expect(at(next, 1, 1)).toBe(1);
  });

  it('accepts numeric rows smaller than the palette', () => {
    const next = applyOk(filledDocument(2), [
      { type: 'stamp', x: 2, y: 2, rows: [[3, 3], [3, 3]], mode: 'replace' },
    ]);
    expect(at(next, 3, 3)).toBe(3);
  });

  it('decodes stamp glyphs through the active palette, not raw indices', () => {
    const document = makeDoc(2, 1);
    const reordered: PixelDocument = {
      ...document,
      // Active order: palette[2] is glyph "0", palette[0] is glyph "1".
      activeColorIds: [document.palette[2].id, document.palette[0].id],
    };

    const next = applyOk(reordered, [{ type: 'stamp', x: 0, y: 0, rows: ['01'], mode: 'replace' }]);

    expect(at(next, 0, 0)).toBe(2);
    expect(at(next, 1, 0)).toBe(0);
  });

  it('rejects a glyph that is not in the active palette', () => {
    const document = makeDoc(2, 1);
    const restricted: PixelDocument = { ...document, activeColorIds: [document.palette[0].id] };

    const result = applyOps(restricted, [{ type: 'stamp', x: 0, y: 0, rows: ['1'], mode: 'replace' }]);

    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('not in the active palette');
  });

  it('rejects unknown glyphs and ragged rows', () => {
    const document = filledDocument(2);
    expect(applyOps(document, [{ type: 'stamp', x: 0, y: 0, rows: ['zz'], mode: 'replace' }]).ok).toBe(false);
    expect(applyOps(document, [{ type: 'stamp', x: 0, y: 0, rows: ['00', '0'], mode: 'replace' }]).ok).toBe(false);
  });

  it('rejects a stamp that would run off the canvas', () => {
    const result = applyOps(filledDocument(2), [
      { type: 'stamp', x: 3, y: 3, rows: ['00', '00'], mode: 'replace' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('outside');
  });
});

describe('applyOps - whole layer transforms', () => {
  it('flips horizontally', () => {
    const document = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);
    const next = applyOk(document, [{ type: 'flip', axis: 'horizontal' }]);
    expect(at(next, 0, 0)).toBe(TRANSPARENT);
    expect(at(next, 3, 0)).toBe(1);
  });

  it('flips vertically', () => {
    const document = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);
    const next = applyOk(document, [{ type: 'flip', axis: 'vertical' }]);
    expect(at(next, 0, 3)).toBe(1);
  });

  it('shifts with transparent fill', () => {
    const document = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);
    const next = applyOk(document, [{ type: 'shift', dx: 1, dy: 1 }]);
    expect(at(next, 1, 1)).toBe(1);
    expect(at(next, 0, 0)).toBe(TRANSPARENT);
  });

  it('confines a flip to the clip rectangle', () => {
    const document = applyOk(makeDoc(), [
      { type: 'set_pixels', points: [[0, 0]], color: 1 },
      { type: 'set_pixels', points: [[3, 0]], color: 2 },
    ]);

    const next = applyOk(document, [{ type: 'flip', axis: 'horizontal' }], {
      clip: { x: 0, y: 0, width: 2, height: 1 },
    });

    expect(at(next, 0, 0)).toBe(TRANSPARENT);
    expect(at(next, 1, 0)).toBe(1);
    // Outside the clip is untouched.
    expect(at(next, 3, 0)).toBe(2);
  });

  it('confines a shift to the clip rectangle', () => {
    const document = applyOk(makeDoc(), [
      { type: 'set_pixels', points: [[0, 0]], color: 1 },
      { type: 'set_pixels', points: [[3, 0]], color: 2 },
    ]);

    const next = applyOk(document, [{ type: 'shift', dx: 1, dy: 0 }], {
      clip: { x: 0, y: 0, width: 2, height: 1 },
    });

    expect(at(next, 0, 0)).toBe(TRANSPARENT);
    expect(at(next, 1, 0)).toBe(1);
    expect(at(next, 3, 0)).toBe(2);
  });
});

describe('clip bounds', () => {
  it('intersects a clip that runs past the canvas edge instead of wrapping rows', () => {
    const document = applyOk(makeDoc(), [
      { type: 'set_pixels', points: [[3, 0]], color: 1 },
      { type: 'set_pixels', points: [[0, 0]], color: 2 },
    ]);

    const next = applyOk(document, [{ type: 'flip', axis: 'horizontal' }], {
      clip: { x: 3, y: 0, width: 2, height: 1 },
    });

    // Effective clip is a single column, so the flip is a no-op there; the next
    // row must not be touched.
    expect(at(next, 3, 0)).toBe(1);
    expect(at(next, 0, 0)).toBe(2);
    expect(at(next, 0, 1)).toBe(TRANSPARENT);
  });

  it('rejects a clip that does not overlap the canvas', () => {
    const document = makeDoc();
    const result = applyOps(document, [{ type: 'flip', axis: 'horizontal' }], {
      clip: { x: 10, y: 0, width: 2, height: 1 },
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0].opType).toBe('clip');
    expect(result.errors[0].message).toContain('does not overlap');
    expect(result.document).toBe(document);
  });

  it('clamps a negative clip origin', () => {
    const document = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);

    const next = applyOk(document, [{ type: 'shift', dx: -5, dy: 0 }], {
      clip: { x: -2, y: 0, width: 4, height: 1 },
    });

    expect(at(next, 0, 0)).toBe(TRANSPARENT);
    expect(at(next, 2, 0)).toBe(TRANSPARENT);
  });

  it('treats a clip larger than the canvas as the whole canvas', () => {
    const document = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0]], color: 1 }]);

    const next = applyOk(document, [{ type: 'flip', axis: 'horizontal' }], {
      clip: { x: 0, y: 0, width: 999, height: 999 },
    });

    expect(at(next, 3, 0)).toBe(1);
  });
});

describe('applyOps - replace colour', () => {
  it('remaps a colour only inside the clip', () => {
    const next = applyOk(filledDocument(1), [{ type: 'replace_color', from: 1, to: 2 }], {
      clip: { x: 1, y: 1, width: 2, height: 2 },
    });
    expect(at(next, 0, 0)).toBe(1);
    expect(at(next, 1, 1)).toBe(2);
    expect(at(next, 2, 2)).toBe(2);
    expect(at(next, 3, 3)).toBe(1);
  });
});

describe('active palette', () => {
  function widePalette(size: number): PixelPaletteColor[] {
    return Array.from({ length: size }, (_, index) => ({
      id: `c${index}`,
      hex: `#${index.toString(16).padStart(2, '0')}0000`,
    }));
  }

  it('activates as much of the palette as the glyph set allows', () => {
    const document = createDocument({ width: 1, height: 1, palette: widePalette(70) });
    expect(document.activeColorIds).toHaveLength(MAX_GLYPH_COLORS);
    expect(document.activeColorIds[0]).toBe('c0');
  });

  it('keeps every colour active for a small palette', () => {
    const document = makeDoc();
    expect(document.activeColorIds).toHaveLength(document.palette.length);
  });

  it('repairs a document that has no active palette field', () => {
    const document = makeDoc();
    const { activeColorIds: _removed, ...legacy } = document;
    const normalized = normalizePixelDocument(legacy as PixelDocument);
    expect(normalized.activeColorIds).toHaveLength(document.palette.length);
  });

  it('puts colours already in use at the front when repairing', () => {
    const document = applyOk(makeDoc(), [{ type: 'set_pixels', points: [[0, 0]], color: 3 }]);
    const { activeColorIds: _removed, ...legacy } = document;
    const normalized = normalizePixelDocument(legacy as PixelDocument);
    expect(normalized.activeColorIds[0]).toBe(normalized.palette[3].id);
  });

  it('preserves an intentionally empty active palette', () => {
    const document = makeDoc();
    const cleared: PixelDocument = { ...document, activeColorIds: [] };
    expect(normalizePixelDocument(cleared).activeColorIds).toEqual([]);
  });

  it('leaves a valid active palette untouched', () => {
    const document = makeDoc();
    expect(normalizePixelDocument(document).activeColorIds).toEqual(document.activeColorIds);
  });
});

describe('palette grid width', () => {
  it('defaults new documents to the standard width', () => {
    expect(makeDoc().paletteColumns).toBe(DEFAULT_PALETTE_COLUMNS);
  });

  it('fills in a missing width when normalising', () => {
    const document = makeDoc();
    const { paletteColumns: _removed, ...legacy } = document;
    expect(normalizePixelDocument(legacy as PixelDocument).paletteColumns).toBe(DEFAULT_PALETTE_COLUMNS);
  });

  it('keeps a configured width', () => {
    const document: PixelDocument = { ...makeDoc(), paletteColumns: 6 };
    expect(normalizePixelDocument(document).paletteColumns).toBe(6);
  });

  it('fills in a missing width on a saved palette', () => {
    const legacy = {
      id: 'palette-1',
      name: 'Otterisk 96',
      colors: [],
      createdOn: '2024-01-01T00:00:00.000Z',
      updatedOn: '2024-01-01T00:00:00.000Z',
    } as unknown as SavedPixelPalette;
    expect(normalizeSavedPalette(legacy).columns).toBe(DEFAULT_PALETTE_COLUMNS);
  });
});
