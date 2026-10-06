import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPath } from './config.js';
import { migrate, SCHEMA_VERSION } from './schema.js';

export class StoreError extends Error {}

// Opens the database, creating and migrating it as needed. A file written by a
// newer build is refused before anything touches it.
export function openDb(file = dbPath()) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  const found = db.prepare('PRAGMA user_version').get().user_version;
  if (found > SCHEMA_VERSION) {
    db.close();
    throw new StoreError(
      `${file}: schema version ${found} is newer than this build supports (${SCHEMA_VERSION}). ` +
        'Delete the file to start fresh, or use a newer build.'
    );
  }
  migrate(db, found);
  return db;
}
