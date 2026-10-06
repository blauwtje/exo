import fs from 'node:fs';
import path from 'node:path';

const ID_PREFIX = { invoice: 'inv', account: 'acc' };

export function emptyDatabase() {
  return { migrations: [], meta: { sequences: {} }, orgs: [], accounts: [], invoices: [] };
}

export function readDatabase(file) {
  if (!fs.existsSync(file)) return emptyDatabase();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeDatabase(file, db) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const scratch = `${file}.tmp`;
  fs.writeFileSync(scratch, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(scratch, file);
}

export function withDatabase(file, change) {
  const db = readDatabase(file);
  const result = change(db);
  writeDatabase(file, db);
  return result;
}

export function nextSequence(db, kind) {
  const next = (db.meta.sequences[kind] ?? 0) + 1;
  db.meta.sequences[kind] = next;
  return next;
}

export function nextId(db, kind) {
  return `${ID_PREFIX[kind]}_${nextSequence(db, kind)}`;
}
