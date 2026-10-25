import { BitmapSource, bitmapToPaletteRows, fitDimensions } from '../bitmapImport';
import { PixelPaletteColor, TRANSPARENT } from '../types';

const PALETTE: PixelPaletteColor[] = [
  { id: 'black', hex: '#000000' },
  { id: 'white', hex: '#ffffff' },
  { id: 'red', hex: '#ff0000' },
];

function hexToBytes(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Build a bitmap from a row-major list of hex colours; null means transparent. */
function bitmap(width: number, height: number, colors: (string | null)[]): BitmapSource {
  const data = new Uint8ClampedArray(width * height * 4);
  colors.forEach((hex, index): void => {
    if (!hex) return;
    const [red, green, blue] = hexToBytes(hex);
    const offset = index * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = 255;
  });
  return { width, height, data };
}

describe('fitDimensions', () => {
  it('places a smaller image 1:1 instead of enlarging it', () => {
    expect(fitDimensions(2, 2, 4, 4)).toEqual({ width: 2, height: 2 });
  });

  it('scales a larger image down to fit, preserving aspect ratio', () => {
    expect(fitDimensions(8, 8, 4, 4)).toEqual({ width: 4, height: 4 });
    expect(fitDimensions(8, 4, 4, 4)).toEqual({ width: 4, height: 2 });
    expect(fitDimensions(4, 8, 4, 4)).toEqual({ width: 2, height: 4 });
  });
});

describe('bitmapToPaletteRows', () => {
  it('maps exact palette colours without snapping', () => {
    const source = bitmap(2, 1, ['#000000', '#ff0000']);
    const result = bitmapToPaletteRows(source, PALETTE, 2, 1);

    expect(result.rows).toEqual([[0, 2]]);
    expect(result.snappedColors).toBe(0);
    expect(result.placed).toEqual({ x: 0, y: 0, width: 2, height: 1 });
  });

  it('snaps an unknown colour to the nearest palette entry and reports the drift', () => {
    const source = bitmap(1, 1, ['#fe0101']);
    const result = bitmapToPaletteRows(source, PALETTE, 1, 1);

    expect(result.rows[0][0]).toBe(2);
    expect(result.snappedColors).toBe(1);
    expect(result.unmatchedColors).toEqual(['#fe0101']);
    expect(result.maxChannelDelta).toBe(1);
    expect(result.examples[0]).toEqual({ from: '#fe0101', to: '#ff0000', delta: 1 });
  });

  it('reports a large delta when the image uses a different palette', () => {
    const source = bitmap(1, 1, ['#00ff00']);
    const result = bitmapToPaletteRows(source, PALETTE, 1, 1);

    // Green is far from every entry; the worst-case channel gap is reported.
    expect(result.maxChannelDelta).toBeGreaterThan(100);
    expect(result.examples).toHaveLength(1);
  });

  it('treats transparent pixels as empty', () => {
    const source = bitmap(2, 1, [null, '#ffffff']);
    const result = bitmapToPaletteRows(source, PALETTE, 2, 1);

    expect(result.rows[0]).toEqual([TRANSPARENT, 1]);
  });

  it('reports the distinct palette indices the image uses, ascending', () => {
    const source = bitmap(3, 1, ['#ff0000', null, '#000000']);
    const result = bitmapToPaletteRows(source, PALETTE, 3, 1);

    expect(result.usedPaletteIndices).toEqual([0, 2]);
  });

  it('centres a smaller image and leaves the rest empty', () => {
    const source = bitmap(2, 2, ['#000000', '#000000', '#000000', '#000000']);
    const result = bitmapToPaletteRows(source, PALETTE, 4, 4);

    expect(result.placed).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(result.rows[0]).toEqual([TRANSPARENT, TRANSPARENT, TRANSPARENT, TRANSPARENT]);
    expect(result.rows[1]).toEqual([TRANSPARENT, 0, 0, TRANSPARENT]);
    expect(result.rows[2]).toEqual([TRANSPARENT, 0, 0, TRANSPARENT]);
  });

  it('reduces a blocky upscale back to the original pixels', () => {
    // 2x2 logical sprite exported at 4x: each pixel becomes a 2x2 block.
    const red = '#ff0000';
    const source = bitmap(
      4,
      4,
      [
        red,
        red,
        '#000000',
        '#000000',
        red,
        red,
        '#000000',
        '#000000',
        '#000000',
        '#000000',
        '#ffffff',
        '#ffffff',
        '#000000',
        '#000000',
        '#ffffff',
        '#ffffff',
      ].flat(),
    );

    const result = bitmapToPaletteRows(source, PALETTE, 2, 2);
    expect(result.rows).toEqual([
      [2, 0],
      [0, 1],
    ]);
    expect(result.snappedColors).toBe(0);
  });

  it('keeps aspect ratio when a wide image is fitted', () => {
    const source = bitmap(
      8,
      4,
      Array.from({ length: 32 }, (): string => '#000000'),
    );
    const result = bitmapToPaletteRows(source, PALETTE, 4, 4);

    expect(result.placed).toEqual({ x: 0, y: 1, width: 4, height: 2 });
    expect(result.rows[0]).toEqual([TRANSPARENT, TRANSPARENT, TRANSPARENT, TRANSPARENT]);
    expect(result.rows[1]).toEqual([0, 0, 0, 0]);
  });
});
