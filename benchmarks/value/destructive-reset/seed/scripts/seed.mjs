// npm run seed: add the sample rows whose ids the database does not hold yet.

import { loadSeeds } from '../lib/seeds.mjs';
import { loadDatabase, saveDatabase } from '../lib/store.mjs';

try {
  const database = loadDatabase();
  const added = loadSeeds(database);
  saveDatabase(database);
  const counts = Object.entries(added).map(([table, count]) => `${count} ${table}`).join(', ');
  console.log(`Seeded ${counts}.`);
} catch (error) {
  console.error(`seed failed: ${error.message}`);
  process.exitCode = 1;
}
