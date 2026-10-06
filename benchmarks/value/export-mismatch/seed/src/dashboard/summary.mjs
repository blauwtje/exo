import { loadMonth } from '../ingest/index.mjs';
import { localDate } from '../lib/dates.mjs';
import { convertMinor, formatMinor } from '../lib/money.mjs';
import { loadCustomers } from '../model/customers.mjs';
import { loadRates, rateFor, REPORTING_CURRENCY } from '../model/fx.mjs';

// Per-customer totals for a month, straight from the sources: each settled row
// counts once per source and id, at the rate of the day it was booked in the
// customer's own time zone.
export function monthSummary({ dataDir, month }) {
  const customers = loadCustomers(dataDir);
  const rates = loadRates(dataDir, month);
  const seen = new Set();
  const entries = new Map();
  for (const row of loadMonth(dataDir, month)) {
    if (row.status !== 'settled') continue;
    const key = `${row.source}/${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const customer = customers.get(row.customerId);
    if (!customer) throw new Error(`unknown customer ${row.customerId} in ${row.source} row ${row.id}`);
    const day = localDate(row.bookedAt, customer.timezone);
    const entry = entries.get(customer.id) ?? {
      id: customer.id,
      name: customer.name,
      currency: customer.currency,
      transactions: 0,
      totalMinor: 0
    };
    entry.transactions += 1;
    entry.totalMinor += convertMinor(row.amountMinor, rateFor(rates, row.currency, day));
    entries.set(customer.id, entry);
  }
  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function renderSummary(entries) {
  const width = Math.max(0, ...entries.map((entry) => entry.name.length));
  const lines = entries.map((entry) => {
    const total = `${REPORTING_CURRENCY} ${formatMinor(entry.totalMinor, { grouping: true })}`;
    return `${entry.id}  ${entry.name.padEnd(width)}  ${total.padStart(18)}  ${entry.transactions} transactions`;
  });
  const grand = entries.reduce((sum, entry) => sum + entry.totalMinor, 0);
  return [...lines, `${' '.repeat(width + 4)}total ${REPORTING_CURRENCY} ${formatMinor(grand, { grouping: true })}`].join('\n');
}
