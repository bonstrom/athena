import { MAX_OPS_PER_BATCH, parseOps } from '../parse';

describe('parseOps', () => {
  it('parses every supported operation', () => {
    const { ops, errors } = parseOps([
      { type: 'set_pixels', points: [[1, 2], [3, 4]], color: 5 },
      { type: 'fill_rect', x: 0, y: 0, width: 2, height: 2, color: 1 },
      { type: 'line', x0: 0, y0: 0, x1: 3, y1: 3, color: 2 },
      { type: 'flood_fill', x: 1, y: 1, color: 3 },
      { type: 'replace_color', from: 1, to: 2 },
      { type: 'stamp', x: 0, y: 0, mode: 'overlay', rows: ['..1', '.11'] },
      { type: 'stamp', x: 0, y: 0, mode: 'replace', rows: [[0, 1], [2, 3]] },
      { type: 'clear_rect', x: 0, y: 0, width: 1, height: 1 },
      { type: 'flip', axis: 'vertical' },
      { type: 'shift', dx: -1, dy: 2 },
    ]);
    expect(errors).toEqual([]);
    expect(ops).toHaveLength(10);
    expect(ops[0]).toEqual({ type: 'set_pixels', points: [[1, 2], [3, 4]], color: 5 });
    expect(ops[8]).toEqual({ type: 'flip', axis: 'vertical' });
  });

  it('allows -1 as the erase colour', () => {
    const { ops, errors } = parseOps([{ type: 'set_pixels', points: [[0, 0]], color: -1 }]);
    expect(errors).toEqual([]);
    expect(ops).toHaveLength(1);
  });

  it('reports every invalid operation at once', () => {
    const { ops, errors } = parseOps([
      { type: 'nope' },
      { type: 'set_pixels', points: [[0, 'x']], color: 1 },
      { type: 'fill_rect', x: 0.5, y: 0, width: 1, height: 1, color: 1 },
    ]);
    expect(ops).toEqual([]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('unknown operation type');
    expect(errors[1]).toContain('whole numbers');
    expect(errors[2]).toContain('whole number');
  });

  it('rejects non-arrays, empty batches and oversized batches', () => {
    expect(parseOps({}).errors[0]).toContain('must be an array');
    expect(parseOps([]).errors[0]).toContain('must not be empty');
    const many = Array.from({ length: MAX_OPS_PER_BATCH + 1 }, () => ({ type: 'flip', axis: 'horizontal' }));
    expect(parseOps(many).errors[0]).toContain('at most');
  });

  it('rejects mixed, malformed or under-specified stamp rows', () => {
    const mixed = parseOps([{ type: 'stamp', x: 0, y: 0, mode: 'replace', rows: ['..', [1, 2]] }]);
    expect(mixed.errors).toHaveLength(1);

    const malformed = parseOps([{ type: 'stamp', x: 0, y: 0, mode: 'replace', rows: [[1, 'a']] }]);
    expect(malformed.errors[0]).toContain('palette indices');

    const noMode = parseOps([{ type: 'stamp', x: 0, y: 0, rows: ['..'] }]);
    expect(noMode.errors[0]).toContain('mode');
  });

  it('rejects a colour below the erase sentinel', () => {
    expect(parseOps([{ type: 'set_pixels', points: [[0, 0]], color: -5 }]).errors[0]).toContain('palette index');
  });

  it('rejects operations that are not objects', () => {
    expect(parseOps([42]).errors[0]).toContain('must be an object');
  });
});
