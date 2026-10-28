import { PixelDocument, PixelPaletteColor, TRANSPARENT } from '../types';
import { activeLayerOf, applyOps, createDocument } from '../ops';
import { DEFAULT_PALETTE } from '../palette';
import { decodeGlyphRows, encodeGrid, inspectRegion, toRgba, valueMap } from '../serialize';

function paletteOfSize(size: number): PixelPaletteColor[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `color_${index}`,
    hex: `#${index.toString(16).padStart(2, '0')}8080`,
  }));
}

function makeDoc(width = 4, height = 4, palette = DEFAULT_PALETTE.slice(0, 4)): PixelDocument {
  return createDocument({ name: 'grid', width, height, palette });
}

function layerPixels(document: PixelDocument): number[] {
  const layer = activeLayerOf(document);
  if (!layer) throw new Error('document has no layer');
  return layer.pixels;
}

describe('encodeGrid', () => {
  it('emits one row per canvas row with a legend', () => {
    const document = makeDoc(3, 2);
    const grid = encodeGrid(document);
    expect(grid.mode).toBe('glyph');
    expect(grid.rows).toEqual(['...', '...']);
    expect(grid.legend).toContain('=transparent');
    expect(grid.legend).toContain('0=');
  });

  it('round-trips glyph rows back to the same pixels', () => {
    const document = applyOps(makeDoc(), [
      { type: 'fill_rect', x: 0, y: 0, width: 2, height: 2, color: 1 },
      { type: 'set_pixels', points: [[3, 3]], color: 3 },
    ]).document;
    const grid = encodeGrid(document);
    if (grid.mode !== 'glyph') throw new Error('expected glyph mode');
    expect(decodeGlyphRows(grid.rows, document)).toEqual(layerPixels(document));
  });

  it('maps glyphs by active position rather than palette index', () => {
    const document = makeDoc(2, 1);
    const restricted: PixelDocument = {
      ...document,
      activeColorIds: [document.palette[2].id, document.palette[0].id],
    };
    const result = applyOps(restricted, [{ type: 'set_pixels', points: [[0, 0]], color: 0 }]);
    expect(result.ok).toBe(true);

    const grid = encodeGrid(result.document);
    if (grid.mode !== 'glyph') throw new Error('expected glyph mode');
    expect(grid.rows[0]).toBe('1.');
  });

  it('falls back to numeric rows when a used colour is not active', () => {
    const palette = paletteOfSize(63);
    const document = makeDoc(2, 2, palette);
    const restricted: PixelDocument = {
      ...document,
      activeColorIds: [palette[0].id, palette[1].id],
    };

    const result = applyOps(restricted, [{ type: 'set_pixels', points: [[0, 0]], color: 40 }]);
    expect(result.ok).toBe(true);

    const grid = encodeGrid(result.document);
    expect(grid.mode).toBe('numeric');
    if (grid.mode !== 'numeric') throw new Error('expected numeric mode');
    expect(grid.rows[0][0]).toBe(40);
  });
});

describe('valueMap', () => {
  it('uses digits for opaque pixels and dots for transparent ones', () => {
    const whiteIndex = DEFAULT_PALETTE.findIndex((color) => color.id === 'white');
    const result = applyOps(makeDoc(2, 1, DEFAULT_PALETTE), [
      { type: 'set_pixels', points: [[0, 0]], color: whiteIndex },
    ]);
    expect(result.ok).toBe(true);
    expect(valueMap(result.document)).toEqual(['9.']);
  });
});

describe('inspectRegion', () => {
  it('labels the region and includes a legend', () => {
    const document = applyOps(makeDoc(8, 8), [{ type: 'set_pixels', points: [[1, 1]], color: 2 }]).document;
    const text = inspectRegion(document, { x: 0, y: 0, width: 4, height: 3 });
    expect(text).toContain('region x=0 y=0 4x3');
    expect(text).toContain('legend:');
    expect(text).toContain('0123');
  });

  it('clamps a region that would run off the canvas', () => {
    const document = makeDoc(4, 4);
    const text = inspectRegion(document, { x: 2, y: 2, width: 99, height: 99 });
    expect(text).toContain('region x=2 y=2 2x2');
  });

  it('prints real palette indices when the palette is too large for glyphs', () => {
    const palette = paletteOfSize(63);
    const result = applyOps(makeDoc(3, 1, palette), [
      { type: 'set_pixels', points: [[0, 0]], color: 12 },
      { type: 'set_pixels', points: [[2, 0]], color: 62 },
    ]);
    expect(result.ok).toBe(true);

    const text = inspectRegion(result.document, { x: 0, y: 0, width: 3, height: 1 });
    expect(text).toContain('cells are palette indices');
    // Both cells print real indices: index 12 is active but must not leak a glyph.
    expect(text).toContain('12  . 62');
  });
});

describe('toRgba', () => {
  it('writes palette colour bytes and leaves transparent pixels at zero alpha', () => {
    const bytes = toRgba([0, TRANSPARENT], DEFAULT_PALETTE.slice(0, 4));
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x0d, 0x0b, 0x12, 255]);
    expect([bytes[4], bytes[5], bytes[6], bytes[7]]).toEqual([0, 0, 0, 0]);
  });
});
