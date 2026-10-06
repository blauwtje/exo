// Hidden check for value-test-pollution. Restores the original test files over
// tests/, runs them in several fixed file orders, each in a fresh process the way
// `node --test --test-isolation=none` runs them, then runs hidden unit tests that
// hit each state leak with several tenants in one process.
// Usage: node check.mjs <repoDir>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.argv[2] ?? '.');
const data = path.join(repo, 'check-data');
const { tests: expected } = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8'));
const detail = [];
let total = 0;
let defects = 0;
const deadline = Date.now() + 50_000;

fs.cpSync(path.join(data, 'tests-original'), path.join(repo, 'tests'), { recursive: true, force: true });

const files = fs.readdirSync(path.join(data, 'tests-original')).filter((name) => name.endsWith('.test.mjs')).sort();
const rotate = (list, by) => [...list.slice(by), ...list.slice(0, by)];
const pick = (...names) => [...names.map((n) => `${n}.test.mjs`), ...files.filter((f) => !names.some((n) => `${n}.test.mjs` === f))];
const ORDERS = {
  alphabetical: files,
  reversed: [...files].reverse(),
  'pricing first': pick('pricing'),
  'pricing then credit-notes': pick('pricing', 'credit-notes', 'catalog', 'options'),
  'rotated by 3': rotate(files, 3),
  'rotated by 6': rotate(files, 6),
  'rotated by 9': rotate(files, 9),
  shuffled: pick('tax', 'pricing', 'router', 'options', 'quotes', 'credit-notes', 'catalog'),
};

function run(args) {
  const budget = Math.max(2_000, Math.min(15_000, deadline - Date.now()));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_')));
  return spawnSync(process.execPath, ['--test', '--test-isolation=none', '--test-reporter=tap', ...args], { cwd: repo, env, encoding: 'utf8', timeout: budget, maxBuffer: 64 * 1024 * 1024 });
}

const summary = (out, key) => Number(new RegExp(`^# ${key} (\\d+)`, 'm').exec(out)?.[1] ?? NaN);
const failures = (out) => [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1]);

for (const [name, order] of Object.entries(ORDERS)) {
  total += 1;
  const wrappers = fs.mkdtempSync(path.join(os.tmpdir(), 'order-'));
  const list = order.map((file, index) => {
    const wrapper = path.join(wrappers, `${String(index).padStart(2, '0')}-${file}`);
    fs.writeFileSync(wrapper, `import ${JSON.stringify(pathToFileURL(path.join(repo, 'tests', file)).href)};\n`);
    return wrapper;
  });
  const result = run(list);
  fs.rmSync(wrappers, { recursive: true, force: true });
  const out = result.stdout ?? '';
  const count = summary(out, 'tests');
  const failed = failures(out);
  if (failed.length > 0 || summary(out, 'fail') !== 0 || result.status !== 0 || result.error) {
    defects += 1;
    detail.push(`order "${name}" fails: ${failed.slice(0, 4).join('; ') || result.error?.message || `exit ${result.status}`}`);
  } else if (count < expected) {
    defects += 1;
    detail.push(`order "${name}" ran ${count} tests, the original files have ${expected}`);
  }
}

const hidden = run([path.join(data, 'leaks.test.mjs')]);
const leakOut = hidden.stdout ?? '';
const leakTotal = summary(leakOut, 'tests');
total += Number.isNaN(leakTotal) ? 1 : leakTotal;
if (Number.isNaN(leakTotal) || hidden.status !== 0) {
  const failed = failures(leakOut);
  defects += Math.max(1, failed.length);
  detail.push(...(failed.length ? failed.map((name) => `leak test fails: ${name}`) : [`leak tests did not run: ${(hidden.stderr || '').trim().slice(-200)}`]));
}

console.log(JSON.stringify({ pass: defects === 0, defects, total, detail }));
