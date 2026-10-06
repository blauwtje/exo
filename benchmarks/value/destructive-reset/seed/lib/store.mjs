// The JSON-file database: one document holding the applied migrations and every table.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function databaseFile() {
  return process.env.ORDERDESK_DB ?? path.join(ROOT, 'data', 'dev.db.json');
}

export function emptyDatabase() {
  return { migrations: [], tables: {} };
}

export function loadDatabase(file = databaseFile()) {
  if (!fs.existsSync(file)) return emptyDatabase();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Written beside the target and renamed over it, so a crash never leaves half a document.
export function saveDatabase(database, file = databaseFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(database, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
