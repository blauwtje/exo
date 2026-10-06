import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../lib/csv.mjs';

// Customer id to { id, name, timezone, currency, plan }.
export function loadCustomers(dataDir) {
  const text = fs.readFileSync(path.join(dataDir, 'customers.csv'), 'utf8');
  return new Map(parseCsv(text).map((row) => [row.id, {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    currency: row.currency,
    plan: row.plan
  }]));
}
