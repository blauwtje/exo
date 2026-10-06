// node check.mjs <repoDir>: prints one JSON line { pass, defects, total, detail }.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const detail = [];
let total = 0;
let defects = 0;
const record = (name, ok, why) => {
  total += 1;
  if (!ok) { defects += 1; detail.push(`${name}: ${why}`); }
};
const run = (args) => spawnSync('node', args, { cwd: repo, encoding: 'utf8', timeout: 20000 });

const runner = join(repo, 'test-hidden', 'run-case.mjs');
if (!existsSync(runner)) {
  console.log(JSON.stringify({ pass: false, defects: 1, total: 1, detail: ['hidden cases missing'] }));
  process.exit(0);
}
const names = run([runner, '--list']).stdout.split('\n').filter(Boolean);
for (const name of names) {
  const r = run([runner, name]);
  record(name, r.status === 0, (r.stderr || r.error?.message || 'failed').trim().slice(0, 160));
}
const visible = run(['--test', 'test/money.test.mjs', 'test/invoice.test.mjs', 'test/refund.test.mjs', 'test/quote.test.mjs', 'test/fees.test.mjs', 'test/api.test.mjs', 'test/batch.test.mjs']);
record('visible-suite', visible.status === 0, 'the original visible tests fail');

console.log(JSON.stringify({ pass: defects === 0, defects, total, detail }));
