import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/find-cause/scripts/bisect.mjs', import.meta.url));
const REPRO = 'node check.mjs';
const PASSING = 'process.exit(0);\n';
const FAILING = 'process.exit(1);\n';
const GITIGNORE = '.exo/\n';

const FLIPPING = [
  "import fs from 'node:fs';",
  'const file = process.env.FLAKY_COUNTER;',
  "const seen = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '0') + 1;",
  'fs.writeFileSync(file, String(seen));',
  'process.exit(seen % 2 === 0 ? 1 : 0);',
  ''
].join('\n');

const COUNTING = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "import { spawnSync } from 'node:child_process';",
  "const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();",
  'const file = path.join(process.env.HANG_COUNTER, sha);',
  "const seen = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '0') + 1;",
  'fs.writeFileSync(file, String(seen));',
  'if (sha === process.env.HANG_SHA && seen === 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);',
  "process.exit(spawnSync('git', ['merge-base', '--is-ancestor', process.env.FAIL_SHA, 'HEAD']).status === 0 ? 1 : 0);",
  ''
].join('\n');

const snapshot = (root) => ({
  status: git(root, 'status', '--porcelain'),
  head: git(root, 'rev-parse', 'HEAD'),
  worktrees: git(root, 'worktree', 'list', '--porcelain')
});

async function regressionRepository({ proofOnSecond = false } = {}) {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING, 'app.txt': 'one\n' });
  await commitFiles(root, { 'app.txt': 'two\n' }, 'feat: second');
  if (proofOnSecond) git(root, 'commit', '--amend', '-q', '-m', 'feat: second', '-m', 'Proof: node check.mjs → pass');
  await commitFiles(root, { 'check.mjs': FAILING }, 'feat: third breaks it');
  await commitFiles(root, { 'app.txt': 'four\n' }, 'feat: fourth');
  await commitFiles(root, { 'app.txt': 'five\n' }, 'feat: fifth');
  return root;
}

async function countingRepository() {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': COUNTING, 'app.txt': 'one\n' });
  await commitFiles(root, { 'app.txt': 'two\n' }, 'feat: second');
  await commitFiles(root, { 'app.txt': 'three\n' }, 'feat: third breaks it');
  await commitFiles(root, { 'app.txt': 'four\n' }, 'feat: fourth');
  await commitFiles(root, { 'app.txt': 'five\n' }, 'feat: fifth');
  return root;
}

async function longHistoryRepository({ total, culpritAge }) {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING, 'app.txt': 'commit 1\n' });
  const culprit = total - culpritAge;
  for (let number = 2; number <= total; number += 1) {
    const files = { 'app.txt': `commit ${number}\n` };
    if (number === culprit) files['check.mjs'] = FAILING;
    await commitFiles(root, files, `feat: commit ${number}`);
  }
  return root;
}

async function appendCommits(root, count) {
  for (let number = 1; number <= count; number += 1) {
    await commitFiles(root, { 'app.txt': `commit ${number}\n` }, `feat: commit ${number}`);
  }
}

test('the third of five commits that broke the repro is named', async () => {
  const root = await regressionRepository();
  const third = git(root, 'rev-parse', 'HEAD~2');
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.ok(lines.length <= 30, `printed ${lines.length} lines`);
  assert.equal(lines[0], `First bad: ${third} feat: third breaks it`);
  assert.match(lines[1], /^Good: [0-9a-f]{40} \((?:HEAD~\d+|proof trailer|merge-base|flag)\)$/);
  assert.match(lines[2], /^Diff: /);
  assert.equal(fs.existsSync(lines[2].slice('Diff: '.length)), true);
  assert.deepEqual(snapshot(root), before);
});

test('a Proof line on the second commit names it as the good ref', async () => {
  const root = await regressionRepository({ proofOnSecond: true });
  const second = git(root, 'rev-parse', 'HEAD~3');
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^Good: ${second} \\(proof trailer\\)$`, 'm'));
  assert.deepEqual(snapshot(root), before);
});

test('a repro that passes at HEAD reports no failure', async () => {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING });
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, 'Bisect: no failure at HEAD\n');
  assert.deepEqual(snapshot(root), before);
});

test('a repro that alternates reports flaky', async () => {
  const counter = path.join(await fixture(), 'counter.txt');
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': FLIPPING });
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root, env: { FLAKY_COUNTER: counter } });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, 'Bisect: flaky repro\n');
  assert.deepEqual(snapshot(root), before);
});

test('--help ends the usage line with its period', async () => {
  const result = await run(SCRIPT, ['--help']);
  assert.equal(result.code, 0);
  assert.equal(
    result.stdout.trimEnd().split('\n').at(-1),
    'A repro that passes at HEAD, alternates, or cannot be bisected prints one Bisect: line and exits 1; a usage error exits 2.'
  );
});

test('a --good value starting with a dash is a usage error', async () => {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING });
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO, '--good', '-x'], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--good/);
  assert.deepEqual(snapshot(root), before);
});

test('a --good ref that names no commit is a usage error', async () => {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING });
  const result = await run(SCRIPT, ['--repro', REPRO, '--good', 'no-such-ref'], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--good/);
});

test('a --good ref that is not an ancestor of HEAD is a usage error', async () => {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING, 'app.txt': 'one\n' });
  git(root, 'switch', '-q', '-c', 'side');
  await commitFiles(root, { 'side.txt': 'side\n' }, 'feat: side');
  git(root, 'switch', '-q', 'main');
  await commitFiles(root, { 'app.txt': 'two\n' }, 'feat: main');
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO, '--good', 'side'], { cwd: root });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /not an ancestor/);
  assert.deepEqual(snapshot(root), before);
});

test('a confirmation run that errors names the cause instead of flaky', async () => {
  const counters = await fixture();
  const root = await countingRepository();
  const third = git(root, 'rev-parse', 'HEAD~2');
  const result = await run(SCRIPT, ['--repro', REPRO], {
    cwd: root,
    env: { HANG_COUNTER: counters, HANG_SHA: third, FAIL_SHA: third, EXO_BISECT_PROBE_MS: '1500' }
  });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^Bisect: error: .*timed out after 1500 ms\n$/);
});

test('a regression more than 32 commits back is named without a good ref', async () => {
  const root = await longHistoryRepository({ total: 120, culpritAge: 54 });
  const culprit = git(root, 'rev-parse', 'HEAD~54');
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.split('\n')[0], `First bad: ${culprit} feat: commit 66`);
});

test('a good commit only at the root is found by the root fallback', async () => {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': PASSING });
  const rootSha = git(root, 'rev-parse', 'HEAD');
  await commitFiles(root, { 'check.mjs': FAILING }, 'feat: breaks it');
  await appendCommits(root, 40);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`^Good: ${rootSha} \\(root commit\\)$`, 'm'));
});

test('a repro that never passed reports no passing commit', async () => {
  const root = await gitRepository({ '.gitignore': GITIGNORE, 'check.mjs': FAILING });
  await appendCommits(root, 40);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^Bisect: no passing commit in \d+ candidates\n$/);
});

test('out-of-scope: the repro never runs in the fixture checkout and leaves it untouched', async () => {
  const log = path.join(await fixture(), 'cwds.txt');
  const recording = [
    "import fs from 'node:fs';",
    "fs.appendFileSync(process.env.CWD_LOG, fs.realpathSync(process.cwd()) + '\\n');",
    "fs.writeFileSync('stray.txt', 'x');",
    'process.exit(fs.existsSync(\'marker.txt\') ? 1 : 0);',
    ''
  ].join('\n');
  const root = await gitRepository({ '.gitignore': `${GITIGNORE}stray.txt\n`, 'check.mjs': recording });
  await commitFiles(root, { 'marker.txt': 'broken\n' }, 'feat: breaks it');
  await appendCommits(root, 3);
  const before = snapshot(root);
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root, env: { CWD_LOG: log } });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const visited = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.ok(visited.length > 0);
  const checkout = fs.realpathSync(root);
  for (const directory of visited) assert.notEqual(directory, checkout);
  assert.equal(fs.existsSync(path.join(root, 'stray.txt')), false);
  assert.deepEqual(snapshot(root), before);
});
