import {
  DEFAULT_PALETTE,
  clampPaletteColumns,
  glyphForIndex,
  glyphReferences,
  hexToRgb,
  indexForGlyph,
  legendFor,
  luminance,
  normalizeHex,
  parseGpl,
  parseGplColumns,
  parseGplName,
  serializeGpl,
} from '../palette';
import { createDocument } from '../ops';
import {
  DEFAULT_PALETTE_COLUMNS,
  MAX_GLYPH_COLORS,
  MAX_PALETTE_COLUMNS,
  MIN_PALETTE_COLUMNS,
  PixelPaletteColor,
  TRANSPARENT_GLYPH,
} from '../types';

function paletteOfSize(size: number): PixelPaletteColor[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `color_${index}`,
    hex: `#${index.toString(16).padStart(2, '0')}8080`,
  }));
}

describe('colour helpers', () => {
  it('normalises hex values', () => {
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc');
    expect(normalizeHex('aabbcc')).toBe('#aabbcc');
    expect(normalizeHex('#abc')).toBeNull();
    expect(normalizeHex('nope')).toBeNull();
  });

  it('converts hex to rgb', () => {
    expect(hexToRgb('#102030')).toEqual([16, 32, 48]);
    expect(hexToRgb('bad')).toBeNull();
  });

  it('orders luminance black < white', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#808080'));
  });
});

describe('glyph mapping', () => {
  it('round-trips every glyph in range', () => {
    for (let index = 0; index < MAX_GLYPH_COLORS; index += 1) {
      const glyph = glyphForIndex(index);
      expect(glyph).not.toBeNull();
      expect(indexForGlyph(glyph ?? '')).toBe(index);
    }
  });

  it('reserves the transparent glyph and rejects unknowns', () => {
    expect(indexForGlyph(TRANSPARENT_GLYPH)).toBe(-1);
    expect(indexForGlyph('#')).toBeNull();
    expect(glyphForIndex(MAX_GLYPH_COLORS)).toBeNull();
    expect(glyphForIndex(-1)).toBeNull();
  });

  it('only enables glyph grids up to the alphabet size', () => {
    const palette = paletteOfSize(MAX_GLYPH_COLORS + 1);
    expect(glyphReferences(palette.map((color) => color.id), palette)).toHaveLength(MAX_GLYPH_COLORS);
  });
});

describe('active palette references', () => {
  it('assigns glyphs by position in the active list, not by palette index', () => {
    const palette = paletteOfSize(4);
    const references = glyphReferences([palette[2].id, palette[0].id], palette);

    expect(references.map((reference) => [reference.glyph, reference.paletteIndex])).toEqual([
      ['0', 2],
      ['1', 0],
    ]);
    expect(references[0].id).toBe(palette[2].id);
  });

  it('ignores ids that are no longer in the palette', () => {
    const palette = paletteOfSize(2);
    expect(glyphReferences(['gone'], palette)).toEqual([]);
  });

  it('builds a legend that maps glyph to palette index and name', () => {
    const document = createDocument({ width: 1, height: 1, palette: paletteOfSize(3) });
    const legend = legendFor(document);

    expect(legend).toContain(`${TRANSPARENT_GLYPH}=transparent`);
    expect(legend).toContain('0=0 color_0');
    expect(legend).toContain('2=2 color_2');
  });
});

describe('gpl import/export', () => {
  const sample = [
    'GIMP Palette',
    'Name: Test ramp',
    'Columns: 8',
    '# a comment',
    '13 11 18 void',
    '31 27 46 shadow',
    '122 81 120 skin shadow',
    '',
  ].join('\n');

  it('parses colours, skipping headers and comments', () => {
    const colors = parseGpl(sample);
    expect(colors).toHaveLength(3);
    expect(colors[0]).toEqual({ id: 'void', hex: '#0d0b12' });
    expect(colors[2]).toEqual({ id: 'skin_shadow', hex: '#7a5178' });
  });

  it('de-duplicates repeated names', () => {
    const colors = parseGpl('1 2 3 same\n4 5 6 same\n7 8 9 same');
    expect(colors.map((color) => color.id)).toEqual(['same', 'same_2', 'same_3']);
  });

  it('skips malformed and out-of-range lines instead of throwing', () => {
    const colors = parseGpl('255 0 0 ok\n999 0 0 bad\n0 0\nnot a colour');
    expect(colors).toEqual([{ id: 'ok', hex: '#ff0000' }]);
  });

  it('round-trips through serializeGpl', () => {
    const text = serializeGpl('Round trip', DEFAULT_PALETTE);
    expect(text.startsWith('GIMP Palette')).toBe(true);
    expect(text).toContain('Name: Round trip');
    const parsed = parseGpl(text);
    expect(parsed).toHaveLength(DEFAULT_PALETTE.length);
    expect(parsed.map((color) => color.hex)).toEqual(DEFAULT_PALETTE.map((color) => color.hex));
    expect(parsed.map((color) => color.id)).toEqual(DEFAULT_PALETTE.map((color) => color.id));
  });

  it('reads the palette name from the header', () => {
    expect(parseGplName('GIMP Palette\nName: Dungeon 24\n13 11 18 void')).toBe('Dungeon 24');
  });

  it('reads a name written as a comment line', () => {
    const text = [
      'GIMP Palette',
      '#Palette Name: Otterisk 96',
      '#Description: ',
      '#Colors: 96',
      '13 11 18 void',
    ].join('\n');
    expect(parseGplName(text)).toBe('Otterisk 96');
  });

  it('tolerates a space after the hash and the Palette prefix', () => {
    expect(parseGplName('GIMP Palette\n# Palette Name: Spaced 32')).toBe('Spaced 32');
    expect(parseGplName('GIMP Palette\n#Name: Bare')).toBe('Bare');
  });

  it('ignores description and colour-count comments', () => {
    const text = ['GIMP Palette', '#Description: nothing here', '#Colors: 96'].join('\n');
    expect(parseGplName(text)).toBeNull();
  });

  it('returns null when the file has no name header', () => {
    expect(parseGplName('GIMP Palette\n13 11 18 void')).toBeNull();
  });
});

describe('gpl columns', () => {
  it('reads the Columns hint, with or without a comment marker', () => {
    expect(parseGplColumns('GIMP Palette\nColumns: 6\n13 11 18 void')).toBe(6);
    expect(parseGplColumns('GIMP Palette\n#Columns: 6')).toBe(6);
  });

  it('rejects a missing or out-of-range hint', () => {
    expect(parseGplColumns('GIMP Palette\nName: x')).toBeNull();
    expect(parseGplColumns('Columns: 0')).toBeNull();
    expect(parseGplColumns('Columns: 99')).toBeNull();
  });

  it('clamps a requested width', () => {
    expect(clampPaletteColumns(0)).toBe(MIN_PALETTE_COLUMNS);
    expect(clampPaletteColumns(99)).toBe(MAX_PALETTE_COLUMNS);
    expect(clampPaletteColumns(Number.NaN)).toBe(DEFAULT_PALETTE_COLUMNS);
    expect(clampPaletteColumns(6.7)).toBe(6);
  });
});
