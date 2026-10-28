import { PixelPaletteColor, TRANSPARENT } from './types';
import { hexToRgb } from './palette';

/** Minimal RGBA bitmap, so the conversion is testable without a canvas. */
export interface BitmapSource {
  width: number;
  height: number;
  /** RGBA bytes, 4 per pixel, row-major. */
  data: Uint8ClampedArray;
}

export interface BitmapImportResult {
  /** Full-canvas palette indices, ready to hand to a `stamp` operation. */
  rows: number[][];
  placed: { x: number; y: number; width: number; height: number };
  /** Distinct source colours that had no exact palette match. */
  snappedColors: number;
  /** Source colours that were not in the palette at all, for reporting. */
  unmatchedColors: string[];
  /** Distinct palette indices actually used by the image, ascending. */
  usedPaletteIndices: number[];
  /**
   * Largest per-channel difference among snapped colours (0-255).
   *
   * A few units means colour-profile rounding; a large value means the image was
   * drawn with a genuinely different palette.
   */
  maxChannelDelta: number;
  /** Worst replacements, for showing the user what changed. */
  examples: { from: string; to: string; delta: number }[];
}

interface PaletteMatch {
  index: number;
  /** Max per-channel distance to the matched colour. */
  delta: number;
  hex: string;
}

/** Below this alpha a pixel is treated as empty rather than blended. */
const ALPHA_THRESHOLD = 128;

/**
 * Choose where the image lands on the canvas.
 *
 * Smaller images are placed 1:1 — upscaling pixel art that already fits would
 * double pixels for no reason. Larger images are scaled down to fit, preserving
 * aspect ratio, which recovers the original exactly when the PNG is a clean 2x/4x
 * export.
 */
export function fitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number } {
  if (sourceWidth <= canvasWidth && sourceHeight <= canvasHeight) {
    return { width: Math.max(1, sourceWidth), height: Math.max(1, sourceHeight) };
  }
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  return {
    width: Math.max(1, Math.min(canvasWidth, Math.round(sourceWidth * scale))),
    height: Math.max(1, Math.min(canvasHeight, Math.round(sourceHeight * scale))),
  };
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/**
 * Convert an RGBA bitmap into palette indices laid out on a full canvas.
 *
 * Exact palette colours are used as-is. Anything else is snapped to the nearest
 * palette colour and reported, because silently inventing colours would break
 * the palette discipline the rest of the editor enforces.
 */
export function bitmapToPaletteRows(
  source: BitmapSource,
  palette: PixelPaletteColor[],
  canvasWidth: number,
  canvasHeight: number,
): BitmapImportResult {
  const paletteRgb: { index: number; r: number; g: number; b: number; hex: string }[] = [];
  const exact = new Map<string, number>();
  palette.forEach((color, index): void => {
    const rgb = hexToRgb(color.hex);
    if (!rgb) return;
    const hex = color.hex.toLowerCase();
    exact.set(hex, index);
    paletteRgb.push({ index, r: rgb[0], g: rgb[1], b: rgb[2], hex });
  });

  const snapped = new Map<string, PaletteMatch>();
  const nearestCache = new Map<string, PaletteMatch>();

  const resolveMatch = (red: number, green: number, blue: number): PaletteMatch => {
    const hex = toHex(red, green, blue);
    const exactIndex = exact.get(hex);
    if (exactIndex !== undefined) return { index: exactIndex, delta: 0, hex };

    const cached = nearestCache.get(hex);
    if (cached) return cached;

    let best: PaletteMatch = { index: TRANSPARENT, delta: 255, hex: '' };
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of paletteRgb) {
      const dr = candidate.r - red;
      const dg = candidate.g - green;
      const db = candidate.b - blue;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = {
          index: candidate.index,
          delta: Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)),
          hex: candidate.hex,
        };
      }
    }

    snapped.set(hex, best);
    nearestCache.set(hex, best);
    return best;
  };

  const target = fitDimensions(source.width, source.height, canvasWidth, canvasHeight);
  const offsetX = Math.floor((canvasWidth - target.width) / 2);
  const offsetY = Math.floor((canvasHeight - target.height) / 2);

  const rows: number[][] = Array.from({ length: canvasHeight }, (): number[] =>
    Array.from({ length: canvasWidth }, (): number => TRANSPARENT),
  );
  const used = new Set<number>();

  for (let y = 0; y < target.height; y += 1) {
    // Nearest-neighbour sampling at the centre of each destination cell: for a
    // clean integer downscale this lands exactly on the centre of the source
    // block, so a 4x export reduces back to the original pixels.
    const sourceY = Math.min(source.height - 1, Math.floor(((y + 0.5) * source.height) / target.height));
    for (let x = 0; x < target.width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(((x + 0.5) * source.width) / target.width));
      const offset = (sourceY * source.width + sourceX) * 4;
      const alpha = source.data[offset + 3];
      if (alpha < ALPHA_THRESHOLD) continue;

      const index = resolveMatch(source.data[offset], source.data[offset + 1], source.data[offset + 2]).index;
      const canvasY = offsetY + y;
      const canvasX = offsetX + x;
      if (canvasY >= 0 && canvasY < canvasHeight && canvasX >= 0 && canvasX < canvasWidth) {
        rows[canvasY][canvasX] = index;
        if (index !== TRANSPARENT) used.add(index);
      }
    }
  }

  const examples = [...snapped.entries()]
    .map(([from, match]) => ({ from, to: match.hex, delta: match.delta }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const maxChannelDelta = [...snapped.values()].reduce((largest, match) => Math.max(largest, match.delta), 0);

  return {
    rows,
    placed: { x: offsetX, y: offsetY, width: target.width, height: target.height },
    snappedColors: snapped.size,
    unmatchedColors: [...snapped.keys()],
    usedPaletteIndices: [...used].sort((a, b) => a - b),
    maxChannelDelta,
    examples,
  };
}

/** Decode an image file into RGBA bytes via the browser's bitmap decoder. */
export async function readBitmapFile(file: File): Promise<BitmapSource> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is not available.');
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } finally {
    bitmap.close();
  }
}
