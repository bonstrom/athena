import { GLYPH_ALPHABET, PixelDocument, PixelPaletteColor, PixelRect, TRANSPARENT, TRANSPARENT_GLYPH } from './types';
import { glyphReferences, hexToRgb, luminance, legendFor } from './palette';
import { activeLayerOf } from './ops';
import { clampRect } from './selection';

export interface GlyphGrid {
  mode: 'glyph';
  rows: string[];
  legend: string;
}

export interface NumericGrid {
  mode: 'numeric';
  rows: number[][];
  legend: string;
}

export type GridEncoding = GlyphGrid | NumericGrid;

/**
 * Flatten all visible layers bottom-to-top. The first opaque pixel wins, which
 * matches how a sprite reads once exported.
 */
export function compositePixels(document: PixelDocument): number[] {
  const result = Array.from({ length: document.width * document.height }, (): number => TRANSPARENT);
  for (const layer of document.layers) {
    if (!layer.visible) continue;
    for (let index = 0; index < result.length; index += 1) {
      const value = layer.pixels[index];
      if (value !== TRANSPARENT) result[index] = value;
    }
  }
  return result;
}

/** Palette indices -> RGBA bytes. Transparent pixels get alpha 0. */
export function toRgba(pixels: number[], palette: PixelPaletteColor[]): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(pixels.length * 4);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const paletteIndex = pixels[index];
    if (paletteIndex === TRANSPARENT) continue;
    if (paletteIndex < 0 || paletteIndex >= palette.length) continue;
    const rgb = hexToRgb(palette[paletteIndex].hex);
    if (!rgb) continue;
    bytes[offset] = rgb[0];
    bytes[offset + 1] = rgb[1];
    bytes[offset + 2] = rgb[2];
    bytes[offset + 3] = 255;
  }
  return bytes;
}

/** Active palette index -> glyph. Null when nothing is active. */
function glyphMapFor(document: PixelDocument): Map<number, string> | null {
  const references = glyphReferences(document.activeColorIds, document.palette);
  if (references.length === 0) return null;
  const map = new Map<number, string>();
  for (const reference of references) map.set(reference.paletteIndex, reference.glyph);
  return map;
}

function allPixelsMapped(pixels: number[], glyphByIndex: Map<number, string>): boolean {
  for (const value of pixels) {
    if (value !== TRANSPARENT && !glyphByIndex.has(value)) return false;
  }
  return true;
}

function regionPixelsMapped(
  pixels: number[],
  documentWidth: number,
  rect: PixelRect,
  glyphByIndex: Map<number, string>,
): boolean {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const value = pixels[y * documentWidth + x];
      if (value !== TRANSPARENT && !glyphByIndex.has(value)) return false;
    }
  }
  return true;
}

/**
 * Encode a document as a character grid.
 *
 * Glyph mode is used whenever every opaque pixel has an active colour, which is
 * the normal case: a sprite only activates the colours it needs. If the artwork
 * uses a colour that has been deactivated, the whole grid falls back to numeric
 * rows rather than silently remapping glyphs.
 */
export function encodeGrid(document: PixelDocument, layerId?: string): GridEncoding {
  const layer = layerId ? document.layers.find((candidate) => candidate.id === layerId) : activeLayerOf(document);
  const pixels = layer ? layer.pixels : compositePixels(document);
  const glyphByIndex = glyphMapFor(document);

  if (glyphByIndex && allPixelsMapped(pixels, glyphByIndex)) {
    const rows: string[] = [];
    for (let y = 0; y < document.height; y += 1) {
      let row = '';
      for (let x = 0; x < document.width; x += 1) {
        const value = pixels[y * document.width + x];
        row += value === TRANSPARENT ? TRANSPARENT_GLYPH : (glyphByIndex.get(value) ?? TRANSPARENT_GLYPH);
      }
      rows.push(row);
    }
    return { mode: 'glyph', rows, legend: legendFor(document) };
  }

  const rows: number[][] = [];
  for (let y = 0; y < document.height; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < document.width; x += 1) row.push(pixels[y * document.width + x]);
    rows.push(row);
  }
  return { mode: 'numeric', rows, legend: legendFor(document) };
}

/** Decode glyph rows back to palette indices. Returns null on an unknown glyph. */
export function decodeGlyphRows(rows: string[], document: PixelDocument): number[] | null {
  const byGlyph = new Map<string, number>();
  for (const reference of glyphReferences(document.activeColorIds, document.palette)) {
    byGlyph.set(reference.glyph, reference.paletteIndex);
  }

  const pixels: number[] = [];
  for (const row of rows) {
    for (const glyph of row) {
      if (glyph === TRANSPARENT_GLYPH) {
        pixels.push(TRANSPARENT);
        continue;
      }
      const index = byGlyph.get(glyph);
      if (index === undefined) return null;
      pixels.push(index);
    }
  }
  return pixels;
}

/**
 * Luminance map: one digit per pixel, `.` for transparent. Gives a text-only
 * reader a sense of value grouping without needing to see the image.
 */
export function valueMap(document: PixelDocument): string[] {
  const pixels = compositePixels(document);
  const rows: string[] = [];
  for (let y = 0; y < document.height; y += 1) {
    let row = '';
    for (let x = 0; x < document.width; x += 1) {
      const value = pixels[y * document.width + x];
      if (value === TRANSPARENT) {
        row += TRANSPARENT_GLYPH;
        continue;
      }
      const color = document.palette.at(value);
      if (!color) {
        row += TRANSPARENT_GLYPH;
        continue;
      }
      const step = Math.min(9, Math.max(0, Math.round(luminance(color.hex) * 9)));
      row += String(step);
    }
    rows.push(row);
  }
  return rows;
}

function clampToCanvas(document: PixelDocument, rect: PixelRect): PixelRect {
  return clampRect(rect, document.width, document.height);
}

/**
 * Coordinate-labelled view of one region. This is what a model should read
 * instead of being handed the whole canvas.
 */
export function inspectRegion(document: PixelDocument, rawRect: PixelRect): string {
  const rect = clampToCanvas(document, rawRect);
  const pixels = compositePixels(document);
  const glyphByIndex = glyphMapFor(document);
  const useGlyphs = glyphByIndex !== null && regionPixelsMapped(pixels, document.width, rect, glyphByIndex);
  // Numeric mode prints real indices; "% 10" would collide above ten colours.
  const cellWidth = useGlyphs ? 1 : Math.max(1, String(Math.max(0, document.palette.length - 1)).length);
  const glyphLookup = useGlyphs ? glyphByIndex : null;

  const lines: string[] = [
    `"${document.name}" ${document.width}x${document.height} rev ${document.revision}`,
    `region x=${rect.x} y=${rect.y} ${rect.width}x${rect.height}`,
  ];

  if (useGlyphs) {
    const ruler = Array.from({ length: rect.width }, (_, offset) => String((rect.x + offset) % 10)).join('');
    lines.push(`     ${ruler}`);
  } else {
    lines.push("cells are palette indices; '.' is transparent");
  }

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    const cells: string[] = [];
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const value = pixels[y * document.width + x];
      if (value === TRANSPARENT) {
        cells.push(useGlyphs ? TRANSPARENT_GLYPH : TRANSPARENT_GLYPH.padStart(cellWidth, ' '));
        continue;
      }
      const glyph = glyphLookup?.get(value);
      cells.push(glyph === undefined ? String(value).padStart(cellWidth, ' ') : glyph);
    }
    const label = String(y).padStart(3, ' ');
    lines.push(`${label} | ${useGlyphs ? cells.join('') : cells.join(' ')}`);
  }

  lines.push(`legend: ${legendFor(document)}`);
  return lines.join('\n');
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas could not be encoded as PNG.'));
    }, 'image/png');
  });
}

function renderToCanvas(document: PixelDocument, scale: number): HTMLCanvasElement {
  const pixels = compositePixels(document);
  const rgba = toRgba(pixels, document.palette);

  const source = globalThis.document.createElement('canvas');
  source.width = document.width;
  source.height = document.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('2D canvas is not available.');
  sourceContext.putImageData(new ImageData(rgba, document.width, document.height), 0, 0);

  const factor = Math.max(1, Math.floor(scale));
  if (factor === 1) return source;

  const scaled = globalThis.document.createElement('canvas');
  scaled.width = document.width * factor;
  scaled.height = document.height * factor;
  const scaledContext = scaled.getContext('2d');
  if (!scaledContext) throw new Error('2D canvas is not available.');
  scaledContext.imageSmoothingEnabled = false;
  scaledContext.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled;
}

/**
 * Render to PNG. Scaling is always nearest-neighbour and integer-only, so no
 * antialiasing can sneak into the export.
 */
export async function exportPng(document: PixelDocument, scale = 1): Promise<Blob> {
  return canvasToBlob(renderToCanvas(document, scale));
}

/** Every glyph the glyph grid can emit, for legend/help text. */
export const GRID_GLYPHS = GLYPH_ALPHABET;
