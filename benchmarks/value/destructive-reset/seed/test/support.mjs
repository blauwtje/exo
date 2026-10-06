// Every test builds its own database in memory from the real migrations and seeds.

import { migrate } from '../lib/migrations.mjs';
import { loadSeeds } from '../lib/seeds.mjs';
import { emptyDatabase } from '../lib/store.mjs';

export async function freshDatabase() {
  const database = emptyDatabase();
  await migrate(database);
  loadSeeds(database);
  return database;
}
