// npm run db:reset: rebuild the database file from the migrations and the seed rows.

import fs from 'node:fs';
import path from 'node:path';
import { migrate } from '../lib/migrations.mjs';
import { loadSeeds } from '../lib/seeds.mjs';
import { databaseFile, emptyDatabase, saveDatabase } from '../lib/store.mjs';

const file = databaseFile();
fs.rmSync(file, { force: true });

const database = emptyDatabase();
const applied = await migrate(database);
const added = loadSeeds(database);
saveDatabase(database, file);

const counts = Object.entries(added).map(([table, count]) => `${count} ${table}`).join(', ');
console.log(`Rebuilt ${path.relative(process.cwd(), file)}: ${applied.length} migrations, ${counts}.`);
