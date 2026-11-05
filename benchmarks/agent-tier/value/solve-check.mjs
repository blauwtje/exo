import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.argv[2] ?? '.');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST')));
const CASE_MS = 10_000;

const load = (file) => import(pathToFileURL(path.join(repo, file)).href);

function npmTest() {
  const result = spawnSync('npm', ['test', '--silent'], { cwd: repo, env, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(`npm test exited ${result.status}`);
}

function withDeadline(work) {
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no result in ${CASE_MS} ms`)), CASE_MS); });
  return Promise.race([Promise.resolve().then(work), expired]).finally(() => clearTimeout(timer));
}

async function readCases() {
  try {
    return (await load('check-data/cases.mjs')).cases;
  } catch (error) {
    return [{ name: 'hidden cases load', run: () => { throw error; } }];
  }
}

const cases = [...(await readCases()), { name: 'npm test passes', run: npmTest }];
const detail = [];
for (const { name, run } of cases) {
  try {
    await withDeadline(() => run({ repo, load, env }));
  } catch (error) {
    detail.push(`${name}: ${String(error?.message ?? error).slice(0, 300)}`);
  }
}
console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: cases.length, detail }));
process.exit(0);
