import { PixelOp, StampMode, TRANSPARENT } from './types';

/** Upper bound on a single batch, so one call cannot flood the undo stack. */
export const MAX_OPS_PER_BATCH = 200;

export type JsonObject = Record<string, unknown>;

class OpParseError extends Error {}

export function asObject(value: unknown): JsonObject | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as JsonObject;
}

/** Read a whole-number field, throwing a model-actionable message. */
export function intField(source: JsonObject, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new OpParseError(`"${key}" must be a whole number, got ${String(value)}`);
  }
  return value;
}

function stringField(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new OpParseError(`"${key}" must be a string`);
  return value;
}

function isIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((cell) => typeof cell === 'number' && Number.isInteger(cell));
}

function pointsField(source: JsonObject): [number, number][] {
  const value = source.points;
  if (!Array.isArray(value) || value.length === 0) {
    throw new OpParseError('"points" must be a non-empty array of [x, y] pairs');
  }
  const entries: unknown[] = value;
  return entries.map((entry, index): [number, number] => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new OpParseError(`points[${index}] must be an [x, y] pair`);
    }
    const pair: unknown[] = entry;
    const [x, y] = pair;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new OpParseError(`points[${index}] must contain whole numbers`);
    }
    return [x, y];
  });
}

function rowsField(source: JsonObject): string[] | number[][] {
  const value = source.rows;
  if (!Array.isArray(value) || value.length === 0) {
    throw new OpParseError('"rows" must be a non-empty array');
  }
  const rows: unknown[] = value;

  if (typeof rows[0] === 'string') {
    if (!rows.every((row): row is string => typeof row === 'string')) {
      throw new OpParseError('"rows" must be all strings or all number arrays');
    }
    return rows;
  }

  if (!rows.every(isIntArray)) {
    throw new OpParseError('numeric rows must be arrays of whole palette indices');
  }
  return rows;
}

function parseStampMode(source: JsonObject): StampMode {
  const mode = source.mode;
  if (mode !== 'replace' && mode !== 'overlay') {
    throw new OpParseError('"mode" must be "replace" or "overlay"');
  }
  return mode;
}

function parseAxis(source: JsonObject): 'horizontal' | 'vertical' {
  const axis = source.axis;
  if (axis !== 'horizontal' && axis !== 'vertical') {
    throw new OpParseError('"axis" must be "horizontal" or "vertical"');
  }
  return axis;
}

function parseColor(source: JsonObject): number {
  const color = intField(source, 'color');
  if (color < TRANSPARENT) throw new OpParseError('"color" must be a palette index, or -1 to erase');
  return color;
}

function parseOp(raw: unknown): PixelOp {
  const source = asObject(raw);
  if (!source) throw new OpParseError('operation must be an object');
  const type = stringField(source, 'type');

  switch (type) {
    case 'set_pixels':
      return { type, points: pointsField(source), color: parseColor(source) };

    case 'fill_rect':
      return {
        type,
        x: intField(source, 'x'),
        y: intField(source, 'y'),
        width: intField(source, 'width'),
        height: intField(source, 'height'),
        color: parseColor(source),
      };

    case 'line':
      return {
        type,
        x0: intField(source, 'x0'),
        y0: intField(source, 'y0'),
        x1: intField(source, 'x1'),
        y1: intField(source, 'y1'),
        color: parseColor(source),
      };

    case 'flood_fill':
      return { type, x: intField(source, 'x'), y: intField(source, 'y'), color: parseColor(source) };

    case 'replace_color':
      return { type, from: intField(source, 'from'), to: intField(source, 'to') };

    case 'stamp':
      return {
        type,
        x: intField(source, 'x'),
        y: intField(source, 'y'),
        mode: parseStampMode(source),
        rows: rowsField(source),
      };

    case 'clear_rect':
      return {
        type,
        x: intField(source, 'x'),
        y: intField(source, 'y'),
        width: intField(source, 'width'),
        height: intField(source, 'height'),
      };

    case 'flip':
      return { type, axis: parseAxis(source) };

    case 'shift':
      return { type, dx: intField(source, 'dx'), dy: intField(source, 'dy') };

    default:
      throw new OpParseError(
        `unknown operation type "${type}". Valid types: set_pixels, fill_rect, line, flood_fill, replace_color, stamp, clear_rect, flip, shift`,
      );
  }
}

/**
 * Parse an untrusted `operations` payload into typed ops.
 *
 * Returns all errors at once rather than the first, so one round trip is enough
 * for the model to fix a whole batch.
 */
export function parseOps(input: unknown): { ops: PixelOp[]; errors: string[] } {
  if (!Array.isArray(input)) {
    return { ops: [], errors: ['"operations" must be an array'] };
  }
  if (input.length === 0) {
    return { ops: [], errors: ['"operations" must not be empty'] };
  }
  if (input.length > MAX_OPS_PER_BATCH) {
    return { ops: [], errors: [`at most ${MAX_OPS_PER_BATCH} operations per batch, got ${input.length}`] };
  }

  const entries: unknown[] = input;
  const ops: PixelOp[] = [];
  const errors: string[] = [];

  entries.forEach((entry, index): void => {
    try {
      ops.push(parseOp(entry));
    } catch (error) {
      errors.push(`op[${index}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  if (errors.length > 0) return { ops: [], errors };
  return { ops, errors };
}
