import { PixelRect } from './types';

export interface CanvasPoint {
  x: number;
  y: number;
}

/**
 * Normalise two drag points into an inclusive pixel rectangle.
 *
 * Dragging in any direction yields a positive-size rect, and a click without
 * movement yields a 1x1 rect (the caller decides whether that means "clear").
 */
export function rectFromPoints(a: CanvasPoint, b: CanvasPoint): PixelRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}

/** Clamp a rect to the canvas bounds, keeping at least one pixel. */
export function clampRect(rect: PixelRect, width: number, height: number): PixelRect {
  // Clamp both edges, not origin-then-size: a rect starting off-canvas must lose
  // the part that was outside rather than keep its full width.
  const left = Math.max(0, Math.min(width - 1, Math.floor(rect.x)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(rect.y)));
  const right = Math.max(left + 1, Math.min(width, Math.floor(rect.x + rect.width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.floor(rect.y + rect.height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
