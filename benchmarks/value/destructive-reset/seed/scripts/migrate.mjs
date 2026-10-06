// npm run migrate: apply the migrations the database has not seen yet.

import { migrate } from '../lib/migrations.mjs';
import { loadDatabase, saveDatabase } from '../lib/store.mjs';

try {
  const database = loadDatabase();
  const applied = await migrate(database);
  saveDatabase(database);
  console.log(applied.length ? `Applied ${applied.join(', ')}.` : 'Database is up to date.');
} catch (error) {
  console.error(`migrate failed: ${error.message}`);
  process.exitCode = 1;
}
