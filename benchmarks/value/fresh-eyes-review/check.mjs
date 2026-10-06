// Runs the hidden soft-delete tests and the repository's own tests against the cell repo.
// Prints one JSON line: { pass, defects, total, detail }.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
const HIDDEN = 'test/soft-delete.hidden.test.js';
const HIDDEN_TOTAL = 18;

function tap(files) {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: repo, encoding: 'utf8', timeout: 25000 });
  const results = [];
  for (const text of run.stdout.split('\n')) {
    const match = /^(not ok|ok) \d+ - (.*?)(?: # .*)?$/.exec(text);
    if (match) results.push({ ok: match[1] === 'ok', name: match[2] });
  }
  return results;
}

function walk(dir) {
  return readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}

let defects = 0;
let total = 0;
const detail = [];
try {
  const hidden = tap([HIDDEN]);
  if (hidden.length === 0) {
    defects += HIDDEN_TOTAL;
    total += HIDDEN_TOTAL;
    detail.push('hidden tests produced no result');
  } else {
    total += HIDDEN_TOTAL;
    const failed = hidden.filter((result) => !result.ok);
    defects += failed.length + Math.max(0, HIDDEN_TOTAL - hidden.length);
    for (const result of failed) detail.push(`FAIL ${result.name}`);
  }
  const own = walk('test').filter((file) => file.endsWith('.js') && /\.test\.js$/.test(file) && file !== HIDDEN);
  const visible = own.length === 0 ? [] : tap(own);
  total += visible.length;
  for (const result of visible.filter((entry) => !entry.ok)) {
    defects += 1;
    detail.push(`FAIL repo test: ${result.name}`);
  }
} catch (error) {
  defects = Math.max(defects, 1);
  total = Math.max(total, HIDDEN_TOTAL);
  detail.push(`check error: ${error.message}`);
}
console.log(JSON.stringify({ pass: defects === 0, defects, total, detail }));
