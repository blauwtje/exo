// benchmarks/value/lean-minimal-diff/check.mjs
// Run as: node check.mjs <repoDir>, after hidden/ is copied over the repo.
// Prints one JSON line {pass, defects, total, detail} and exits 0.
//
// The change asked for is small: quote the fields in customersToCsv. The repo
// already has a helper for it, src/shared/cell.mjs, whose contract is wider
// than "quote commas" (formula neutralising, null as empty, edge whitespace).
// Findings: each hidden test, plus four mechanical checks on the diff against
// the initial commit.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] ?? '.');

const TARGET = 'src/exports/customers.mjs';
const MAX_SRC_LINES = 20;
const IGNORED = [/^\.exo\//, /^\.claude\//, /(^|\/)\.DS_Store$/];

const detail = [];
let defects = 0;
let total = 0;

function finding(ok, label, why) {
  total += 1;
  if (!ok) {
    defects += 1;
    detail.push(`${label}: ${why}`);
  }
}

function git(...args) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

// Files the harness copied in after the session are not the session's change.
const hiddenFiles = new Set(walk(path.join(taskDir, 'hidden')));
const hiddenTests = [...hiddenFiles].filter((f) => f.endsWith('.test.mjs'));

// 1. Hidden tests, one finding per test case.
let expected = 0;
for (const f of hiddenTests) {
  expected += (readFileSync(path.join(taskDir, 'hidden', f), 'utf8').match(/^test\(/gm) ?? []).length;
}
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...hiddenTests], {
  cwd: repo,
  encoding: 'utf8',
  timeout: 20000,
});
const tap = run.stdout ?? '';
const passed = (tap.match(/^ok \d+ - /gm) ?? []).length;
const failedNames = [...tap.matchAll(/^not ok \d+ - (.+?)(?: # .*)?$/gm)].map((m) => m[1]);
total += expected;
const failedTests = Math.max(expected - passed, 0);
defects += failedTests;
for (const name of failedNames.slice(0, 12)) detail.push(`hidden test failed: ${name}`);
if (failedTests > failedNames.length) {
  detail.push(`hidden tests: ${failedTests} of ${expected} did not pass (exit ${run.status})`);
}

// 2. The diff against the initial commit.
const root = git('rev-list', '--max-parents=0', 'HEAD').trim().split('\n').pop();
const tracked = root ? git('diff', '--name-only', '--no-renames', root).split('\n') : [];
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
const changed = [...new Set([...tracked, ...untracked])]
  .filter(Boolean)
  .filter((f) => !hiddenFiles.has(f) && !IGNORED.some((re) => re.test(f)));

const unrelated = changed.filter((f) => f !== TARGET && !f.startsWith('test/'));
finding(
  unrelated.length === 0,
  'unrelated edit',
  `changed beyond ${TARGET} and test/: ${unrelated.join(', ')}`,
);

const sources = changed.filter((f) => /\.(mjs|js|cjs)$/.test(f) && existsSync(path.join(repo, f)));
const bare = [];
for (const f of sources) {
  const text = readFileSync(path.join(repo, f), 'utf8');
  const specs = [
    ...text.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...text.matchAll(/\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  for (const s of specs) {
    const builtin = s.startsWith('node:') || builtinModules.includes(s.split('/')[0]);
    if (!s.startsWith('.') && !s.startsWith('/') && !builtin) bare.push(`${f} imports ${s}`);
  }
}
const manifests = changed.filter((f) => /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|node_modules\/)/.test(f));
finding(
  bare.length === 0 && manifests.length === 0,
  'new dependency',
  [...manifests.map((f) => `${f} changed`), ...bare].join(', '),
);

const customersSrc = existsSync(path.join(repo, TARGET)) ? readFileSync(path.join(repo, TARGET), 'utf8') : '';
finding(
  /^\s*import\b[^;]*\bfrom\s*["'][^"']*shared\/cell(?:\.mjs)?["']/m.test(customersSrc),
  'no reuse',
  `${TARGET} does not import the existing helper src/shared/cell.mjs`,
);

let srcLines = 0;
for (const row of git('diff', '--numstat', '--no-renames', root, '--', 'src').split('\n').filter(Boolean)) {
  const [add, del] = row.split('\t');
  srcLines += (Number(add) || 0) + (Number(del) || 0);
}
finding(srcLines <= MAX_SRC_LINES, 'diff size', `${srcLines} changed lines under src/, cap ${MAX_SRC_LINES}`);

process.stdout.write(`${JSON.stringify({ pass: defects === 0, defects, total, detail })}\n`);
