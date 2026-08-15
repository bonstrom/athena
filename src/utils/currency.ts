export type CurrencyCode = 'USD' | 'SEK' | 'EUR';

interface CurrencyMeta {
  symbol: string;
  /** Units of this currency per 1 USD. */
  rate: number;
  position: 'prefix' | 'suffix';
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  USD: { symbol: '$', rate: 1, position: 'prefix' },
  SEK: { symbol: 'kr', rate: 10, position: 'suffix' },
  EUR: { symbol: '€', rate: 0.92, position: 'prefix' },
};

export function convertFromUsd(usd: number, code: CurrencyCode): number {
  return usd * CURRENCIES[code].rate;
}

export function formatCost(usd: number, code: CurrencyCode, decimals = 2): string {
  const meta = CURRENCIES[code];
  const amount = (usd * meta.rate).toFixed(decimals);
  return meta.position === 'prefix' ? `${meta.symbol}${amount}` : `${amount} ${meta.symbol}`;
}
