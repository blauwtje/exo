import { migrate } from '../../db/migrate.mjs';
import { readDatabase, writeDatabase } from '../../db/store.mjs';

export async function run({ dbPath }) {
  const db = readDatabase(dbPath);
  const ran = await migrate(db);
  writeDatabase(dbPath, db);
  console.log(ran.length === 0 ? 'Database is up to date.' : `Applied ${ran.length} migration(s): ${ran.join(', ')}`);
}
