import { parseCsv } from '../lib/csv.mjs';
import { parseMinor } from '../lib/money.mjs';

const STATUS = { posted: 'settled', draft: 'pending', void: 'void' };

// Amounts are decimal strings in major units; credit notes are already negative.
export function parseLedger(text) {
  return parseCsv(text).map((row) => {
    if (!(row.state in STATUS)) throw new Error(`unknown ledger state: ${row.state}`);
    return {
      source: 'ledger',
      id: row.entry_id,
      customerId: row.customer_ref,
      amountMinor: parseMinor(row.amount),
      currency: row.currency,
      status: STATUS[row.state],
      bookedAt: row.booked_at
    };
  });
}
