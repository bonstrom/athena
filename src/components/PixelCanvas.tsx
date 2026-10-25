import { JSX, useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { PixelDocument, PixelOp, PixelRect, TRANSPARENT } from '../pixel/types';
import { activeLayerOf, linePoints } from '../pixel/ops';
import { compositePixels, toRgba } from '../pixel/serialize';
import { CanvasPoint, rectFromPoints } from '../pixel/selection';

export type PixelTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select';

interface Marquee {
  anchor: CanvasPoint;
  current: CanvasPoint;
  moved: boolean;
}

export interface PixelCanvasProps {
  sprite: PixelDocument;
  zoom: number;
  tool: PixelTool;
  colorIndex: number;
  /** When false, painting is ignored (e.g. no active colour). Selection still works. */
  canPaint?: boolean;
  selection: PixelRect | null;
  onSelectionChange: (rect: PixelRect | null) => void;
  onApply: (ops: PixelOp[]) => void;
  onPickColor: (index: number) => void;
}

const CHECKER_MIN_SIZE = 4;

/** Two-tone checker tile used behind transparent pixels. */
function createCheckerPattern(context: CanvasRenderingContext2D, size: number): CanvasPattern | null {
  const tile = globalThis.document.createElement('canvas');
  tile.width = size * 2;
  tile.height = size * 2;
  const tileContext = tile.getContext('2d');
  if (!tileContext) return null;

  tileContext.fillStyle = '#2b2b31';
  tileContext.fillRect(0, 0, size * 2, size * 2);
  tileContext.fillStyle = '#232329';
  tileContext.fillRect(0, 0, size, size);
  tileContext.fillRect(size, size, size, size);

  return context.createPattern(tile, 'repeat');
}

function clampedCoord(value: number, limit: number): number {
  return Math.max(0, Math.min(limit - 1, value));
}

function draftKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Nearest-neighbour canvas. Pixels are committed in one batch per stroke so a
 * drag becomes a single undo step and a single revision bump.
 */
export const PixelCanvas = ({
  sprite,
  zoom,
  tool,
  colorIndex,
  canPaint = true,
  selection,
  onSelectionChange,
  onApply,
  onPickColor,
}: PixelCanvasProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftRef = useRef<Map<string, number>>(new Map());
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeColorRef = useRef(colorIndex);
  const marqueeRef = useRef<Marquee | null>(null);

  const draw = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height } = sprite;
    const layer = activeLayerOf(sprite);
    const basePixels = layer ? layer.pixels : compositePixels(sprite);

    let pixels = basePixels;
    if (draftRef.current.size > 0) {
      pixels = [...basePixels];
      for (const [key, value] of draftRef.current) {
        const [x, y] = key.split(',').map(Number);
        pixels[y * width + x] = value;
      }
    }

    const source = globalThis.document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) return;
    sourceContext.putImageData(new ImageData(toRgba(pixels, sprite.palette), width, height), 0, 0);

    canvas.width = width * zoom;
    canvas.height = height * zoom;

    // Checkerboard so transparency is legible instead of looking like black.
    // Tiled by pattern rather than per-cell fillRect: at 32x a 64x64 sprite is
    // 2048px wide, where a cell loop would mean ~16k draw calls per redraw.
    const checkerSize = Math.max(CHECKER_MIN_SIZE, Math.round(zoom / 2));
    const checker = createCheckerPattern(context, checkerSize);
    if (checker) {
      context.fillStyle = checker;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Assigning width/height resets context state, so set this afterwards.
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    if (zoom >= 8) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x <= width; x += 1) {
        const position = x * zoom + 0.5;
        context.moveTo(position, 0);
        context.lineTo(position, canvas.height);
      }
      for (let y = 0; y <= height; y += 1) {
        const position = y * zoom + 0.5;
        context.moveTo(0, position);
        context.lineTo(canvas.width, position);
      }
      context.stroke();
    }

    // Selection overlay: a marquee in progress wins over the committed one.
    const marquee = marqueeRef.current;
    const activeSelection = marquee ? rectFromPoints(marquee.anchor, marquee.current) : selection;
    if (activeSelection) {
      const x = activeSelection.x * zoom + 0.5;
      const y = activeSelection.y * zoom + 0.5;
      const width = activeSelection.width * zoom - 1;
      const height = activeSelection.height * zoom - 1;
      context.save();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      context.setLineDash([]);
      context.strokeRect(x, y, width, height);
      context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      context.setLineDash([4, 4]);
      context.strokeRect(x, y, width, height);
      context.restore();
    }
  }, [sprite, zoom, selection]);

  useEffect((): void => {
    draw();
  }, [draw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const relativeX = rect.width === 0 ? 0 : ((event.clientX - rect.left) / rect.width) * sprite.width;
    const relativeY = rect.height === 0 ? 0 : ((event.clientY - rect.top) / rect.height) * sprite.height;
    return {
      x: clampedCoord(Math.floor(relativeX), sprite.width),
      y: clampedCoord(Math.floor(relativeY), sprite.height),
    };
  };

  const paint = (point: { x: number; y: number }): void => {
    const color = strokeColorRef.current;
    const previous = lastPointRef.current;
    const segment = previous
      ? linePoints(previous.x, previous.y, point.x, point.y)
      : [[point.x, point.y] as [number, number]];
    for (const [x, y] of segment) draftRef.current.set(draftKey(x, y), color);
    lastPointRef.current = point;
    draw();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);

    // Selection works even when painting is unavailable.
    if (tool === 'select') {
      event.currentTarget.setPointerCapture(event.pointerId);
      marqueeRef.current = { anchor: point, current: point, moved: false };
      draw();
      return;
    }

    if (!canPaint) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'eyedropper') {
      const layer = activeLayerOf(sprite);
      const value = layer ? layer.pixels[point.y * sprite.width + point.x] : TRANSPARENT;
      if (value !== TRANSPARENT) onPickColor(value);
      return;
    }

    if (tool === 'fill') {
      onApply([{ type: 'flood_fill', x: point.x, y: point.y, color: colorIndex }]);
      return;
    }

    strokeColorRef.current = tool === 'eraser' ? TRANSPARENT : colorIndex;
    drawingRef.current = true;
    draftRef.current = new Map();
    lastPointRef.current = null;
    paint(point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const marquee = marqueeRef.current;
    if (marquee) {
      const point = pointFromEvent(event);
      if (point.x !== marquee.anchor.x || point.y !== marquee.anchor.y) marquee.moved = true;
      marquee.current = point;
      draw();
      return;
    }
    if (!drawingRef.current) return;
    paint(pointFromEvent(event));
  };

  const finishStroke = (): void => {
    const marquee = marqueeRef.current;
    if (marquee) {
      marqueeRef.current = null;
      // A click without movement clears the selection.
      onSelectionChange(marquee.moved ? rectFromPoints(marquee.anchor, marquee.current) : null);
      draw();
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;

    const entries = [...draftRef.current.keys()];
    draftRef.current = new Map();
    // Redraw committed pixels so a rejected batch cannot leave phantom pixels
    // on screen (the store will not change, so no prop update would follow).
    draw();
    if (entries.length === 0) return;

    const points = entries.map((key): [number, number] => {
      const [x, y] = key.split(',').map(Number);
      return [x, y];
    });
    onApply([{ type: 'set_pixels', points, color: strokeColorRef.current }]);
  };

  return (
    <Box
      sx={{
        display: 'inline-block',
        lineHeight: 0,
        boxShadow: 3,
        border: 1,
        borderColor: 'divider',
        // Auto margins centre the canvas when it fits and keep the left edge
        // reachable when a 32x view overflows the scroll container.
        m: 'auto',
      }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onLostPointerCapture={finishStroke}
        aria-label={`${sprite.name} pixel canvas`}
        style={{
          display: 'block',
          touchAction: 'none',
          cursor:
            tool === 'select' ? 'crosshair' : !canPaint ? 'default' : tool === 'eyedropper' ? 'copy' : 'crosshair',
        }}
      />
    </Box>
  );
};
