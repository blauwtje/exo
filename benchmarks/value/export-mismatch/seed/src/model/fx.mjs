import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../lib/csv.mjs';

export const REPORTING_CURRENCY = 'EUR';

// "USD:2026-03-05" to the EUR value of one USD that day.
export function loadRates(dataDir, month) {
  const text = fs.readFileSync(path.join(dataDir, 'fx', `${month}.csv`), 'utf8');
  return new Map(parseCsv(text).map((row) => [`${row.currency}:${row.date}`, Number(row.rate)]));
}

export function rateFor(rates, currency, date) {
  if (currency === REPORTING_CURRENCY) return 1;
  const rate = rates.get(`${currency}:${date}`);
  if (rate === undefined) throw new Error(`no ${currency} rate for ${date}`);
  return rate;
}
