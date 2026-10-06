import { sumLines } from '../util/money.mjs';

export function buildInvoice({ sequence, account, lines, issuedAt, dueDate, notes }) {
  return {
    id: `inv_${sequence}`,
    number: `${issuedAt.slice(0, 4)}-${String(sequence).padStart(4, '0')}`,
    accountId: account.id,
    status: 'open',
    issuedAt,
    dueDate,
    lines,
    totalMinor: sumLines(lines),
    notes: notes ?? null,
    externalRef: null,
  };
}
