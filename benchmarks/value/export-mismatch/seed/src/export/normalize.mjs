import { convertMinor } from '../lib/money.mjs';
import { rateFor } from '../model/fx.mjs';

// Adds amountEur: the row's amount at the rate of the day it was booked.
export function normalize(rows, { rates }) {
  return rows.map((row) => {
    const bookedOn = row.bookedAt.slice(0, 10);
    const rate = rateFor(rates, row.currency, bookedOn);
    return { ...row, bookedOn, amountEur: convertMinor(row.amountMinor, rate) };
  });
}
