import { nextId, nextSequence } from '../store.mjs';

export const description = 'a sample customer and invoice for a new installation';

export function up(db) {
  const accountId = nextId(db, 'account');
  db.accounts.push({
    id: accountId,
    orgId: 'org_default',
    name: 'Sample Customer',
    billingEmail: 'billing@sample.example',
  });
  const sequence = nextSequence(db, 'invoice');
  db.invoices.push({
    id: `inv_${sequence}`,
    number: `2026-${String(sequence).padStart(4, '0')}`,
    accountId,
    status: 'open',
    issuedAt: '2026-01-02',
    amountMinor: 12500,
    description: 'Welcome package',
  });
}
