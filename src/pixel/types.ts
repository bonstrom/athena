/**
 * Pixel art document model.
 *
 * A document is a palette-indexed raster: every layer stores palette indices in
 * row-major order, with `TRANSPARENT` (-1) for empty cells. Nothing here depends
 * on React, Dexie or the DOM, so the whole editing engine is unit-testable.
 */

/** Sentinel palette index for an empty pixel. Never a real palette slot. */
export const TRANSPARENT = -1;

/** Hard ceiling so this stays a pixel-art tool rather than a drawing app. */
export const MAX_CANVAS_SIZE = 64;

/**
 * Single-character grid mode can only address as many colours as the alphabet
 * holds. Anything larger falls back to numeric rows.
 */
export const GLYPH_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Reserved glyph for transparency. Never assigned to a palette colour. */
export const TRANSPARENT_GLYPH = '.';

export const MAX_GLYPH_COLORS = GLYPH_ALPHABET.length;

/** Upper bound on how many colours a single sprite may have active at once. */
export const MAX_ACTIVE_COLORS = GLYPH_ALPHABET.length;

/** Palette grid width, matching the `.gpl` `Columns:` hint. */
export const DEFAULT_PALETTE_COLUMNS = 8;
export const MIN_PALETTE_COLUMNS = 1;
export const MAX_PALETTE_COLUMNS = 16;

export interface PixelPaletteColor {
  /** Stable machine name, e.g. `skin_shadow`. */
  id: string;
  /** `#rrggbb`, always 6 digits, always lowercase. */
  hex: string;
}

/** A reusable palette in the library, independent of any one sprite. */
export interface SavedPixelPalette {
  id: string;
  name: string;
  colors: PixelPaletteColor[];
  /** Grid width to use when this palette is applied. */
  columns: number;
  createdOn: string;
  updatedOn: string;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelLayer {
  id: string;
  name: string;
  visible: boolean;
  /** `width * height` palette indices, row-major. `TRANSPARENT` for empty. */
  pixels: number[];
}

export interface PixelDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Palette is stored on the document so exports stay self-contained. */
  palette: PixelPaletteColor[];
  /** Display width of the palette grids (the `.gpl` `Columns:` hint). */
  paletteColumns: number;
  /**
   * Ordered subset of palette ids that is allowed to be drawn with and that the
   * grid glyphs map to: position 0 is glyph "0", position 1 is "1", and so on.
   */
  activeColorIds: string[];
  layers: PixelLayer[];
  activeLayerId: string;
  /** Topic that holds this sprite's chat, created on demand. */
  chatTopicId?: string;
  /** Bumped once per committed edit batch; used for optimistic concurrency. */
  revision: number;
  createdOn: string;
  updatedOn: string;
}

export type StampMode = 'replace' | 'overlay';

export type PixelOp =
  | { type: 'set_pixels'; points: [number, number][]; color: number }
  | { type: 'fill_rect'; x: number; y: number; width: number; height: number; color: number }
  | { type: 'line'; x0: number; y0: number; x1: number; y1: number; color: number }
  | { type: 'flood_fill'; x: number; y: number; color: number }
  | { type: 'replace_color'; from: number; to: number }
  | { type: 'stamp'; x: number; y: number; rows: string[] | number[][]; mode: StampMode }
  | { type: 'clear_rect'; x: number; y: number; width: number; height: number }
  | { type: 'flip'; axis: 'horizontal' | 'vertical' }
  | { type: 'shift'; dx: number; dy: number };

export interface PixelOpError {
  /** Index of the failing operation, or -1 for a document-level problem. */
  opIndex: number;
  opType: string;
  message: string;
}

export interface ApplyOpsOptions {
  /**
   * When present, only pixels inside this rect may be written. Pixels outside
   * are skipped silently — this is how a selection becomes a hard boundary the
   * model cannot escape.
   */
  clip?: PixelRect;
}

export interface ApplyOpsResult {
  ok: boolean;
  errors: PixelOpError[];
  /** The updated document on success, or the original document on failure. */
  document: PixelDocument;
}
