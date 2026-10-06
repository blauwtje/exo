// Sample rows from seeds/<table>.json, inserted in dependency order.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './store.mjs';
import { findRow, insertRow } from './tables.mjs';

export const SEEDS_DIR = path.join(ROOT, 'seeds');
const TABLE_ORDER = ['customers', 'products', 'orders'];

// Rows whose id the table already holds are left alone, so seeding twice adds nothing.
export function loadSeeds(database, directory = SEEDS_DIR) {
  const added = {};
  for (const name of TABLE_ORDER) {
    const file = path.join(directory, `${name}.json`);
    if (!fs.existsSync(file)) continue;
    added[name] = 0;
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      if (findRow(database, name, row.id)) continue;
      insertRow(database, name, row);
      added[name] += 1;
    }
  }
  return added;
}
