import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { npmTest, testEnvironment, withDeadline } from '../shared.mjs';

const repo = path.resolve(process.argv[2] ?? '.');

const load = (file) => import(pathToFileURL(path.join(repo, file)).href);

async function readCases() {
  try {
    return (await load('check-data/cases.mjs')).cases;
  } catch (error) {
    return [{ name: 'hidden cases load', run: () => { throw error; } }];
  }
}

const cases = [...(await readCases()), { name: 'npm test passes', run: () => npmTest(repo) }];
const detail = [];
for (const { name, run } of cases) {
  try {
    await withDeadline(() => run({ repo, load, env: testEnvironment() }));
  } catch (error) {
    detail.push(`${name}: ${String(error?.message ?? error).slice(0, 300)}`);
  }
}
console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: cases.length, detail }));
process.exit(0);
