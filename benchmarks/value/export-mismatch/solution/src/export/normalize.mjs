import { localDate } from '../lib/dates.mjs';
import { convertMinor } from '../lib/money.mjs';
import { rateFor } from '../model/fx.mjs';

// Adds amountEur: the row's amount at the rate of the day it was booked in the
// customer's own time zone.
export function normalize(rows, { rates, customers }) {
  return rows.map((row) => {
    const customer = customers.get(row.customerId);
    if (!customer) throw new Error(`unknown customer ${row.customerId} in ${row.source} row ${row.id}`);
    const bookedOn = localDate(row.bookedAt, customer.timezone);
    const rate = rateFor(rates, row.currency, bookedOn);
    return { ...row, bookedOn, amountEur: convertMinor(row.amountMinor, rate) };
  });
}
