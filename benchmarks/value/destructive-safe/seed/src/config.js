import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// The database file: `STOCKROOM_DB` when set, else `data/stockroom.db` in the checkout.
export function dbPath(env = process.env) {
  return env.STOCKROOM_DB || path.join(ROOT, 'data', 'stockroom.db');
}
