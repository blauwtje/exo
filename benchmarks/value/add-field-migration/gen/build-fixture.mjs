// Writes hidden/check-data/v9.json (a production-like database at migration 9)
// and expected.json from the seed's own migrations. Usage: node gen/build-fixture.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from '../seed/src/db/migrate.mjs';
import { emptyDatabase, nextId, nextSequence } from '../seed/src/db/store.mjs';

const out = (name) => fileURLToPath(new URL(`../hidden/check-data/${name}`, import.meta.url));
const db = emptyDatabase();
await migrate(db, { now: () => '2026-01-02T08:00:00.000Z' });

db.orgs.push({ id: 'org_nord', name: 'Nordlys Holding', defaultCurrency: 'SEK', timezone: 'Europe/Stockholm' });
const accounts = [
  ['org_default', 'Northwind Traders', 'ap@northwind.example', { currency: 'USD' }],
  ['org_default', 'Brandt Maschinenbau GmbH', 'rechnung@brandt.example', {}],
  ['org_nord', 'Lindqvist & Soner AB', 'ekonomi@lindqvist.example', {}],
  ['org_default', 'Harbour Lane Cafe', 'owner@harbourlane.example', { currency: 'gbp' }],
  ['org_default', 'Tidewater Supply', 'accounts@tidewater.example', { currency: '' }],
  ['org_nord', 'Aurora Studios', 'billing@aurora.example', { currency: 'NOK' }],
];
for (const [orgId, name, billingEmail, extra] of accounts) {
  db.accounts.push({ id: nextId(db, 'account'), orgId, name, billingEmail, ...extra });
}

const rows = [
  // account, issuedAt, status, lines, notes, externalRef
  ['acc_2', '2025-11-03', 'paid', [['Platform licence', 1, 480000]], 'renewal', 'crm-1001'],
  ['acc_2', '2025-12-03', 'paid', [['Platform licence', 1, 480000], ['Onboarding day', 2, 95000]], null, 'crm-1002'],
  ['acc_3', '2025-11-20', 'paid', [['Spare parts kit', 3, 21450]], null, null],
  ['acc_3', '2026-01-15', 'open', [['Maintenance visit', 1, 89000]], 'ask for PO number', 'crm-1010'],
  ['acc_4', '2025-12-18', 'paid', [['Consulting', 12, 14500]], null, 'crm-1020'],
  ['acc_4', '2026-02-01', 'open', [['Consulting', 8, 14500], ['Travel', 1, 31200]], null, null],
  ['acc_5', '2026-01-09', 'paid', [['Espresso machine service', 1, 18000]], 'cash discount agreed', null],
  ['acc_5', '2026-02-09', 'open', [['Grinder burrs', 2, 6400]], null, 'crm-1031'],
  ['acc_6', '2025-12-30', 'void', [['Cold storage rental', 4, 22500]], 'duplicate of next', null],
  ['acc_6', '2025-12-30', 'paid', [['Cold storage rental', 4, 22500]], null, 'crm-1040'],
  ['acc_7', '2026-01-28', 'open', [['Studio hours', 20, 7500]], null, null],
  ['acc_7', '2026-02-12', 'open', [['Studio hours', 6, 7500], ['Equipment hire', 1, 25000]], 'split over two projects', 'crm-1052'],
];
for (const [accountId, issuedAt, status, lines, notes, externalRef] of rows) {
  const sequence = nextSequence(db, 'invoice');
  const dated = new Date(`${issuedAt}T00:00:00Z`);
  dated.setUTCDate(dated.getUTCDate() + 30);
  const parts = lines.map(([description, quantity, unitPriceMinor]) => ({ description, quantity, unitPriceMinor }));
  db.invoices.push({
    id: `inv_${sequence}`,
    number: `${issuedAt.slice(0, 4)}-${String(sequence).padStart(4, '0')}`,
    accountId,
    status,
    issuedAt,
    dueDate: dated.toISOString().slice(0, 10),
    lines: parts,
    totalMinor: parts.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0),
    notes,
    externalRef,
  });
}

const currencies = { acc_1: 'EUR', acc_2: 'USD', acc_3: 'EUR', acc_4: 'SEK', acc_5: 'GBP', acc_6: 'EUR', acc_7: 'NOK' };
const expected = {
  invoices: Object.fromEntries(db.invoices.map((invoice) => [invoice.id, currencies[invoice.accountId]])),
  accounts: currencies,
};
fs.writeFileSync(out('v9.json'), `${JSON.stringify(db, null, 2)}\n`);
fs.writeFileSync(out('expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
console.log(`${db.accounts.length} accounts, ${db.invoices.length} invoices, ${db.migrations.length} migrations`);
