import { clampRect, rectFromPoints } from '../selection';

describe('rectFromPoints', () => {
  it('normalises a drag in any direction', () => {
    expect(rectFromPoints({ x: 2, y: 3 }, { x: 5, y: 7 })).toEqual({ x: 2, y: 3, width: 4, height: 5 });
    expect(rectFromPoints({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 3, width: 4, height: 5 });
    expect(rectFromPoints({ x: 5, y: 3 }, { x: 2, y: 7 })).toEqual({ x: 2, y: 3, width: 4, height: 5 });
  });

  it('treats a click without movement as a single pixel', () => {
    expect(rectFromPoints({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ x: 4, y: 4, width: 1, height: 1 });
  });

  it('covers a single row or column', () => {
    expect(rectFromPoints({ x: 0, y: 2 }, { x: 3, y: 2 })).toEqual({ x: 0, y: 2, width: 4, height: 1 });
    expect(rectFromPoints({ x: 2, y: 0 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 0, width: 1, height: 4 });
  });
});

describe('clampRect', () => {
  it('pulls a rect inside the canvas', () => {
    expect(clampRect({ x: -3, y: 2, width: 4, height: 4 }, 8, 8)).toEqual({
      x: 0,
      y: 2,
      width: 1,
      height: 4,
    });
  });

  it('trims a rect that runs off the far edge', () => {
    expect(clampRect({ x: 6, y: 6, width: 10, height: 10 }, 8, 8)).toEqual({
      x: 6,
      y: 6,
      width: 2,
      height: 2,
    });
  });

  it('never returns an empty rect', () => {
    const clamped = clampRect({ x: 20, y: 20, width: 0, height: 0 }, 8, 8);
    expect(clamped.width).toBe(1);
    expect(clamped.height).toBe(1);
  });
});
