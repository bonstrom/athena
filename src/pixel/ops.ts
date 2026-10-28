import {
  ApplyOpsOptions,
  ApplyOpsResult,
  DEFAULT_PALETTE_COLUMNS,
  MAX_ACTIVE_COLORS,
  MAX_CANVAS_SIZE,
  PixelDocument,
  PixelLayer,
  PixelOp,
  PixelOpError,
  PixelPaletteColor,
  PixelRect,
  SavedPixelPalette,
  TRANSPARENT,
  TRANSPARENT_GLYPH,
} from './types';
import { DEFAULT_PALETTE, clampPaletteColumns, glyphReferences } from './palette';

export interface CreateDocumentOptions {
  name?: string;
  width: number;
  height: number;
  palette?: PixelPaletteColor[];
}

function isInt(value: number): boolean {
  return Number.isInteger(value);
}

function blankPixels(width: number, height: number): number[] {
  return Array.from({ length: width * height }, (): number => TRANSPARENT);
}

/** Every palette index that actually appears on a layer. */
export function usedPaletteIndices(document: PixelDocument): Set<number> {
  const used = new Set<number>();
  for (const layer of document.layers) {
    for (const value of layer.pixels) {
      if (value !== TRANSPARENT) used.add(value);
    }
  }
  return used;
}

/** New documents start with as much of the palette active as the glyph set allows. */
export function defaultActiveColorIds(palette: PixelPaletteColor[]): string[] {
  return palette.slice(0, MAX_ACTIVE_COLORS).map((color) => color.id);
}

/**
 * Rebuild the active palette from scratch: colours already in use first, then
 * the palette head up to the glyph limit.
 *
 * Used when a palette is replaced, where the old ids are meaningless.
 */
export function rebuildActiveColorIds(document: PixelDocument): string[] {
  const active: string[] = [];
  const add = (color: PixelPaletteColor | undefined): void => {
    if (!color || active.length >= MAX_ACTIVE_COLORS || active.includes(color.id)) return;
    active.push(color.id);
  };

  const used = usedPaletteIndices(document);
  for (const index of [...used].sort((a, b) => a - b)) add(document.palette[index]);
  for (const color of document.palette) add(color);
  return active;
}

/**
 * Repair a document that predates the active palette (or came from an old
 * backup): activate the colours it already uses, then pad from the palette head.
 * An existing -- including empty -- active list is preserved, so "clear active
 * palette" survives a reload.
 */
export function normalizePixelDocument(document: PixelDocument): PixelDocument {
  const rawColumns = (document as { paletteColumns?: unknown }).paletteColumns;
  const paletteColumns =
    typeof rawColumns === 'number' ? clampPaletteColumns(rawColumns) : DEFAULT_PALETTE_COLUMNS;

  const existing = (document as { activeColorIds?: unknown }).activeColorIds;
  if (Array.isArray(existing)) {
    const ids: string[] = [];
    for (const id of existing as unknown[]) {
      if (typeof id === 'string') ids.push(id);
    }
    return { ...document, activeColorIds: ids.slice(0, MAX_ACTIVE_COLORS), paletteColumns };
  }

  return { ...document, activeColorIds: rebuildActiveColorIds(document), paletteColumns };
}

/** Fill in the grid width for palettes saved before it existed. */
export function normalizeSavedPalette(palette: SavedPixelPalette): SavedPixelPalette {
  const rawColumns = (palette as { columns?: unknown }).columns;
  return {
    ...palette,
    columns: typeof rawColumns === 'number' ? clampPaletteColumns(rawColumns) : DEFAULT_PALETTE_COLUMNS,
  };
}

/** Deep copy so undo snapshots and previews never alias live state. */
export function cloneDocument(document: PixelDocument): PixelDocument {
  return {
    ...document,
    palette: document.palette.map((color) => ({ ...color })),
    layers: document.layers.map(
      (layer): PixelLayer => ({ ...layer, pixels: [...layer.pixels] }),
    ),
  };
}

export function createDocument(options: CreateDocumentOptions): PixelDocument {
  const { width, height } = options;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1) {
    throw new Error('Canvas width and height must be positive whole numbers.');
  }
  if (width > MAX_CANVAS_SIZE || height > MAX_CANVAS_SIZE) {
    throw new Error(`Canvas size is limited to ${MAX_CANVAS_SIZE}x${MAX_CANVAS_SIZE} pixels.`);
  }

  const now = new Date().toISOString();
  const layerId = crypto.randomUUID();
  const trimmedName = options.name?.trim();
  const palette = (options.palette ?? DEFAULT_PALETTE).map((color) => ({ ...color }));

  return {
    id: crypto.randomUUID(),
    name: trimmedName ? trimmedName : 'Untitled sprite',
    width,
    height,
    palette,
    paletteColumns: DEFAULT_PALETTE_COLUMNS,
    activeColorIds: defaultActiveColorIds(palette),
    layers: [
      {
        id: layerId,
        name: 'Base',
        visible: true,
        pixels: blankPixels(width, height),
      },
    ],
    activeLayerId: layerId,
    revision: 1,
    createdOn: now,
    updatedOn: now,
  };
}

export function activeLayerOf(document: PixelDocument): PixelLayer | undefined {
  return document.layers.find((layer) => layer.id === document.activeLayerId) ?? document.layers[0];
}

function inBounds(document: PixelDocument, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < document.width && y < document.height;
}

function inClip(clip: PixelRect | undefined, x: number, y: number): boolean {
  if (!clip) return true;
  return x >= clip.x && y >= clip.y && x < clip.x + clip.width && y < clip.y + clip.height;
}

/** Overlap of two rectangles, or null when they do not intersect. */
function intersectRects(a: PixelRect, b: PixelRect): PixelRect | null {
  const left = Math.max(Math.floor(a.x), Math.floor(b.x));
  const top = Math.max(Math.floor(a.y), Math.floor(b.y));
  const right = Math.min(Math.floor(a.x + a.width), Math.floor(b.x + b.width));
  const bottom = Math.min(Math.floor(a.y + a.height), Math.floor(b.y + b.height));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function colorError(palette: PixelPaletteColor[], color: number): string | null {
  if (!isInt(color)) return `colour must be a whole palette index, got ${String(color)}`;
  if (color === TRANSPARENT) return null;
  if (color < 0 || color >= palette.length) {
    return `palette index ${color} is out of range; the palette has ${palette.length} colours (0..${
      palette.length - 1
    }), or use -1 to erase`;
  }
  return null;
}

/** Bresenham, inclusive of both endpoints. Exported so the UI can join drag samples. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  let fromX = x0;
  let fromY = y0;
  const dx = Math.abs(x1 - fromX);
  const dy = Math.abs(y1 - fromY);
  const stepX = fromX < x1 ? 1 : -1;
  const stepY = fromY < y1 ? 1 : -1;
  let error = dx - dy;

  for (;;) {
    points.push([fromX, fromY]);
    if (fromX === x1 && fromY === y1) break;
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      fromX += stepX;
    }
    if (doubled < dx) {
      error += dx;
      fromY += stepY;
    }
  }

  return points;
}

interface ParsedStamp {
  cells: number[][];
  width: number;
  height: number;
}

function parseStampRows(
  rows: string[] | number[][],
  document: PixelDocument,
): { stamp?: ParsedStamp; error?: string } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'stamp rows must be a non-empty array' };
  }

  const firstRow = rows[0];
  const isGlyphMode = typeof firstRow === 'string';

  if (isGlyphMode) {
    // Glyphs address the *active* palette positionally, so "0" is the first
    // active colour, not palette index 0. Stamps must decode through the same
    // mapping that inspection and encoding use.
    const glyphToIndex = new Map<string, number>();
    for (const reference of glyphReferences(document.activeColorIds, document.palette)) {
      glyphToIndex.set(reference.glyph, reference.paletteIndex);
    }

    const glyphRows = rows as string[];
    const width = glyphRows[0].length;
    if (width === 0) return { error: 'stamp rows must not be empty' };

    const cells: number[][] = [];
    for (let y = 0; y < glyphRows.length; y += 1) {
      const row = glyphRows[y];
      if (row.length !== width) {
        return { error: `row ${y} has ${row.length} cells but row 0 has ${width}; all rows must be equal length` };
      }
      const parsedRow: number[] = [];
      for (let x = 0; x < row.length; x += 1) {
        const glyph = row[x];
        if (glyph === TRANSPARENT_GLYPH) {
          parsedRow.push(TRANSPARENT);
          continue;
        }
        const index = glyphToIndex.get(glyph);
        if (index === undefined) {
          return {
            error: `row ${y} column ${x}: glyph "${glyph}" is not in the active palette. Use "." for transparent, or one of the glyphs returned by pixel_inspect.`,
          };
        }
        parsedRow.push(index);
      }
      cells.push(parsedRow);
    }
    return { stamp: { cells, width, height: glyphRows.length } };
  }

  const numericRows = rows as number[][];
  const width = numericRows[0].length;
  if (width === 0) return { error: 'stamp rows must not be empty' };

  const cells: number[][] = [];
  for (let y = 0; y < numericRows.length; y += 1) {
    const row = numericRows[y];
    if (row.length !== width) {
      return { error: `row ${y} has ${row.length} cells but row 0 has ${width}; all rows must be equal length` };
    }
    const parsedRow: number[] = [];
    for (let x = 0; x < row.length; x += 1) {
      const value = row[x];
      const problem = colorError(document.palette, value);
      if (problem) return { error: `row ${y} column ${x}: ${problem}` };
      parsedRow.push(value);
    }
    cells.push(parsedRow);
  }
  return { stamp: { cells, width, height: numericRows.length } };
}

function rectEndError(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  document: PixelDocument,
): string | null {
  if (![x, y, width, height].every(isInt)) {
    return `${label}: x, y, width and height must be whole numbers (got x=${x} y=${y} width=${width} height=${height})`;
  }
  if (width < 1 || height < 1) return `${label}: width and height must be at least 1`;
  if (x < 0 || y < 0) {
    return `${label}: origin (${x}, ${y}) is outside the canvas (coordinates are 0-indexed)`;
  }
  const endX = x + width;
  const endY = y + height;
  if (endX > document.width || endY > document.height) {
    return `${label}: rect x=${x} y=${y} width=${width} height=${height} ends at (${endX}, ${endY}), outside the ${
      document.width
    }x${document.height} canvas (x is 0..${document.width - 1}, y is 0..${document.height - 1})`;
  }
  return null;
}

/**
 * Runtime guard for coordinate pairs. The declared type is already a tuple, but
 * batches can arrive from JSON tool calls, so the value is re-checked here.
 */
function isPoint(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const candidate = value as unknown[];
  return (
    typeof candidate[0] === 'number' &&
    typeof candidate[1] === 'number' &&
    Number.isInteger(candidate[0]) &&
    Number.isInteger(candidate[1])
  );
}

function validateOp(
  op: PixelOp,
  document: PixelDocument,
  parsedStamps: Map<number, ParsedStamp>,
  opIndex: number,
): string | null {
  switch (op.type) {
    case 'set_pixels': {
      if (!Array.isArray(op.points) || op.points.length === 0) return 'set_pixels: points must be a non-empty array';
      const problem = colorError(document.palette, op.color);
      if (problem) return `set_pixels: ${problem}`;
      for (const point of op.points) {
        if (!isPoint(point)) {
          return `set_pixels: every point must be an [x, y] pair of whole numbers`;
        }
        if (!inBounds(document, point[0], point[1])) {
          return `set_pixels: point (${point[0]}, ${point[1]}) is outside the ${document.width}x${
            document.height
          } canvas (coordinates are 0-indexed: x 0..${document.width - 1}, y 0..${document.height - 1})`;
        }
      }
      return null;
    }

    case 'fill_rect':
    case 'clear_rect': {
      const problem = rectEndError(op.type, op.x, op.y, op.width, op.height, document);
      if (problem) return problem;
      if (op.type === 'fill_rect') {
        const colorProblem = colorError(document.palette, op.color);
        if (colorProblem) return `fill_rect: ${colorProblem}`;
      }
      return null;
    }

    case 'line': {
      const problem = colorError(document.palette, op.color);
      if (problem) return `line: ${problem}`;
      if (![op.x0, op.y0, op.x1, op.y1].every(isInt)) return 'line: coordinates must be whole numbers';
      if (!inBounds(document, op.x0, op.y0) || !inBounds(document, op.x1, op.y1)) {
        return `line: endpoint outside the ${document.width}x${document.height} canvas (0-indexed coordinates)`;
      }
      return null;
    }

    case 'flood_fill': {
      const problem = colorError(document.palette, op.color);
      if (problem) return `flood_fill: ${problem}`;
      if (!inBounds(document, op.x, op.y)) {
        return `flood_fill: seed (${op.x}, ${op.y}) is outside the ${document.width}x${document.height} canvas`;
      }
      return null;
    }

    case 'replace_color': {
      const fromProblem = colorError(document.palette, op.from);
      if (fromProblem) return `replace_color: source ${fromProblem}`;
      const toProblem = colorError(document.palette, op.to);
      if (toProblem) return `replace_color: target ${toProblem}`;
      return null;
    }

    case 'stamp': {
      if (!isInt(op.x) || !isInt(op.y)) return 'stamp: x and y must be whole numbers';
      const parsed = parsedStamps.get(opIndex);
      if (!parsed) return 'stamp: rows could not be parsed';
      if (op.x < 0 || op.y < 0) {
        return `stamp: origin (${op.x}, ${op.y}) is outside the canvas (coordinates are 0-indexed)`;
      }
      const endX = op.x + parsed.width;
      const endY = op.y + parsed.height;
      if (endX > document.width || endY > document.height) {
        return `stamp: patch is ${parsed.width}x${parsed.height} at (${op.x}, ${op.y}) so it ends at (${endX}, ${endY}), outside the ${document.width}x${document.height} canvas`;
      }
      const mode: string = op.mode;
      if (mode !== 'replace' && mode !== 'overlay') {
        return `stamp: mode must be "replace" or "overlay", got ${String(op.mode)}`;
      }
      return null;
    }

    case 'flip': {
      const axis: string = op.axis;
      if (axis !== 'horizontal' && axis !== 'vertical') {
        return `flip: axis must be "horizontal" or "vertical", got ${String(op.axis)}`;
      }
      return null;
    }

    case 'shift': {
      if (!isInt(op.dx) || !isInt(op.dy)) return 'shift: dx and dy must be whole numbers';
      return null;
    }

    default: {
      const exhaustive: never = op;
      return `Unknown operation ${JSON.stringify(exhaustive)}`;
    }
  }
}

function executeOp(
  op: PixelOp,
  document: PixelDocument,
  pixels: number[],
  clip: PixelRect | undefined,
  parsedStamps: Map<number, ParsedStamp>,
  opIndex: number,
): void {
  const { width, height } = document;
  const setPixel = (x: number, y: number, color: number): void => {
    if (!inBounds(document, x, y) || !inClip(clip, x, y)) return;
    pixels[y * width + x] = color;
  };

  switch (op.type) {
    case 'set_pixels': {
      for (const [x, y] of op.points) setPixel(x, y, op.color);
      return;
    }

    case 'fill_rect': {
      for (let y = op.y; y < op.y + op.height; y += 1) {
        for (let x = op.x; x < op.x + op.width; x += 1) setPixel(x, y, op.color);
      }
      return;
    }

    case 'clear_rect': {
      for (let y = op.y; y < op.y + op.height; y += 1) {
        for (let x = op.x; x < op.x + op.width; x += 1) setPixel(x, y, TRANSPARENT);
      }
      return;
    }

    case 'line': {
      for (const [x, y] of linePoints(op.x0, op.y0, op.x1, op.y1)) setPixel(x, y, op.color);
      return;
    }

    case 'flood_fill': {
      const index = op.y * width + op.x;
      const target = pixels[index];
      if (target === op.color) return;

      const seen = new Uint8Array(width * height);
      const stack: number[] = [index];
      seen[index] = 1;

      while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) break;
        const x = current % width;
        const y = Math.floor(current / width);
        if (pixels[current] !== target || !inClip(clip, x, y)) continue;
        pixels[current] = op.color;

        const neighbours: number[] = [];
        if (x > 0) neighbours.push(current - 1);
        if (x < width - 1) neighbours.push(current + 1);
        if (y > 0) neighbours.push(current - width);
        if (y < height - 1) neighbours.push(current + width);
        for (const neighbour of neighbours) {
          if (seen[neighbour] === 0) {
            seen[neighbour] = 1;
            stack.push(neighbour);
          }
        }
      }
      return;
    }

    case 'replace_color': {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (pixels[index] === op.from && inClip(clip, x, y)) pixels[index] = op.to;
        }
      }
      return;
    }

    case 'stamp': {
      const parsed = parsedStamps.get(opIndex);
      if (!parsed) return;
      for (let row = 0; row < parsed.height; row += 1) {
        for (let column = 0; column < parsed.width; column += 1) {
          const color = parsed.cells[row][column];
          if (op.mode === 'overlay' && color === TRANSPARENT) continue;
          setPixel(op.x + column, op.y + row, color);
        }
      }
      return;
    }

    case 'flip': {
      // Confined to the clip rectangle when one is supplied: flipping a
      // selection must not reach outside it.
      const source = [...pixels];
      const area = clip ?? { x: 0, y: 0, width, height };
      for (let y = area.y; y < area.y + area.height; y += 1) {
        for (let x = area.x; x < area.x + area.width; x += 1) {
          const fromX = op.axis === 'horizontal' ? area.x + area.width - 1 - (x - area.x) : x;
          const fromY = op.axis === 'vertical' ? area.y + area.height - 1 - (y - area.y) : y;
          pixels[y * width + x] = source[fromY * width + fromX];
        }
      }
      return;
    }

    case 'shift': {
      const source = [...pixels];
      const area = clip ?? { x: 0, y: 0, width, height };
      for (let y = area.y; y < area.y + area.height; y += 1) {
        for (let x = area.x; x < area.x + area.width; x += 1) {
          const fromX = x - op.dx;
          const fromY = y - op.dy;
          const insideArea =
            fromX >= area.x &&
            fromX < area.x + area.width &&
            fromY >= area.y &&
            fromY < area.y + area.height;
          pixels[y * width + x] = insideArea ? source[fromY * width + fromX] : TRANSPARENT;
        }
      }
      return;
    }
  }
}

/**
 * Apply a batch of operations atomically.
 *
 * Every operation is validated before anything is written, so a batch whose
 * seventh operation is invalid leaves the document completely untouched. On
 * success the returned document has a bumped revision.
 */
export function applyOps(
  document: PixelDocument,
  ops: PixelOp[],
  options: ApplyOpsOptions = {},
): ApplyOpsResult {
  const errors: PixelOpError[] = [];

  if (!Array.isArray(ops) || ops.length === 0) {
    return {
      ok: false,
      errors: [{ opIndex: -1, opType: 'batch', message: 'No operations supplied.' }],
      document,
    };
  }

  const layer = activeLayerOf(document);
  if (!layer) {
    return {
      ok: false,
      errors: [{ opIndex: -1, opType: 'batch', message: 'Document has no layers.' }],
      document,
    };
  }

  const parsedStamps = new Map<number, ParsedStamp>();

  // The clip is a boundary, not a promise: intersect it with the canvas so an
  // out-of-range region can never address pixels in another row/column (or spin
  // an enormous loop). A region with no overlap is a caller mistake worth
  // reporting rather than silently doing nothing.
  let clip: PixelRect | undefined;
  if (options.clip) {
    const intersected = intersectRects(options.clip, {
      x: 0,
      y: 0,
      width: document.width,
      height: document.height,
    });
    if (!intersected) {
      return {
        ok: false,
        errors: [
          {
            opIndex: -1,
            opType: 'clip',
            message: `clip region x=${options.clip.x} y=${options.clip.y} width=${options.clip.width} height=${options.clip.height} does not overlap the ${document.width}x${document.height} canvas`,
          },
        ],
        document,
      };
    }
    clip = intersected;
  }

  ops.forEach((op, opIndex) => {
    if (op.type === 'stamp') {
      const parsed = parseStampRows(op.rows, document);
      if (parsed.stamp) parsedStamps.set(opIndex, parsed.stamp);
      else {
        errors.push({
          opIndex,
          opType: op.type,
          message: `stamp: ${parsed.error ?? 'rows could not be parsed'}`,
        });
        return;
      }
    }

    const problem = validateOp(op, document, parsedStamps, opIndex);
    if (problem) errors.push({ opIndex, opType: op.type, message: problem });
  });

  if (errors.length > 0) return { ok: false, errors, document };

  const next = cloneDocument(document);
  const nextLayer = next.layers.find((candidate) => candidate.id === next.activeLayerId) ?? next.layers[0];

  ops.forEach((op, opIndex) => {
    executeOp(op, next, nextLayer.pixels, clip, parsedStamps, opIndex);
  });

  next.revision = document.revision + 1;
  next.updatedOn = new Date().toISOString();

  return { ok: true, errors: [], document: next };
}

/** Human-readable single line summary of a failure, for toasts and tests. */
export function summarizeErrors(errors: PixelOpError[]): string {
  if (errors.length === 0) return '';
  const [first] = errors;
  const rest = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
  return `${first.message}${rest}`;
}
