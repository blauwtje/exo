import type { Category } from './catalog.ts';
import { divideHalfEven, type Cents } from './money.ts';

export type Region = 'NL' | 'DE' | 'BE';

type RateTable = Readonly<Record<Category, number>>;

// Value-added tax rates in basis points (2100 = 21%), per region as a list of
// periods sorted by the ISO date each takes effect on.
const PERIODS: Readonly<Record<Region, readonly { readonly from: string; readonly rates: RateTable }[]>> = {
  NL: [
    { from: '0000-01-01', rates: { standard: 2100, reduced: 600, zero: 0 } },
    { from: '2019-01-01', rates: { standard: 2100, reduced: 900, zero: 0 } }
  ],
  DE: [
    { from: '0000-01-01', rates: { standard: 1900, reduced: 700, zero: 0 } },
    { from: '2020-07-01', rates: { standard: 1600, reduced: 500, zero: 0 } },
    { from: '2021-01-01', rates: { standard: 1900, reduced: 700, zero: 0 } }
  ],
  BE: [{ from: '0000-01-01', rates: { standard: 2100, reduced: 600, zero: 0 } }]
};

// The rate in force on an ISO date: the last period starting on or before it.
export function taxRate(region: Region, category: Category, onDate: string): number {
  const period = PERIODS[region].findLast((candidate) => candidate.from <= onDate);
  if (period === undefined) throw new RangeError(`no ${region} tax rate on ${onDate}`);
  return period.rates[category];
}

export function computeTax(amountCents: Cents, region: Region, category: Category, onDate: string): Cents {
  return divideHalfEven(amountCents * taxRate(region, category, onDate), 10_000);
}
