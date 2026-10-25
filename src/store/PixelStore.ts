import { create } from 'zustand';
import { athenaDb } from '../database/AthenaDb';
import { useNotificationStore } from './NotificationStore';
import {
  MAX_ACTIVE_COLORS,
  DEFAULT_PALETTE_COLUMNS,
  PixelDocument,
  PixelOp,
  PixelOpError,
  PixelPaletteColor,
  PixelRect,
  SavedPixelPalette,
} from '../pixel/types';
import {
  applyOps as applyOpsToDocument,
  cloneDocument,
  createDocument as createPixelDocument,
  normalizePixelDocument,
  normalizeSavedPalette,
  rebuildActiveColorIds,
  usedPaletteIndices,
} from '../pixel/ops';
import { clampPaletteColumns } from '../pixel/palette';

const UNDO_LIMIT = 50;

export interface ApplyPixelOpsOptions {
  /** Restrict writes to this rect; everything outside is skipped silently. */
  clip?: PixelRect;
  /** Set false for transient strokes that should share one undo step. */
  recordUndo?: boolean;
}

export interface PixelStoreState {
  documents: PixelDocument[];
  activeDocumentId: string | null;
  savedPalettes: SavedPixelPalette[];
  undoStacks: Record<string, PixelDocument[]>;
  redoStacks: Record<string, PixelDocument[]>;
  isLoaded: boolean;
  palettesLoaded: boolean;
  attachChatTopic: (documentId: string, topicId: string) => Promise<void>;
  loadDocuments: () => Promise<void>;
  loadSavedPalettes: () => Promise<void>;
  savePalette: (name: string, colors: PixelPaletteColor[], columns?: number) => Promise<string | null>;
  deleteSavedPalette: (id: string) => Promise<void>;
  applySavedPalette: (documentId: string, paletteId: string) => Promise<void>;
  createDocument: (options: { name?: string; width: number; height: number }) => Promise<string | null>;
  deleteDocument: (id: string) => Promise<void>;
  setActiveDocument: (id: string | null) => void;
  renameDocument: (id: string, name: string) => Promise<void>;
  replacePalette: (id: string, palette: PixelPaletteColor[], columns?: number) => Promise<void>;
  setPaletteColumns: (documentId: string, columns: number) => Promise<void>;
  setActiveColorState: (
    documentId: string,
    colorId: string,
    active: boolean,
  ) => Promise<{ ok: boolean; message?: string }>;
  setActiveColors: (documentId: string, colorIds: string[]) => Promise<{ ok: boolean; message?: string }>;
  toggleActiveColor: (documentId: string, colorId: string) => Promise<{ ok: boolean; message?: string }>;
  clearActiveColors: (documentId: string) => Promise<void>;
  applyOpsTo: (documentId: string, ops: PixelOp[], options?: ApplyPixelOpsOptions) => PixelOpError[];
  applyOps: (ops: PixelOp[], options?: ApplyPixelOpsOptions) => PixelOpError[];
  undo: () => void;
  redo: () => void;
}

async function persist(document: PixelDocument): Promise<void> {
  try {
    await athenaDb.pixelDocuments.put(document);
  } catch (error) {
    console.error('[pixel] failed to persist document', error);
    useNotificationStore
      .getState()
      .addNotification('Could not save sprite', error instanceof Error ? error.message : String(error), 'error');
  }
}

function withoutKey<T>(record: Record<string, T[]>, key: string): Record<string, T[]> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));
}

/** Safe lookup for the undo/redo maps (records are sparse). */
function getStack(record: Record<string, PixelDocument[]>, id: string): PixelDocument[] {
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id] : [];
}

/** Number of undo steps available for a document. */
export function stackDepth(record: Record<string, unknown[]>, id: string): number {
  return Object.prototype.hasOwnProperty.call(record, id) ? record[id].length : 0;
}

export const usePixelStore = create<PixelStoreState>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  savedPalettes: [],
  undoStacks: {},
  redoStacks: {},
  isLoaded: false,
  palettesLoaded: false,

  attachChatTopic: async (documentId, topicId): Promise<void> => {
    const state = get();
    const current = state.documents.find((document) => document.id === documentId);
    if (!current) return;
    const next: PixelDocument = { ...current, chatTopicId: topicId, updatedOn: new Date().toISOString() };
    set({
      documents: state.documents.map((document) => (document.id === documentId ? next : document)),
    });
    await persist(next);
  },

  loadDocuments: async (): Promise<void> => {
    try {
      const stored = await athenaDb.pixelDocuments.orderBy('updatedOn').reverse().toArray();
      const documents = stored.map(normalizePixelDocument);
      set((state) => {
        const stillExists = documents.some((document) => document.id === state.activeDocumentId);
        return {
          documents,
          activeDocumentId: stillExists ? state.activeDocumentId : (documents.at(0)?.id ?? null),
          isLoaded: true,
        };
      });
    } catch (error) {
      console.error('[pixel] failed to load documents', error);
      useNotificationStore
        .getState()
        .addNotification('Could not load sprites', error instanceof Error ? error.message : String(error), 'error');
      set({ isLoaded: true });
    }
  },

  createDocument: async (options): Promise<string | null> => {
    try {
      // Make sure the palette library is loaded, so a saved palette can be
      // adopted even if the user creates a sprite before visiting the page.
      if (!get().palettesLoaded) await get().loadSavedPalettes();
      const saved = get().savedPalettes.at(0);

      const document = createPixelDocument({
        ...options,
        palette: saved ? saved.colors : undefined,
      });
      // A saved palette carries its own grid width.
      const withColumns = saved ? { ...document, paletteColumns: saved.columns } : document;

      await athenaDb.pixelDocuments.put(withColumns);
      set((state) => ({
        documents: [withColumns, ...state.documents],
        activeDocumentId: withColumns.id,
        undoStacks: { ...state.undoStacks, [withColumns.id]: [] },
        redoStacks: { ...state.redoStacks, [withColumns.id]: [] },
      }));
      return withColumns.id;
    } catch (error) {
      useNotificationStore
        .getState()
        .addNotification('Could not create sprite', error instanceof Error ? error.message : String(error), 'error');
      return null;
    }
  },

  deleteDocument: async (id): Promise<void> => {
    try {
      await athenaDb.pixelDocuments.delete(id);
    } catch (error) {
      console.error('[pixel] failed to delete document', error);
    }
    set((state) => {
      const documents = state.documents.filter((document) => document.id !== id);
      return {
        documents,
        activeDocumentId: state.activeDocumentId === id ? (documents.at(0)?.id ?? null) : state.activeDocumentId,
        undoStacks: withoutKey(state.undoStacks, id),
        redoStacks: withoutKey(state.redoStacks, id),
      };
    });
  },

  setActiveDocument: (id): void => {
    set({ activeDocumentId: id });
  },

  renameDocument: async (id, name): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = get().documents.find((document) => document.id === id);
    if (!current) return;
    const next: PixelDocument = { ...current, name: trimmed, updatedOn: new Date().toISOString() };
    set((state) => ({
      documents: state.documents.map((document) => (document.id === id ? next : document)),
    }));
    await persist(next);
  },

  replacePalette: async (id, palette, columns): Promise<void> => {
    const current = get().documents.find((document) => document.id === id);
    if (!current || palette.length === 0) return;
    const next = cloneDocument(current);
    next.palette = palette.map((color) => ({ ...color }));
    // Drop pixels that no longer have a colour instead of leaving dangling indices.
    const limit = next.palette.length;
    next.layers = next.layers.map((layer) => ({
      ...layer,
      pixels: layer.pixels.map((value) => (value >= limit ? -1 : value)),
    }));
    // Rebuild the active set: everything in use first, then the palette head.
    next.activeColorIds = rebuildActiveColorIds(next);
    const normalized = normalizePixelDocument(next);
    if (columns !== undefined) normalized.paletteColumns = clampPaletteColumns(columns);
    normalized.revision = current.revision + 1;
    normalized.updatedOn = new Date().toISOString();
    set((state) => ({
      documents: state.documents.map((document) => (document.id === id ? normalized : document)),
      // Replacing a palette can drop pixels, so make it undoable.
      undoStacks: {
        ...state.undoStacks,
        [id]: [...getStack(state.undoStacks, id), cloneDocument(current)].slice(-UNDO_LIMIT),
      },
      redoStacks: { ...state.redoStacks, [id]: [] },
    }));
    await persist(normalized);
  },

  loadSavedPalettes: async (): Promise<void> => {
    try {
      const stored = await athenaDb.pixelPalettes.orderBy('updatedOn').reverse().toArray();
      set({ savedPalettes: stored.map(normalizeSavedPalette), palettesLoaded: true });
    } catch (error) {
      console.error('[pixel] failed to load palettes', error);
      set({ palettesLoaded: true });
    }
  },

  savePalette: async (name, colors, columns): Promise<string | null> => {
    if (colors.length === 0) return null;
    const state = get();
    const trimmed = name.trim() ? name.trim() : 'Imported palette';
    const now = new Date().toISOString();
    const resolvedColumns =
      columns === undefined
        ? (state.savedPalettes.find((palette) => palette.name.toLowerCase() === trimmed.toLowerCase())?.columns ??
          DEFAULT_PALETTE_COLUMNS)
        : clampPaletteColumns(columns);
    const existing = state.savedPalettes.find((palette) => palette.name.toLowerCase() === trimmed.toLowerCase());

    const record: SavedPixelPalette = existing
      ? { ...existing, colors: colors.map((color) => ({ ...color })), columns: resolvedColumns, updatedOn: now }
      : {
          id: crypto.randomUUID(),
          name: trimmed,
          colors: colors.map((color) => ({ ...color })),
          columns: resolvedColumns,
          createdOn: now,
          updatedOn: now,
        };

    try {
      await athenaDb.pixelPalettes.put(record);
    } catch (error) {
      console.error('[pixel] failed to save palette', error);
      useNotificationStore
        .getState()
        .addNotification('Could not save palette', error instanceof Error ? error.message : String(error), 'error');
      return null;
    }

    set({
      savedPalettes: existing
        ? state.savedPalettes.map((palette) => (palette.id === record.id ? record : palette))
        : [record, ...state.savedPalettes],
    });
    return record.id;
  },

  deleteSavedPalette: async (id): Promise<void> => {
    try {
      await athenaDb.pixelPalettes.delete(id);
    } catch (error) {
      console.error('[pixel] failed to delete palette', error);
    }
    set((state) => ({ savedPalettes: state.savedPalettes.filter((palette) => palette.id !== id) }));
  },

  applySavedPalette: async (documentId, paletteId): Promise<void> => {
    const saved = get().savedPalettes.find((palette) => palette.id === paletteId);
    if (!saved) return;
    await get().replacePalette(documentId, saved.colors, saved.columns);
  },

  setPaletteColumns: async (documentId, columns): Promise<void> => {
    const state = get();
    const current = state.documents.find((document) => document.id === documentId);
    if (!current) return;
    const nextColumns = clampPaletteColumns(columns);
    if (nextColumns === current.paletteColumns) return;

    // Display-only change: no revision bump, so it cannot invalidate a model's
    // in-flight baseRevision check.
    const next: PixelDocument = {
      ...current,
      paletteColumns: nextColumns,
      updatedOn: new Date().toISOString(),
    };
    set({
      documents: state.documents.map((document) => (document.id === documentId ? next : document)),
    });
    await persist(next);
  },

  setActiveColorState: async (documentId, colorId, active): Promise<{ ok: boolean; message?: string }> => {
    const state = get();
    const current = state.documents.find((document) => document.id === documentId);
    if (!current) return { ok: false, message: 'Sprite not found.' };

    const paletteIndex = current.palette.findIndex((color) => color.id === colorId);
    if (paletteIndex < 0) return { ok: false, message: 'That colour is not in the palette.' };

    const isActive = current.activeColorIds.includes(colorId);
    if (isActive === active) return { ok: true };

    let activeColorIds: string[];

    if (active) {
      if (current.activeColorIds.length >= MAX_ACTIVE_COLORS) {
        return { ok: false, message: `Active palette is full (${MAX_ACTIVE_COLORS}). Deactivate a colour first.` };
      }
      activeColorIds = [...current.activeColorIds, colorId];
    } else {
      if (usedPaletteIndices(current).has(paletteIndex)) {
        return {
          ok: false,
          message: `"${colorId}" is still used by this sprite. Erase those pixels first, or keep the colour active.`,
        };
      }
      activeColorIds = current.activeColorIds.filter((id) => id !== colorId);
    }

    const next: PixelDocument = {
      ...current,
      activeColorIds,
      // Glyph letters are positional, so changing the active set changes what a
      // glyph means. Bump the revision so a stale edit cannot use old letters.
      revision: current.revision + 1,
      updatedOn: new Date().toISOString(),
    };

    set({
      documents: state.documents.map((document) => (document.id === documentId ? next : document)),
    });
    await persist(next);
    return { ok: true };
  },

  toggleActiveColor: async (documentId, colorId): Promise<{ ok: boolean; message?: string }> => {
    const current = get().documents.find((document) => document.id === documentId);
    if (!current) return { ok: false, message: 'Sprite not found.' };
    return get().setActiveColorState(documentId, colorId, !current.activeColorIds.includes(colorId));
  },

  setActiveColors: async (documentId, colorIds): Promise<{ ok: boolean; message?: string }> => {
    const state = get();
    const current = state.documents.find((document) => document.id === documentId);
    if (!current) return { ok: false, message: 'Sprite not found.' };

    const paletteIds = new Set(current.palette.map((color) => color.id));
    const next: string[] = [];
    for (const id of colorIds) {
      if (next.length >= MAX_ACTIVE_COLORS) break;
      if (!paletteIds.has(id) || next.includes(id)) continue;
      next.push(id);
    }

    if (next.length === 0) return { ok: false, message: 'No colours to activate.' };
    const unchanged =
      next.length === current.activeColorIds.length && next.every((id, index) => current.activeColorIds[index] === id);
    if (unchanged) return { ok: true };

    const updated: PixelDocument = {
      ...current,
      activeColorIds: next,
      revision: current.revision + 1,
      updatedOn: new Date().toISOString(),
    };

    set({
      documents: state.documents.map((document) => (document.id === documentId ? updated : document)),
    });
    await persist(updated);
    return { ok: true };
  },

  clearActiveColors: async (documentId): Promise<void> => {
    const state = get();
    const current = state.documents.find((document) => document.id === documentId);
    if (!current || current.activeColorIds.length === 0) return;

    const next: PixelDocument = {
      ...current,
      activeColorIds: [],
      revision: current.revision + 1,
      updatedOn: new Date().toISOString(),
    };

    set({
      documents: state.documents.map((document) => (document.id === documentId ? next : document)),
    });
    await persist(next);
  },

  applyOpsTo: (documentId, ops, options): PixelOpError[] => {
    const { documents, undoStacks, redoStacks } = get();
    const current = documents.find((document) => document.id === documentId);
    if (!current) {
      return [{ opIndex: -1, opType: 'document', message: 'That sprite no longer exists.' }];
    }

    const result = applyOpsToDocument(current, ops, { clip: options?.clip });
    if (!result.ok) return result.errors;

    const recordUndo = options?.recordUndo !== false;
    const undoStack = [...getStack(undoStacks, documentId), cloneDocument(current)].slice(-UNDO_LIMIT);

    set({
      documents: documents.map((document) => (document.id === documentId ? result.document : document)),
      undoStacks: recordUndo ? { ...undoStacks, [documentId]: undoStack } : undoStacks,
      redoStacks: recordUndo ? { ...redoStacks, [documentId]: [] } : redoStacks,
    });
    void persist(result.document);
    return [];
  },

  applyOps: (ops, options): PixelOpError[] => {
    const activeDocumentId = get().activeDocumentId;
    if (!activeDocumentId) {
      return [{ opIndex: -1, opType: 'document', message: 'No sprite is open.' }];
    }
    return get().applyOpsTo(activeDocumentId, ops, options);
  },

  undo: (): void => {
    const state = get();
    const id = state.activeDocumentId;
    if (!id) return;
    const stack = getStack(state.undoStacks, id);
    const previous = stack.at(-1);
    const current = state.documents.find((document) => document.id === id);
    if (!previous || !current) return;

    // Keep revisions monotonic so future optimistic-concurrency checks never
    // see the counter move backwards after an undo. Metadata that is not part of
    // the artwork is preserved from the live document: restoring a snapshot must
    // not detach the sprite's chat or reset its palette layout.
    const restored: PixelDocument = {
      ...previous,
      name: current.name,
      chatTopicId: current.chatTopicId,
      paletteColumns: current.paletteColumns,
      revision: current.revision + 1,
      updatedOn: new Date().toISOString(),
    };

    set({
      documents: state.documents.map((document) => (document.id === id ? restored : document)),
      undoStacks: { ...state.undoStacks, [id]: stack.slice(0, -1) },
      redoStacks: {
        ...state.redoStacks,
        [id]: [...getStack(state.redoStacks, id), cloneDocument(current)].slice(-UNDO_LIMIT),
      },
    });
    void persist(restored);
  },

  redo: (): void => {
    const state = get();
    const id = state.activeDocumentId;
    if (!id) return;
    const stack = getStack(state.redoStacks, id);
    const next = stack.at(-1);
    const current = state.documents.find((document) => document.id === id);
    if (!next || !current) return;

    const restored: PixelDocument = {
      ...next,
      name: current.name,
      chatTopicId: current.chatTopicId,
      paletteColumns: current.paletteColumns,
      revision: current.revision + 1,
      updatedOn: new Date().toISOString(),
    };

    set({
      documents: state.documents.map((document) => (document.id === id ? restored : document)),
      redoStacks: { ...state.redoStacks, [id]: stack.slice(0, -1) },
      undoStacks: {
        ...state.undoStacks,
        [id]: [...getStack(state.undoStacks, id), cloneDocument(current)].slice(-UNDO_LIMIT),
      },
    });
    void persist(restored);
  },
}));
