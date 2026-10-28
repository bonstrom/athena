import {
  DEFAULT_PALETTE_COLUMNS,
  GLYPH_ALPHABET,
  MAX_ACTIVE_COLORS,
  MAX_PALETTE_COLUMNS,
  MIN_PALETTE_COLUMNS,
  PixelDocument,
  PixelPaletteColor,
  TRANSPARENT_GLYPH,
} from './types';
/**
 * Starter palette — 36 named colours arranged as ramps. It exists so a new
 * document is usable immediately; real working palettes should be imported from
 * Krita via `.gpl` (see `parseGpl` / `serializeGpl`).
 */
export const DEFAULT_PALETTE: PixelPaletteColor[] = [
  { id: 'void', hex: '#0d0b12' },
  { id: 'shadow', hex: '#1f1b2e' },
  { id: 'grey_dark', hex: '#3a3550' },
  { id: 'grey_mid', hex: '#5d5875' },
  { id: 'grey_light', hex: '#8f8aa8' },
  { id: 'white', hex: '#f4f1e8' },
  { id: 'skin_shadow', hex: '#7a4a52' },
  { id: 'skin_mid', hex: '#b8706a' },
  { id: 'skin_light', hex: '#e0a084' },
  { id: 'skin_hi', hex: '#f6cfa8' },
  { id: 'red_dark', hex: '#6b2737' },
  { id: 'red_mid', hex: '#b33a3a' },
  { id: 'red_light', hex: '#e86a4a' },
  { id: 'orange_dark', hex: '#a1521f' },
  { id: 'orange_mid', hex: '#e08b2c' },
  { id: 'orange_light', hex: '#f5c15c' },
  { id: 'gold_dark', hex: '#8a6a1f' },
  { id: 'gold_mid', hex: '#c9a227' },
  { id: 'gold_light', hex: '#f2dc7a' },
  { id: 'green_dark', hex: '#1f4a35' },
  { id: 'green_mid', hex: '#3f8a4f' },
  { id: 'green_light', hex: '#7cc25b' },
  { id: 'green_hi', hex: '#b6e08a' },
  { id: 'blue_dark', hex: '#1d3159' },
  { id: 'blue_mid', hex: '#2f5f9e' },
  { id: 'blue_light', hex: '#5fa8d3' },
  { id: 'blue_hi', hex: '#a8dcef' },
  { id: 'purple_dark', hex: '#4a2a6b' },
  { id: 'purple_mid', hex: '#7d4fa8' },
  { id: 'purple_light', hex: '#b98ad6' },
  { id: 'brown_dark', hex: '#4a3222' },
  { id: 'brown_mid', hex: '#7a5334' },
  { id: 'brown_light', hex: '#a87c50' },
  { id: 'steel_dark', hex: '#4d5560' },
  { id: 'steel_mid', hex: '#7d8899' },
  { id: 'steel_light', hex: '#b9c4d0' },
];

const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/;

/** Normalise `#ABC123` / `abc123` to `#abc123`. Returns null when invalid. */
export function normalizeHex(value: string): string | null {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;
  return `#${match[1].toLowerCase()}`;
}

/** `#rrggbb` -> `[r, g, b]`. Returns null for malformed input. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

/** Relative luminance in 0..1, used for the value map (not perceptual-grade). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Palette index -> grid glyph. Returns null when out of range or transparent. */
export function glyphForIndex(index: number): string | null {
  if (index < 0 || index >= GLYPH_ALPHABET.length) return null;
  return GLYPH_ALPHABET[index];
}

/** Grid glyph -> palette index, or `TRANSPARENT_GLYPH` -> -1. Null when unknown. */
export function indexForGlyph(glyph: string): number | null {
  if (glyph === TRANSPARENT_GLYPH) return -1;
  const index = GLYPH_ALPHABET.indexOf(glyph);
  return index === -1 ? null : index;
}

/**
 * A palette colour that is currently active, together with the single glyph it
 * is addressed by in grid text.
 */
export interface GlyphReference {
  glyph: string;
  /** Index into `document.palette`, which is what operation payloads use. */
  paletteIndex: number;
  id: string;
  hex: string;
}

/**
 * Map the ordered active palette onto glyphs.
 *
 * Glyphs are positional: the first active colour is `0`, the second `1`, and so
 * on. That is what lets a 96-colour palette still be read as single-character
 * grids — the sprite only ever activates the handful of colours it needs.
 */
export function glyphReferences(
  activeColorIds: string[],
  palette: PixelPaletteColor[],
): GlyphReference[] {
  const indexById = new Map<string, number>();
  palette.forEach((color, index): void => {
    indexById.set(color.id, index);
  });

  const references: GlyphReference[] = [];
  for (const id of activeColorIds) {
    const paletteIndex = indexById.get(id);
    if (paletteIndex === undefined) continue;
    if (references.length >= MAX_ACTIVE_COLORS) break;
    const color = palette[paletteIndex];
    references.push({
      glyph: GLYPH_ALPHABET[references.length],
      paletteIndex,
      id: color.id,
      hex: color.hex,
    });
  }
  return references;
}

/** Compact legend mapping glyphs to palette indices and colour names. */
export function legendFor(document: PixelDocument): string {
  const references = glyphReferences(document.activeColorIds, document.palette);
  if (references.length === 0) {
    return `numeric cells are palette indices, "${TRANSPARENT_GLYPH}" is transparent`;
  }
  const entries = references.map(
    (reference) => `${reference.glyph}=${reference.paletteIndex} ${reference.id}`,
  );
  return `${TRANSPARENT_GLYPH}=transparent, ${entries.join(', ')}`;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

function makeUniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

/**
 * Parse a GIMP/Krita `.gpl` palette.
 *
 * `#` comments and the `Name:` / `Columns:` header lines are ignored; every
 * remaining line is `R G B [name]`. Invalid lines are skipped rather than
 * failing the whole import, so a partially mangled file is still salvageable.
 */
export function parseGpl(text: string): PixelPaletteColor[] {
  const colors: PixelPaletteColor[] = [];
  const taken = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^(GIMP Palette|Name:|Columns:)/i.test(line)) continue;

    const match = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b\s*(.*)$/.exec(line);
    if (!match) continue;

    const channels = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (channels.some((c) => c < 0 || c > 255)) continue;

    const label = match[4].trim();
    const id = makeUniqueId(slugify(label, `color_${colors.length + 1}`), taken);
    taken.add(id);

    const hex = `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    colors.push({ id, hex });
  }

  return colors;
}

/**
 * Read the palette name from a `.gpl` file.
 *
 * The GIMP format uses a `Name:` header, but several exporters (Krita included)
 * write it as a comment instead: `#Palette Name: Otterisk 96`. Both forms are
 * accepted, with or without the `#` and with `Palette ` optionally prefixed.
 */
export function parseGplName(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#+\s*/, '');
    const match = /^(?:Palette\s+)?Name\s*:\s*(.+)$/i.exec(line);
    if (!match) continue;
    const name = match[1].trim();
    if (name.length > 0) return name;
  }
  return null;
}

/** Read the `Columns:` hint from a `.gpl` file, if present and sane. */
export function parseGplColumns(text: string): number | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#+\s*/, '');
    const match = /^Columns\s*:\s*(\d+)$/i.exec(line);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    return value >= MIN_PALETTE_COLUMNS && value <= MAX_PALETTE_COLUMNS ? value : null;
  }
  return null;
}

/** Clamp a requested grid width into the supported range. */
export function clampPaletteColumns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PALETTE_COLUMNS;
  return Math.max(MIN_PALETTE_COLUMNS, Math.min(MAX_PALETTE_COLUMNS, Math.floor(value)));
}

/** Serialise a palette as a `.gpl` file Krita can import directly. */
export function serializeGpl(name: string, colors: PixelPaletteColor[]): string {
  const header = ['GIMP Palette', `Name: ${name}`, 'Columns: 8', '#'];
  const rows = colors.map((color) => {
    const rgb = hexToRgb(color.hex);
    if (!rgb) return `0 0 0 ${color.id}`;
    return `${rgb[0]} ${rgb[1]} ${rgb[2]} ${color.id}`;
  });
  return [...header, ...rows, ''].join('\n');
}
