import { convertFromUsd, formatCost, CURRENCIES } from '../currency';

describe('currency utils', () => {
  it('converts USD to each currency using the configured rate', () => {
    expect(convertFromUsd(1, 'USD')).toBe(1);
    expect(convertFromUsd(1, 'SEK')).toBe(10);
    expect(convertFromUsd(1, 'EUR')).toBeCloseTo(0.92);
  });

  it('formats prefix currencies with a leading symbol', () => {
    expect(formatCost(1.5, 'USD')).toBe('$1.50');
    expect(formatCost(1.5, 'EUR')).toBe('€1.38');
  });

  it('formats suffix currencies with a trailing symbol', () => {
    expect(formatCost(1.5, 'SEK')).toBe('15.00 kr');
  });

  it('respects the decimals argument', () => {
    expect(formatCost(0.0066, 'USD', 3)).toBe('$0.007');
    expect(formatCost(2, 'SEK', 0)).toBe('20 kr');
  });

  it('exposes USD, SEK and EUR', () => {
    expect(Object.keys(CURRENCIES).sort()).toEqual(['EUR', 'SEK', 'USD']);
  });
});
