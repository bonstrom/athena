import { LlmTool } from './llmService';
import { usePixelStore } from '../store/PixelStore';
import { PixelDocument, PixelRect, TRANSPARENT } from '../pixel/types';
import { activeLayerOf } from '../pixel/ops';
import { encodeGrid, inspectRegion } from '../pixel/serialize';
import { legendFor } from '../pixel/palette';
import { asObject, intField, JsonObject, parseOps } from '../pixel/parse';

const MAX_GRID_CELLS = 32 * 32;
const SHORT_ID_LENGTH = 8;

const REGION_SCHEMA = {
  type: 'object',
  description:
    'Optional rectangle that confines every write (a selection boundary). Pixels outside it are left untouched.',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
  },
  required: ['x', 'y', 'width', 'height'],
};

const OPERATION_SCHEMA = {
  type: 'object',
  description:
    'One edit operation. Coordinates are 0-indexed from the top-left corner. `color` is a palette index shown in the legend, or -1 to erase.',
  properties: {
    type: {
      type: 'string',
      enum: ['stamp', 'set_pixels', 'fill_rect', 'clear_rect', 'line', 'flood_fill', 'replace_color', 'flip', 'shift'],
    },
    x: { type: 'number', description: 'Origin x (stamp, fill_rect, clear_rect, flood_fill).' },
    y: { type: 'number', description: 'Origin y (stamp, fill_rect, clear_rect, flood_fill).' },
    width: { type: 'number', description: 'Width (fill_rect, clear_rect).' },
    height: { type: 'number', description: 'Height (fill_rect, clear_rect).' },
    x0: { type: 'number', description: 'Line start x.' },
    y0: { type: 'number', description: 'Line start y.' },
    x1: { type: 'number', description: 'Line end x (inclusive).' },
    y1: { type: 'number', description: 'Line end y (inclusive).' },
    dx: { type: 'number', description: 'Horizontal shift.' },
    dy: { type: 'number', description: 'Vertical shift.' },
    color: { type: 'number', description: 'Palette index, or -1 to erase.' },
    from: { type: 'number', description: 'replace_color: index to replace.' },
    to: { type: 'number', description: 'replace_color: replacement index.' },
    axis: { type: 'string', enum: ['horizontal', 'vertical'] },
    mode: {
      type: 'string',
      enum: ['replace', 'overlay'],
      description: 'stamp: replace overwrites everything, overlay skips transparent cells.',
    },
    rows: {
      type: 'array',
      description:
        'stamp: grid rows. Use single-character rows from the legend (e.g. ["..11..", ".1221."]), or numeric rows of palette indices.',
      items: {
        anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'number' } }],
      },
    },
    points: {
      type: 'array',
      description: 'set_pixels: [x, y] pairs.',
      items: { type: 'array', items: { type: 'number' } },
    },
  },
  required: ['type'],
};

export const PIXEL_TOOLS: LlmTool[] = [
  {
    type: 'function',
    function: {
      name: 'pixel_list_sprites',
      description:
        'List the pixel-art sprites in this workspace (id, size, revision). Call this before editing if you do not know the sprite id.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixel_inspect',
      description:
        'Read a sprite as a character grid, or one region of it. Prefer a region when the sprite is larger than 32x32. Returns the palette legend needed to author edits.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'Sprite id, id prefix, or exact name. Optional when only one sprite exists.',
          },
          region: REGION_SCHEMA,
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pixel_edit',
      description:
        'Apply a batch of pixel edits atomically. Either every operation applies or none do. Use `stamp` with a character grid for whole sprites or large regions, and point/rect operations for small corrections. If baseRevision is given and does not match, the edit is rejected so no work is overwritten.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Sprite id, id prefix, or exact name.' },
          baseRevision: { type: 'number', description: 'Revision you inspected. Rejected if the sprite has moved on.' },
          region: REGION_SCHEMA,
          operations: { type: 'array', items: OPERATION_SCHEMA, minItems: 1 },
        },
        required: ['operations'],
      },
    },
  },
];

function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LENGTH);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeList(documents: PixelDocument[]): string {
  if (documents.length === 0) return '(none)';
  return documents
    .map(
      (document) =>
        `${document.name} (id=${shortId(document.id)} ${document.width}x${document.height} rev ${document.revision})`,
    )
    .join('; ');
}

function meta(document: PixelDocument): string {
  const layer = activeLayerOf(document);
  const filled = layer ? layer.pixels.filter((value) => value !== TRANSPARENT).length : 0;
  return `sprite "${document.name}" id=${shortId(document.id)} ${document.width}x${document.height} rev ${
    document.revision
  } colours=${document.palette.length} filled=${filled}`;
}

/** Print the grid only when it is small enough to be worth the tokens. */
function gridBlock(document: PixelDocument): string {
  const legend = legendFor(document);
  if (document.width * document.height > MAX_GRID_CELLS) {
    return `(grid omitted: ${document.width}x${document.height} is larger than ${MAX_GRID_CELLS} cells — call pixel_inspect with a region)\nlegend: ${legend}`;
  }
  const grid = encodeGrid(document);
  if (grid.mode !== 'glyph') {
    return inspectRegion(document, { x: 0, y: 0, width: document.width, height: document.height });
  }
  const gutter = String(document.height - 1).length;
  const rows = grid.rows.map((row, y) => `${String(y).padStart(gutter, ' ')} | ${row}`).join('\n');
  return `columns 0..${document.width - 1} left-to-right, rows 0..${document.height - 1} top-to-bottom\n${rows}\nlegend: ${legend}`;
}

function summarizeChange(before: PixelDocument, after: PixelDocument): string {
  const beforePixels = activeLayerOf(before)?.pixels ?? [];
  const afterPixels = activeLayerOf(after)?.pixels ?? [];
  const length = Math.min(beforePixels.length, afterPixels.length);

  let changed = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < length; index += 1) {
    if (beforePixels[index] === afterPixels[index]) continue;
    changed += 1;
    const x = index % after.width;
    const y = Math.floor(index / after.width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (changed === 0) return 'No pixels changed.';
  return `${changed} pixel(s) changed in (${minX},${minY})-(${maxX},${maxY}).`;
}

function parseRegion(value: unknown): PixelRect | string | null {
  if (value === undefined || value === null) return null;
  const source = asObject(value);
  if (!source) return 'region must be an object with x, y, width and height';
  try {
    return {
      x: intField(source, 'x'),
      y: intField(source, 'y'),
      width: intField(source, 'width'),
      height: intField(source, 'height'),
    };
  } catch (error) {
    return `region: ${messageOf(error)}`;
  }
}

/** Resolve a sprite by exact id, id prefix, or exact name. */
function resolveDocument(documents: PixelDocument[], reference: unknown, fallbackId?: string): PixelDocument | string {
  if (typeof reference === 'string' && reference.trim().length > 0) {
    const needle = reference.trim();
    const exact = documents.find((document) => document.id === needle);
    if (exact) return exact;

    const byPrefix = documents.filter((document) => document.id.startsWith(needle));
    if (byPrefix.length === 1) return byPrefix[0];

    const byName = documents.filter((document) => document.name.toLowerCase() === needle.toLowerCase());
    if (byName.length === 1) return byName[0];

    return `No sprite matches "${needle}". Available: ${describeList(documents)}`;
  }

  // A sprite-scoped chat binds its own sprite as the default target. If that
  // sprite was deleted mid-conversation, fail rather than silently editing a
  // different one.
  if (fallbackId) {
    const fallback = documents.find((document) => document.id === fallbackId);
    if (fallback) return fallback;
    return `The sprite bound to this chat (id=${shortId(fallbackId)}) no longer exists. Pick a sprite in the Pixel Art view and start a new chat.`;
  }

  if (documents.length === 1) return documents[0];
  if (documents.length === 0) return 'There are no sprites in this workspace yet. Create one in the Pixel Art view.';
  return `documentId is required when several sprites exist. Available: ${describeList(documents)}`;
}

function listSprites(): string {
  const documents = usePixelStore.getState().documents;
  if (documents.length === 0) return 'No sprites in this workspace yet. Create one in the Pixel Art view.';
  return `${documents.length} sprite(s): ${describeList(documents)}`;
}

function inspectSprite(source: JsonObject, defaultDocumentId?: string): string {
  const resolved = resolveDocument(usePixelStore.getState().documents, source.documentId, defaultDocumentId);
  if (typeof resolved === 'string') return resolved;

  const region = parseRegion(source.region);
  if (typeof region === 'string') return `Error: ${region}`;
  if (region) return inspectRegion(resolved, region);

  return `${meta(resolved)}\n\n${gridBlock(resolved)}`;
}

function editSprite(source: JsonObject, defaultDocumentId?: string): string {
  const resolved = resolveDocument(usePixelStore.getState().documents, source.documentId, defaultDocumentId);
  if (typeof resolved === 'string') return resolved;

  if (source.baseRevision !== undefined) {
    let baseRevision: number;
    try {
      baseRevision = intField(source, 'baseRevision');
    } catch (error) {
      return `Rejected, no changes made: ${messageOf(error)}`;
    }
    if (baseRevision !== resolved.revision) {
      return `Rejected, no changes made: "${resolved.name}" is at revision ${resolved.revision}, but you planned against ${baseRevision}. Call pixel_inspect to see the current pixels, then retry.`;
    }
  }

  const { ops, errors } = parseOps(source.operations);
  if (errors.length > 0) return `Rejected, no changes made:\n${errors.join('\n')}`;

  const region = parseRegion(source.region);
  if (typeof region === 'string') return `Rejected, no changes made: ${region}`;

  const opErrors = usePixelStore.getState().applyOpsTo(resolved.id, ops, { clip: region ?? undefined });
  if (opErrors.length > 0) {
    return `Rejected, no changes made:\n${opErrors
      .map((error) =>
        error.opIndex < 0 ? `batch: ${error.message}` : `op[${error.opIndex}]: ${error.message}`,
      )
      .join('\n')}`;
  }

  const after = usePixelStore.getState().documents.find((document) => document.id === resolved.id);
  if (!after) return 'Applied, but the sprite could not be read back.';

  return `Applied ${ops.length} operation(s) to "${after.name}" → rev ${after.revision}. ${summarizeChange(
    resolved,
    after,
  )}\n\n${gridBlock(after)}`;
}

export interface PixelToolOptions {
  /** Sprite bound to the current chat; used when the call omits documentId. */
  defaultDocumentId?: string;
}

/**
 * Stable description of the sprite a chat is about, injected into the system
 * prompt. Deliberately excludes the revision and pixel grid so the cached prefix
 * does not change on every edit — `pixel_inspect` supplies those.
 */
export function spriteFocusPrompt(sprite: PixelDocument): string {
  return [
    'This conversation is about one pixel-art sprite.',
    `Sprite: "${sprite.name}" (id=${shortId(sprite.id)}), ${sprite.width}x${sprite.height} pixels, ${sprite.palette.length} palette colours.`,
    'Call pixel_inspect to read the current grid and its glyph legend before changing pixels, then pixel_edit with a batch of operations. Pass baseRevision from your last inspect so a stale edit cannot overwrite newer work.',
    'Do not draw the sprite as SVG, HTML, ASCII art or any other markup. The canvas already holds the artwork; reply with a short description of what you changed.',
  ].join('\n');
}

/**
 * Execute one pixel tool call. Always resolves to a model-readable string.
 *
 * Every pixel tool is synchronous today; the promise boundary is kept so a
 * tool can become async (rendering, file work) without changing callers.
 */
export function executePixelTool(
  toolName: string,
  argsJson: string,
  options: PixelToolOptions = {},
): Promise<string> {
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(argsJson) as unknown;
  } catch {
    return Promise.resolve('Error: tool arguments were not valid JSON.');
  }
  const source = asObject(parsedArgs) ?? {};

  switch (toolName) {
    case 'pixel_list_sprites':
      return Promise.resolve(listSprites());
    case 'pixel_inspect':
      return Promise.resolve(inspectSprite(source, options.defaultDocumentId));
    case 'pixel_edit':
      return Promise.resolve(editSprite(source, options.defaultDocumentId));
    default:
      return Promise.resolve(`Unknown pixel tool "${toolName}".`);
  }
}
