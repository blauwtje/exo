import type { Category } from './catalog.ts';
import { divideHalfEven, type Cents } from './money.ts';

export type Region = 'NL' | 'DE' | 'BE';

// Value-added tax rates in basis points (2100 = 21%).
const RATES: Readonly<Record<Region, Readonly<Record<Category, number>>>> = {
  NL: { standard: 2100, reduced: 900, zero: 0 },
  DE: { standard: 1900, reduced: 700, zero: 0 },
  BE: { standard: 2100, reduced: 600, zero: 0 }
};

export function taxRate(region: Region, category: Category): number {
  return RATES[region][category];
}

export function computeTax(amountCents: Cents, region: Region, category: Category): Cents {
  return divideHalfEven(amountCents * taxRate(region, category), 10_000);
}
