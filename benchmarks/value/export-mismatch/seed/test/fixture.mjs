import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const line = (event) => JSON.stringify(event);

// A two-customer month: one EUR account in Berlin, one USD account in New York.
export const MINI = {
  'customers.csv': [
    'id,name,timezone,currency,plan',
    'C001,Alder Works,Europe/Berlin,EUR,standard',
    'C002,Birch Supply,America/New_York,USD,enterprise',
    ''
  ].join('\n'),
  'fx/2026-03.csv': [
    'date,currency,rate',
    '2026-03-04,USD,0.9100',
    '2026-03-05,USD,0.9200',
    '2026-03-06,USD,0.9300',
    ''
  ].join('\n'),
  'sources/cardsvc/2026-03.jsonl': [
    line({ id: 1001, account: 'C002', type: 'charge', amount: 10000, currency: 'USD', status: 'succeeded', created: '2026-03-05T15:00:00Z' }),
    line({ id: 1002, account: 'C001', type: 'charge', amount: 5000, currency: 'EUR', status: 'succeeded', created: '2026-03-04T09:00:00Z' }),
    line({ id: 1002, account: 'C001', type: 'charge', amount: 5000, currency: 'EUR', status: 'succeeded', created: '2026-03-04T09:00:00Z' }),
    line({ id: 1003, account: 'C002', type: 'charge', amount: 2000, currency: 'USD', status: 'failed', created: '2026-03-05T16:00:00Z' }),
    ''
  ].join('\n'),
  'sources/ledger/2026-03.csv': [
    'entry_id,customer_ref,entry_type,amount,currency,state,booked_at',
    '2001,C001,invoice,120.00,EUR,posted,2026-03-06T10:00:00Z',
    '2002,C002,invoice,80.00,USD,draft,2026-03-06T12:00:00Z',
    '2003,C002,invoice,200.00,USD,posted,2026-03-06T14:00:00Z',
    ''
  ].join('\n')
};

// Writes a data folder under the temp directory and returns its path.
export function writeData(files = MINI) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}
