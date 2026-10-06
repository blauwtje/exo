// Migration files, their checksums and the runner behind `npm run migrate`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './store.mjs';
import { addColumn, createTable, getTable } from './tables.mjs';

export const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

export function checksum(source) {
  return crypto.createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

export function listMigrations(directory = MIGRATIONS_DIR) {
  return fs.readdirSync(directory)
    .filter((file) => /^\d{3}_.+\.mjs$/.test(file))
    .sort()
    .map((file) => ({
      name: file.replace(/\.mjs$/, ''),
      file: path.join(directory, file),
      checksum: checksum(fs.readFileSync(path.join(directory, file), 'utf8'))
    }));
}

// Every migration the database recorded must still match the file it ran from.
export function verifyApplied(database, migrations) {
  for (const applied of database.migrations) {
    const current = migrations.find((migration) => migration.name === applied.name);
    if (!current) throw new Error(`Migration ${applied.name} was applied but its file is gone.`);
    if (current.checksum !== applied.checksum) {
      throw new Error(`Migration ${applied.name} changed after it was applied (checksum mismatch). Run \`npm run db:reset\` to rebuild the local database from seeds.`);
    }
  }
}

function contextFor(database) {
  return {
    tables: database.tables,
    table: (name) => getTable(database, name),
    createTable: (name, columns) => createTable(database, name, columns),
    addColumn: (table, column, options) => addColumn(database, table, column, options)
  };
}

export async function migrate(database, directory = MIGRATIONS_DIR, now = () => new Date().toISOString()) {
  const migrations = listMigrations(directory);
  verifyApplied(database, migrations);
  const done = new Set(database.migrations.map((migration) => migration.name));
  const applied = [];
  for (const migration of migrations) {
    if (done.has(migration.name)) continue;
    const { up } = await import(pathToFileURL(migration.file).href);
    await up(contextFor(database));
    database.migrations.push({ name: migration.name, checksum: migration.checksum, appliedAt: now() });
    applied.push(migration.name);
  }
  return applied;
}
