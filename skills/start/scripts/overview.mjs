import fs from 'node:fs';
import path from 'node:path';
import { buildOverview, OVERVIEW_PATH, readSkills } from '../../../lib/skill-overview.mjs';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const output = buildOverview(readSkills(path.join(root, 'skills')));

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, OVERVIEW_PATH), output);
} else {
  process.stdout.write(output);
}
