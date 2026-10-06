import { pathToFileURL } from 'node:url';
import { checksumOf, listMigrations, MIGRATIONS_DIR } from './migration-files.mjs';

export async function migrate(db, { dir = MIGRATIONS_DIR, now = () => new Date().toISOString() } = {}) {
  const recorded = new Map(db.migrations.map((record) => [record.name, record]));
  const ran = [];
  for (const { name, file } of listMigrations(dir)) {
    const checksum = checksumOf(file);
    const record = recorded.get(name);
    if (record) {
      if (record.checksum !== checksum) {
        throw new Error(`Migration ${name} changed after it was applied`);
      }
      continue;
    }
    const migration = await import(pathToFileURL(file).href);
    await migration.up(db);
    db.migrations.push({ name, checksum, appliedAt: now() });
    ran.push(name);
  }
  return ran;
}
