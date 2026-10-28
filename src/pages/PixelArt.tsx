import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import BackspaceIcon from '@mui/icons-material/Backspace';
import ColorizeIcon from '@mui/icons-material/Colorize';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import LayersClearIcon from '@mui/icons-material/LayersClear';
import RedoIcon from '@mui/icons-material/Redo';
import RemoveIcon from '@mui/icons-material/Remove';
import UndoIcon from '@mui/icons-material/Undo';
import { stackDepth, usePixelStore } from '../store/PixelStore';
import { useNotificationStore } from '../store/NotificationStore';
import { PixelCanvas, PixelTool } from '../components/PixelCanvas';
import SpriteChat from '../components/SpriteChat';
import {
  PixelOp,
  DEFAULT_PALETTE_COLUMNS,
  MAX_ACTIVE_COLORS,
  MAX_CANVAS_SIZE,
  MAX_PALETTE_COLUMNS,
  MIN_PALETTE_COLUMNS,
  PixelRect,
} from '../pixel/types';
import { summarizeErrors } from '../pixel/ops';
import { encodeGrid, exportPng } from '../pixel/serialize';
import { glyphReferences, luminance, parseGpl, parseGplColumns, parseGplName, serializeGpl } from '../pixel/palette';
import { bitmapToPaletteRows, readBitmapFile } from '../pixel/bitmapImport';

const ZOOM_LEVELS = [1, 4, 32];

/** Per-channel drift below this is treated as colour-profile rounding. */
const NEAR_MISS_DELTA = 6;

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sprite'
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const PixelArt: React.FC = () => {
  const documents = usePixelStore((state) => state.documents);
  const activeDocumentId = usePixelStore((state) => state.activeDocumentId);
  const isLoaded = usePixelStore((state) => state.isLoaded);
  const palettesLoaded = usePixelStore((state) => state.palettesLoaded);
  const savedPalettes = usePixelStore((state) => state.savedPalettes);
  const undoStacks = usePixelStore((state) => state.undoStacks);
  const redoStacks = usePixelStore((state) => state.redoStacks);
  const loadDocuments = usePixelStore((state) => state.loadDocuments);
  const loadSavedPalettes = usePixelStore((state) => state.loadSavedPalettes);
  const savePalette = usePixelStore((state) => state.savePalette);
  const deleteSavedPalette = usePixelStore((state) => state.deleteSavedPalette);
  const applySavedPalette = usePixelStore((state) => state.applySavedPalette);
  const createDocument = usePixelStore((state) => state.createDocument);
  const deleteDocument = usePixelStore((state) => state.deleteDocument);
  const setActiveDocument = usePixelStore((state) => state.setActiveDocument);
  const renameDocument = usePixelStore((state) => state.renameDocument);
  const replacePalette = usePixelStore((state) => state.replacePalette);
  const toggleActiveColor = usePixelStore((state) => state.toggleActiveColor);
  const setActiveColorState = usePixelStore((state) => state.setActiveColorState);
  const setActiveColors = usePixelStore((state) => state.setActiveColors);
  const clearActiveColors = usePixelStore((state) => state.clearActiveColors);
  const setPaletteColumns = usePixelStore((state) => state.setPaletteColumns);
  const applyOps = usePixelStore((state) => state.applyOps);
  const applyOpsTo = usePixelStore((state) => state.applyOpsTo);
  const undo = usePixelStore((state) => state.undo);
  const redo = usePixelStore((state) => state.redo);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [tool, setTool] = useState<PixelTool>('pencil');
  const [colorIndex, setColorIndex] = useState(0);
  const [zoom, setZoom] = useState(32);
  const [nameDraft, setNameDraft] = useState('');
  const [selection, setSelection] = useState<PixelRect | null>(null);

  // The editor's own width decides the layout, not the viewport: the app drawer
  // can take 300px of a 1024px window, which a media query cannot see.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [editorWidth, setEditorWidth] = useState(0);

  // Stacked below this: list + palette alone would leave the canvas unusable.
  const STACK_BELOW = 760;
  // Chat only sits beside the canvas when all four panels still leave it room.
  const CHAT_BESIDE_ABOVE = 1120;

  const isNarrow = editorWidth > 0 && editorWidth < STACK_BELOW;
  const chatBesideCanvas = editorWidth === 0 || editorWidth >= CHAT_BESIDE_ABOVE;

  const [createOpen, setCreateOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [newName, setNewName] = useState('Sprite');
  const [newWidth, setNewWidth] = useState('32');
  const [newHeight, setNewHeight] = useState('32');

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteText, setPaletteText] = useState('');
  const [showAllColors, setShowAllColors] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  // Below the side-by-side threshold the chat replaces the canvas rather than
  // squeezing it, so focus follows whichever pane is open.
  const canvasHidden = chatOpen && !chatBesideCanvas;

  /**
   * Drag-to-toggle state for the master palette. The direction is decided by the
   * first swatch touched, so dragging across a ramp activates or deactivates the
   * whole run instead of flipping each one individually.
   */
  const paletteDragRef = useRef<{ desired: boolean; touched: Set<string>; message?: string } | null>(null);
  const pngInputRef = useRef<HTMLInputElement | null>(null);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId),
    [documents, activeDocumentId],
  );

  const activeReferences = useMemo(
    () => (activeDocument ? glyphReferences(activeDocument.activeColorIds, activeDocument.palette) : []),
    [activeDocument],
  );

  const paletteColumns = activeDocument?.paletteColumns ?? DEFAULT_PALETTE_COLUMNS;

  useEffect((): void => {
    // When there is no room for the chat beside the canvas it takes the canvas's
    // place; don't do that unasked just because the window shrank.
    if (!chatBesideCanvas) setChatOpen(false);
  }, [chatBesideCanvas]);

  useEffect((): void => {
    if (!isLoaded) void loadDocuments();
    if (!palettesLoaded) void loadSavedPalettes();
  }, [isLoaded, palettesLoaded, loadDocuments, loadSavedPalettes]);

  useEffect((): void => {
    setNameDraft(activeDocument?.name ?? '');
  }, [activeDocument?.id, activeDocument?.name]);

  useEffect((): void => {
    // A selection is per-sprite UI state, not content.
    setSelection(null);
  }, [activeDocument?.id]);

  useEffect((): void => {
    if (!activeDocument) return;
    const selected = activeDocument.palette.at(colorIndex);
    if (selected && activeDocument.activeColorIds.includes(selected.id)) return;
    // Keep the drawing colour inside the active subset. When the subset is empty
    // there is nothing to select, and drawing is disabled instead.
    const first = glyphReferences(activeDocument.activeColorIds, activeDocument.palette).at(0);
    if (first) setColorIndex(first.paletteIndex);
  }, [activeDocument, colorIndex]);

  const handleApply = useCallback(
    (ops: PixelOp[], clip?: PixelRect | null): void => {
      const errors = applyOps(ops, { clip: clip ?? undefined });
      if (errors.length > 0) addNotification('Edit rejected', summarizeErrors(errors), 'error');
    },
    [applyOps, addNotification],
  );

  /** Drawing is confined to the selection when one exists. */
  const applyWithSelection = useCallback(
    (ops: PixelOp[]): void => handleApply(ops, selection),
    [handleApply, selection],
  );

  useEffect((): (() => void) => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (event.key === 'Escape') {
        setSelection(null);
        return;
      }

      if (!event.ctrlKey && !event.metaKey) return;

      if (event.key.toLowerCase() === 'a' && activeDocument) {
        event.preventDefault();
        setSelection({ x: 0, y: 0, width: activeDocument.width, height: activeDocument.height });
        return;
      }

      if (event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    globalThis.addEventListener('keydown', handler);
    return (): void => globalThis.removeEventListener('keydown', handler);
  }, [undo, redo, activeDocument]);

  const handleCreate = async (): Promise<void> => {
    const width = Number.parseInt(newWidth, 10);
    const height = Number.parseInt(newHeight, 10);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      addNotification('Invalid size', 'Width and height must be positive whole numbers.', 'error');
      return;
    }
    if (width > MAX_CANVAS_SIZE || height > MAX_CANVAS_SIZE) {
      addNotification('Invalid size', `Largest canvas is ${MAX_CANVAS_SIZE}x${MAX_CANVAS_SIZE}.`, 'error');
      return;
    }
    const id = await createDocument({ name: newName, width, height });
    if (id) {
      setCreateOpen(false);
      setNewName('Sprite');
    }
  };

  const commitName = (): void => {
    if (!activeDocument) return;
    if (nameDraft.trim() && nameDraft.trim() !== activeDocument.name) {
      void renameDocument(activeDocument.id, nameDraft);
    }
  };

  const handleExportPng = async (): Promise<void> => {
    if (!activeDocument) return;
    try {
      const blob = await exportPng(activeDocument, 1);
      download(blob, `${slugify(activeDocument.name)}-${activeDocument.width}x${activeDocument.height}.png`);
    } catch (error) {
      addNotification('Export failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleImportPng = async (file: File): Promise<void> => {
    if (!activeDocument) return;
    const targetId = activeDocument.id;
    try {
      const source = await readBitmapFile(file);

      // Decoding is async: re-read the document and stay bound to the sprite the
      // import started on, so switching sprites mid-decode cannot write into the
      // wrong artwork.
      const target = usePixelStore.getState().documents.find((document) => document.id === targetId);
      if (!target) {
        addNotification('Import cancelled', 'That sprite is no longer open.', 'warning');
        return;
      }

      const result = bitmapToPaletteRows(source, target.palette, target.width, target.height);
      // One stamp covering the canvas: atomic, single undo step.
      const errors = applyOpsTo(targetId, [
        { type: 'stamp', x: 0, y: 0, mode: 'replace', rows: result.rows },
      ]);
      if (errors.length > 0) {
        addNotification('Import rejected', summarizeErrors(errors), 'error');
        return;
      }

      // Adopt the artwork's colours as the working set, so the palette panel and
      // the glyph grid match what the sprite actually uses.
      const activeIds = result.usedPaletteIndices
        .map((index) => target.palette.at(index)?.id)
        .filter((id): id is string => id !== undefined);
      if (activeIds.length > 0) {
        await setActiveColors(targetId, activeIds);
      }

      const activeNote =
        activeIds.length === 0
          ? ''
          : activeIds.length > MAX_ACTIVE_COLORS
            ? ` ${MAX_ACTIVE_COLORS} of ${activeIds.length} colours active (limit).`
            : ` ${activeIds.length} colour(s) active.`;

      const placed = `${result.placed.width}×${result.placed.height} at (${result.placed.x}, ${result.placed.y})`;
      if (result.snappedColors === 0 || result.maxChannelDelta <= 2) {
        // Within a couple of units is colour-profile rounding; the snap already
        // put every pixel on an exact palette entry, so there is nothing to act on.
        addNotification('Image imported', `${placed}.${activeNote}`, 'success');
        return;
      }

      if (result.maxChannelDelta <= NEAR_MISS_DELTA) {
        addNotification(
          'Image imported',
          `${placed}.${activeNote} ${result.snappedColors} colour(s) snapped to the nearest palette match (max Δ${result.maxChannelDelta}).`,
          'info',
        );
        return;
      }

      const examples = result.examples.map((example) => `${example.from} → ${example.to}`).join(', ');
      addNotification(
        'Image imported',
        `${placed}.${activeNote} ${result.snappedColors} colour(s) were not in this sprite's palette (max Δ${result.maxChannelDelta}: ${examples}). If the image was drawn with a different palette, import that .gpl first.`,
        'warning',
      );
    } catch (error) {
      addNotification('Import failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleExportGpl = (): void => {
    if (!activeDocument) return;
    const text = serializeGpl(activeDocument.name, activeDocument.palette);
    download(new Blob([text], { type: 'text/plain' }), `${slugify(activeDocument.name)}.gpl`);
  };

  const handleCopyGrid = async (): Promise<void> => {
    if (!activeDocument) return;
    const grid = encodeGrid(activeDocument);
    try {
      await navigator.clipboard.writeText(JSON.stringify(grid, null, 2));
      addNotification('Grid copied', 'Character grid is on the clipboard.', 'success');
    } catch (error) {
      addNotification('Copy failed', error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleImportPalette = async (): Promise<void> => {
    if (!activeDocument) return;
    const colors = parseGpl(paletteText);
    if (colors.length === 0) {
      addNotification('Palette not imported', 'No colour rows were found in that text.', 'error');
      return;
    }
    const columns = parseGplColumns(paletteText) ?? activeDocument.paletteColumns;
    await replacePalette(activeDocument.id, colors, columns);
    // Keep it in the library so the next sprite can reuse it.
    const name = parseGplName(paletteText) ?? `${activeDocument.name} palette`;
    await savePalette(name, colors, columns);
    setPaletteOpen(false);
    setPaletteText('');
    addNotification('Palette imported', `${colors.length} colours loaded and saved as "${name}".`, 'success');
  };

  const handleToggleColor = async (colorId: string): Promise<void> => {
    if (!activeDocument) return;
    const result = await toggleActiveColor(activeDocument.id, colorId);
    if (!result.ok && result.message) addNotification('Palette', result.message, 'warning');
  };

  const applyPaletteDrag = (colorId: string): void => {
    const drag = paletteDragRef.current;
    if (!drag || !activeDocument || drag.touched.has(colorId)) return;
    drag.touched.add(colorId);
    void setActiveColorState(activeDocument.id, colorId, drag.desired).then((result) => {
      // One shared warning at release, instead of a toast per swatch.
      if (!result.ok && result.message) drag.message = result.message;
    });
  };

  const startPaletteDrag = (colorId: string, isActive: boolean): void => {
    if (!activeDocument) return;
    paletteDragRef.current = { desired: !isActive, touched: new Set<string>() };
    applyPaletteDrag(colorId);
  };

  useEffect((): (() => void) => {
    const finish = (): void => {
      const drag = paletteDragRef.current;
      paletteDragRef.current = null;
      if (drag?.message) addNotification('Palette', drag.message, 'warning');
    };
    globalThis.addEventListener('pointerup', finish);
    return (): void => globalThis.removeEventListener('pointerup', finish);
  }, [addNotification]);

  const handleColumnsChange = (delta: number): void => {
    if (!activeDocument) return;
    void setPaletteColumns(activeDocument.id, activeDocument.paletteColumns + delta);
  };

  const handleClearActivePalette = (): void => {
    if (!activeDocument) return;
    void clearActiveColors(activeDocument.id);
  };

  const handleClearAll = (): void => {
    if (!activeDocument) return;
    handleApply([
      {
        type: 'clear_rect',
        x: 0,
        y: 0,
        width: activeDocument.width,
        height: activeDocument.height,
      },
    ]);
    setClearOpen(false);
  };

  const activeColor = activeDocument?.palette[colorIndex];
  const canUndo = activeDocumentId ? stackDepth(undoStacks, activeDocumentId) > 0 : false;
  const canRedo = activeDocumentId ? stackDepth(redoStacks, activeDocumentId) > 0 : false;

  useEffect((): (() => void) | undefined => {
    const element = containerRef.current;
    if (!element) return undefined;

    const measure = (): void => setEditorWidth(element.clientWidth || globalThis.innerWidth);
    measure();

    // jsdom (and very old browsers) lack ResizeObserver; the one-off measurement
    // above is enough there.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return (): void => observer.disconnect();
  }, []);

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        flexGrow: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
      {/* Sprite list (replaced by a picker in the toolbar on narrow screens) */}
      <Box
        sx={{
          width: 200,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: isNarrow ? 'none' : 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
        <Box sx={{ p: 1.5 }}>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={(): void => setCreateOpen(true)}>
            New sprite
          </Button>
        </Box>
        <Divider />
        <List
          dense
          sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
          {documents.map((document) => (
            <ListItemButton
              key={document.id}
              selected={document.id === activeDocumentId}
              onClick={(): void => setActiveDocument(document.id)}>
              <ListItemText
                primary={document.name}
                secondary={`${document.width}×${document.height} · rev ${document.revision}`}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItemButton>
          ))}
          {isLoaded && documents.length === 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', p: 2 }}>
              No sprites yet.
            </Typography>
          )}
        </List>
      </Box>

      {/* Canvas column */}
      <Box
        sx={{
          flexGrow: 1,
          display: canvasHidden ? 'none' : 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            flexWrap: 'wrap',
          }}>
          {activeDocument ? (
            <>
              {isNarrow && (
                <>
                  <Select
                    size="small"
                    value={activeDocument.id}
                    onChange={(event): void => setActiveDocument(String(event.target.value))}
                    sx={{ minWidth: 110, maxWidth: 160 }}
                    inputProps={{ 'aria-label': 'Active sprite' }}>
                    {documents.map((document) => (
                      <MenuItem key={document.id} value={document.id}>
                        {document.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <Tooltip title="New sprite">
                    <IconButton
                      size="small"
                      onClick={(): void => setCreateOpen(true)}
                      aria-label="New sprite">
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              <TextField
                value={nameDraft}
                onChange={(event): void => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event): void => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                size="small"
                variant="standard"
                sx={{ width: isNarrow ? 110 : 180 }}
                inputProps={{ 'aria-label': 'Sprite name' }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: isNarrow ? 'none' : 'block' }}>
                {activeDocument.width}×{activeDocument.height} · {activeDocument.palette.length} colours
              </Typography>

              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.5 }}
              />

              <ToggleButtonGroup
                exclusive
                size="small"
                value={tool}
                onChange={(_event, value: PixelTool | null): void => {
                  if (value) setTool(value);
                }}
                aria-label="Drawing tool">
                <ToggleButton
                  value="pencil"
                  aria-label="Pencil">
                  <EditIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton
                  value="eraser"
                  aria-label="Eraser">
                  <BackspaceIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton
                  value="fill"
                  aria-label="Fill">
                  <FormatColorFillIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton
                  value="eyedropper"
                  aria-label="Eyedropper">
                  <ColorizeIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton
                  value="select"
                  aria-label="Select region">
                  <CropSquareIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>

              {selection && (
                <Tooltip title="Selection — Esc clears it">
                  <Chip
                    size="small"
                    label={`${selection.width}×${selection.height}`}
                    onDelete={(): void => setSelection(null)}
                  />
                </Tooltip>
              )}

              <Tooltip title="Undo (Ctrl+Z)">
                <span>
                  <IconButton
                    size="small"
                    onClick={undo}
                    disabled={!canUndo}
                    aria-label="Undo">
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Shift+Z)">
                <span>
                  <IconButton
                    size="small"
                    onClick={redo}
                    disabled={!canRedo}
                    aria-label="Redo">
                    <RedoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.5 }}
              />

              <Tooltip title="Clear canvas">
                <IconButton
                  size="small"
                  onClick={(): void => setClearOpen(true)}
                  aria-label="Clear canvas">
                  <LayersClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title={chatOpen ? 'Hide sprite chat' : 'Show sprite chat'}>
                <IconButton
                  size="small"
                  onClick={(): void => setChatOpen((value) => !value)}
                  aria-label="Toggle sprite chat"
                  color={chatOpen ? 'primary' : 'default'}>
                  <ChatBubbleOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Box sx={{ flexGrow: 1 }} />

              <ToggleButtonGroup
                exclusive
                size="small"
                value={zoom}
                onChange={(_event, value: number | null): void => {
                  if (value) setZoom(value);
                }}
                aria-label="Zoom">
                {ZOOM_LEVELS.map((level) => (
                  <ToggleButton
                    key={level}
                    value={level}
                    sx={{ px: 1, py: 0.25, fontSize: '0.7rem' }}>
                    {level}×
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Tooltip title="Import a PNG onto the canvas">
                <IconButton
                  size="small"
                  onClick={(): void => pngInputRef.current?.click()}
                  aria-label="Import PNG">
                  <AddPhotoAlternateIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <input
                ref={pngInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event): void => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void handleImportPng(file);
                }}
              />
              <Tooltip title="Copy character grid">
                <IconButton
                  size="small"
                  onClick={(): void => void handleCopyGrid()}
                  aria-label="Copy grid">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export PNG">
                <IconButton
                  size="small"
                  onClick={(): void => void handleExportPng()}
                  aria-label="Export PNG">
                  <FileDownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export palette (.gpl)">
                <IconButton
                  size="small"
                  onClick={handleExportGpl}
                  aria-label="Export palette">
                  <FileUploadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary">
              Create a sprite to start.
            </Typography>
          )}
        </Box>

        <Box
          onDragOver={(event): void => {
            event.preventDefault();
          }}
          onDrop={(event): void => {
            event.preventDefault();
            const file = event.dataTransfer.files.item(0);
            if (file) void handleImportPng(file);
          }}
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 3,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            bgcolor: 'background.default',
            minHeight: 0,
          }}>
          {activeDocument ? (
            <PixelCanvas
              key={activeDocument.id}
              sprite={activeDocument}
              zoom={zoom}
              tool={tool}
              colorIndex={colorIndex}
              canPaint={activeReferences.length > 0}
              selection={selection}
              onSelectionChange={setSelection}
              onApply={applyWithSelection}
              onPickColor={setColorIndex}
            />
          ) : (
            <Box sx={{ textAlign: 'center', mt: 8 }}>
              <Typography
                variant="h6"
                gutterBottom>
                No sprite open
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2 }}>
                Sprites live here on this page, separate from your chat topics.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={(): void => setCreateOpen(true)}>
                New sprite
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Palette */}
      <Box
        sx={{
          width: isNarrow ? '100%' : 236,
          height: isNarrow ? 240 : 'auto',
          flexShrink: 0,
          borderLeft: isNarrow ? 0 : 1,
          borderTop: isNarrow ? 1 : 0,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between">
            <Typography
              variant="caption"
              color="text.secondary">
              Active palette
            </Typography>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center">
              <Typography
                variant="caption"
                color="text.secondary">
                {activeReferences.length}/{MAX_ACTIVE_COLORS}
              </Typography>
              <Button
                size="small"
                variant="text"
                disabled={activeReferences.length === 0}
                onClick={handleClearActivePalette}
                sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: '0.65rem', lineHeight: 1.6 }}>
                Clear
              </Button>
            </Stack>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 1, minHeight: 40 }}>
            {activeColor && activeReferences.length > 0 ? (
              <>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    bgcolor: activeColor.hex,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 0.5,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    display="block"
                    noWrap>
                    {activeColor.id}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block">
                    {activeColor.hex} · palette #{colorIndex}
                  </Typography>
                </Box>
              </>
            ) : (
              <Typography
                variant="caption"
                color="text.secondary">
                No active colours
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Active subset: click to draw with it.
            Fixed share of the panel so activating colours never shifts the grid
            below it (which would move swatches out from under the cursor). */}
        <Box
          sx={{
            p: 1,
            flex: showAllColors ? '0 1 40%' : '1 1 auto',
            minHeight: 80,
            overflow: 'auto',
          }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${paletteColumns}, 1fr)`,
              gap: 0.5,
            }}>
            {activeReferences.map((reference) => (
              <Box
                key={reference.id}
                role="button"
                tabIndex={0}
                aria-label={`Draw with ${reference.id}`}
                onClick={(): void => setColorIndex(reference.paletteIndex)}
                onKeyDown={(event): void => {
                  if (event.key === 'Enter' || event.key === ' ') setColorIndex(reference.paletteIndex);
                }}
                sx={{
                  aspectRatio: '1 / 1',
                  bgcolor: reference.hex,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: luminance(reference.hex) > 0.55 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)',
                  outline: reference.paletteIndex === colorIndex ? '2px solid' : '1px solid',
                  outlineColor: reference.paletteIndex === colorIndex ? 'primary.main' : 'divider',
                  outlineOffset: reference.paletteIndex === colorIndex ? '1px' : 0,
                }}>
                {reference.glyph}
              </Box>
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            px: 0.5,
            py: 0.25,
            borderTop: 1,
            borderBottom: showAllColors ? 1 : 0,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
          <Button
            size="small"
            variant="text"
            aria-expanded={showAllColors}
            onClick={(): void => setShowAllColors((value) => !value)}
            startIcon={
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  transform: showAllColors ? 'rotate(180deg)' : 'none',
                  transition: 'transform 150ms',
                }}
              />
            }
            sx={{ minWidth: 0, px: 0.5, color: 'text.secondary', textTransform: 'none' }}>
            All colours
          </Button>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.25}>
            <Typography
              variant="caption"
              color="text.secondary">
              cols
            </Typography>
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              aria-label="Fewer colours per row"
              disabled={paletteColumns <= MIN_PALETTE_COLUMNS}
              onClick={(): void => handleColumnsChange(-1)}>
              <RemoveIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Typography
              variant="caption"
              sx={{ minWidth: 12, textAlign: 'center' }}>
              {paletteColumns}
            </Typography>
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              aria-label="More colours per row"
              disabled={paletteColumns >= MAX_PALETTE_COLUMNS}
              onClick={(): void => handleColumnsChange(1)}>
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        </Box>

        {/* Master palette: click toggles membership in the active subset */}
        {showAllColors && (
          <Box sx={{ p: 1, overflow: 'auto', flexGrow: 1, flexBasis: '60%', minHeight: 0 }}>
            {activeDocument && (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${paletteColumns}, 1fr)`,
                  gap: 0.5,
                  userSelect: 'none',
                }}>
                {activeDocument.palette.map((color) => {
                  const isActive = activeDocument.activeColorIds.includes(color.id);
                  return (
                    <Box
                      key={color.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Toggle ${color.id}`}
                      onPointerDown={(event): void => {
                        event.preventDefault();
                        startPaletteDrag(color.id, isActive);
                      }}
                      onPointerEnter={(): void => applyPaletteDrag(color.id)}
                      onKeyDown={(event): void => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void handleToggleColor(color.id);
                        }
                      }}
                      sx={{
                        aspectRatio: '1 / 1',
                        bgcolor: color.hex,
                        cursor: 'pointer',
                        opacity: isActive ? 1 : 0.28,
                        outline: isActive ? '2px solid' : '1px solid',
                        outlineColor: isActive ? 'text.secondary' : 'divider',
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        )}

        <Divider sx={{ flexShrink: 0 }} />
        <Box sx={{ p: 1.5, flexShrink: 0 }}>
          <Button
            fullWidth
            size="small"
            variant="text"
            disabled={!activeDocument}
            onClick={(): void => setPaletteOpen(true)}>
            Import .gpl
          </Button>

          {savedPalettes.length > 0 && (
            <Box sx={{ mt: 1, maxHeight: 180, overflow: 'auto' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ px: 0.5, mb: 0.5 }}>
                Saved palettes
              </Typography>
              {savedPalettes.map((palette) => (
                <Stack
                  key={palette.id}
                  direction="row"
                  alignItems="center"
                  spacing={0.25}>
                  <Button
                    size="small"
                    variant="text"
                    disabled={!activeDocument}
                    onClick={(): void => {
                      if (activeDocument) void applySavedPalette(activeDocument.id, palette.id);
                    }}
                    sx={{
                      justifyContent: 'space-between',
                      textTransform: 'none',
                      flexGrow: 1,
                      minWidth: 0,
                      px: 0.5,
                      py: 0,
                      color: 'text.primary',
                    }}>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ textAlign: 'left' }}>
                      {palette.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.5 }}>
                      {palette.colors.length}
                    </Typography>
                  </Button>
                  <IconButton
                    size="small"
                    aria-label={`Delete ${palette.name}`}
                    onClick={(): void => void deleteSavedPalette(palette.id)}
                    sx={{ p: 0.25 }}>
                    <DeleteIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Stack>
              ))}
            </Box>
          )}

          <Button
            fullWidth
            size="small"
            variant="text"
            color="error"
            disabled={!activeDocument}
            startIcon={<DeleteIcon fontSize="small" />}
            onClick={(): void => {
              if (activeDocument) void deleteDocument(activeDocument.id);
            }}>
            Delete sprite
          </Button>
        </Box>
      </Box>

      {activeDocument && chatOpen && (
        <Box
          sx={{
            width: isNarrow ? '100%' : 360,
            flexGrow: canvasHidden ? 1 : 0,
            flexShrink: 0,
            borderLeft: isNarrow ? 0 : 1,
            borderTop: isNarrow ? 1 : 0,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}>
          <SpriteChat
            key={activeDocument.id}
            sprite={activeDocument}
            onClose={(): void => setChatOpen(false)}
          />
        </Box>
      )}

      {/* Clear canvas dialog */}
      <Dialog
        open={clearOpen}
        onClose={(): void => setClearOpen(false)}
        maxWidth="xs"
        fullWidth>
        <DialogTitle>Clear canvas?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every pixel in {activeDocument?.name ?? 'this sprite'} will be erased. It is a single undo step, so Ctrl+Z
            brings it back.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setClearOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleClearAll}>
            Clear
          </Button>
        </DialogActions>
      </Dialog>

      {/* New sprite dialog */}
      <Dialog
        open={createOpen}
        onClose={(): void => setCreateOpen(false)}
        maxWidth="xs"
        fullWidth>
        <DialogTitle>New sprite</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Size is fixed at creation. Max {MAX_CANVAS_SIZE}×{MAX_CANVAS_SIZE}.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={newName}
              onChange={(event): void => setNewName(event.target.value)}
              fullWidth
            />
            <Stack
              direction="row"
              spacing={2}>
              <TextField
                label="Width"
                type="number"
                value={newWidth}
                onChange={(event): void => setNewWidth(event.target.value)}
                inputProps={{ min: 1, max: MAX_CANVAS_SIZE }}
                fullWidth
              />
              <TextField
                label="Height"
                type="number"
                value={newHeight}
                onChange={(event): void => setNewHeight(event.target.value)}
                inputProps={{ min: 1, max: MAX_CANVAS_SIZE }}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={(): void => void handleCreate()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Palette import dialog */}
      <Dialog
        open={paletteOpen}
        onClose={(): void => setPaletteOpen(false)}
        maxWidth="sm"
        fullWidth>
        <DialogTitle>Import palette</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Paste a Krita or GIMP <code>.gpl</code> file. Colours outside the new palette are cleared.
          </DialogContentText>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={paletteText}
            onChange={(event): void => setPaletteText(event.target.value)}
            placeholder={'GIMP Palette\nName: My palette\n#\n13 11 18 void\n31 27 46 shadow'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={(): void => setPaletteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={(): void => void handleImportPalette()}>
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PixelArt;
