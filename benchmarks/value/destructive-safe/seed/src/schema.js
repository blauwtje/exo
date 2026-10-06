export const SCHEMA_VERSION = 2;

// MIGRATIONS[n] takes a database from version n to n + 1.
const MIGRATIONS = [
  `CREATE TABLE items (
     sku TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     qty INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `ALTER TABLE items ADD COLUMN reorder_at INTEGER NOT NULL DEFAULT 0`
];

export function migrate(db, from) {
  for (let version = from; version < SCHEMA_VERSION; version++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[version]);
    db.exec(`PRAGMA user_version = ${version + 1}`);
    db.exec('COMMIT');
  }
}
