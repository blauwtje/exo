// pick-reviewer.mjs picks the branch-review agent by the size of the change,
// and only a named --reviewer override moves the pick off that reading.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { FILE_LIMIT, LINE_LIMIT, parseNumstat, parseShortstat, pickEffort, pickReviewer, resolveReviewer } from '../skills/run-plan/scripts/pick-reviewer.mjs';
import { UsageError } from '../lib/script-flags.mjs';
import { gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/run-plan/scripts/pick-reviewer.mjs', import.meta.url));

test('parses files, insertions and deletions out of a shortstat line', () => {
  assert.deepEqual(parseShortstat(' 3 files changed, 9 insertions(+), 1 deletion(-)'), { files: 3, changedLines: 10 });
  assert.deepEqual(parseShortstat(' 16 files changed, 384 insertions(+)'), { files: 16, changedLines: 384 });
  assert.deepEqual(parseShortstat(''), { files: 0, changedLines: 0 });
});

test('picks the plain reviewer at or under both limits', () => {
  assert.equal(pickReviewer({ files: FILE_LIMIT, changedLines: LINE_LIMIT }), 'exo:review-branch');
  assert.equal(pickReviewer({ files: 1, changedLines: 1 }), 'exo:review-branch');
});

test('picks the deep reviewer above either limit', () => {
  assert.equal(pickReviewer({ files: FILE_LIMIT + 1, changedLines: 1 }), 'exo:review-branch-deep');
  assert.equal(pickReviewer({ files: 1, changedLines: LINE_LIMIT + 1 }), 'exo:review-branch-deep');
});

test('a named override wins over the diff reading', () => {
  assert.equal(resolveReviewer({ reviewer: 'exo:review-branch', shortstatOutput: ' 16 files changed, 384 insertions(+)' }), 'exo:review-branch');
  assert.equal(resolveReviewer({ reviewer: 'exo:review-branch-deep', shortstatOutput: ' 1 file changed, 1 insertion(+)' }), 'exo:review-branch-deep');
});

test('an unnamed reviewer in the override is rejected', () => {
  assert.throws(() => resolveReviewer({ reviewer: 'budget is tight', shortstatOutput: '' }), UsageError);
});

test('an empty base is rejected, not read as a change of no size', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--base', ''], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /--base/);
});

test('with no override, the diff reading decides', () => {
  assert.equal(resolveReviewer({ reviewer: undefined, shortstatOutput: ' 3 files changed, 9 insertions(+), 1 deletion(-)' }), 'exo:review-branch');
  assert.equal(resolveReviewer({ reviewer: undefined, shortstatOutput: ' 16 files changed, 384 insertions(+)' }), 'exo:review-branch-deep');
});

test('parseNumstat sums numstat lines and treats a binary marker as zero', () => {
  assert.deepEqual(parseNumstat('5\t2\tfoo.js\n1\t0\tbar.js\n'), { files: 2, changedLines: 8 });
  assert.deepEqual(parseNumstat('-\t-\timage.png\n'), { files: 1, changedLines: 0 });
  assert.deepEqual(parseNumstat(''), { files: 0, changedLines: 0 });
});

test('pickEffort follows the D5 edges', () => {
  assert.equal(pickEffort({ files: 2, changedLines: 0, manifestChanged: false }), 'skip');
  assert.equal(pickEffort({ files: 2, changedLines: 0, manifestChanged: true }), 'low');
  assert.equal(pickEffort({ files: FILE_LIMIT, changedLines: LINE_LIMIT, manifestChanged: false }), 'low');
  assert.equal(pickEffort({ files: FILE_LIMIT + 1, changedLines: 0, manifestChanged: false }), 'medium');
  assert.equal(pickEffort({ files: FILE_LIMIT, changedLines: LINE_LIMIT + 1, manifestChanged: false }), 'medium');
});

test('--effort prints skip for one small edited tracked file', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'app.js'), 'export function greet() { return 1; }\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'skip\n');
});

test('--effort prints low for three new untracked files', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'a.js'), 'const a = 1;\n');
  await fs.writeFile(path.join(root, 'b.js'), 'const b = 1;\n');
  await fs.writeFile(path.join(root, 'c.js'), 'const c = 1;\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'low\n');
});

test('--effort with --base is rejected', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  const result = await run(SCRIPT, ['--effort', '--base', 'x'], { cwd: root });
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
});
