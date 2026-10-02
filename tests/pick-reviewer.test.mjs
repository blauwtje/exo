// pick-reviewer.mjs picks the review agent by risk, not size,,
// and only a named --reviewer override moves the pick off that reading.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { FILE_LIMIT, LINE_LIMIT, REVIEWER_AGENTS, parseNumstat, pickEffort, pickReviewer, resolveReviewer, signatureChangedSince, touchesManifest } from '../skills/verify/scripts/pick-reviewer.mjs';
import { UsageError } from '../lib/script-flags.mjs';
import { git, gitRepository, run } from './harness.mjs';

const { light, deep } = REVIEWER_AGENTS;
const AGENTS_DIRECTORY = fileURLToPath(new URL('../agents/', import.meta.url));

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/pick-reviewer.mjs', import.meta.url));

const NO_RISK = { riskTasks: false, manifestChanged: false, signatureChanged: false };

test('picks the plain reviewer agent when no risk fact holds, however large the diff', () => {
  assert.equal(pickReviewer(NO_RISK), light);
});

test('picks the deep reviewer agent when any one risk fact holds', () => {
  assert.equal(pickReviewer({ ...NO_RISK, riskTasks: true }), deep);
  assert.equal(pickReviewer({ ...NO_RISK, manifestChanged: true }), deep);
  assert.equal(pickReviewer({ ...NO_RISK, signatureChanged: true }), deep);
});

test('touchesManifest reads a manifest or lockfile anywhere in the paths', () => {
  assert.equal(touchesManifest(['src/app.js', 'web/package-lock.json']), true);
  assert.equal(touchesManifest(['src/app.js']), false);
});

test('a named override wins over the risk facts', () => {
  assert.equal(resolveReviewer({ reviewer: light, facts: { ...NO_RISK, riskTasks: true } }), light);
  assert.equal(resolveReviewer({ reviewer: deep, facts: NO_RISK }), deep);
});

test('an unnamed reviewer in the override is rejected', () => {
  assert.throws(() => resolveReviewer({ reviewer: 'budget is tight', facts: NO_RISK }), UsageError);
});

test('the pair is two distinct agents that exist as files', async () => {
  assert.notEqual(light, deep);
  for (const name of [light, deep]) {
    await fs.access(path.join(AGENTS_DIRECTORY, `${name}.md`));
  }
});

test('a model word is not a reviewer name', () => {
  assert.throws(() => resolveReviewer({ reviewer: 'sonnet', facts: NO_RISK }), UsageError);
});

test('an empty base is rejected, not read as a change with no risk', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--base', ''], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /--base/);
});

test('with no override, the risk facts decide', () => {
  assert.equal(resolveReviewer({ reviewer: undefined, facts: NO_RISK }), light);
  assert.equal(resolveReviewer({ reviewer: undefined, facts: { ...NO_RISK, signatureChanged: true } }), deep);
});

test('signatureChangedSince reads a Signature trailer or a missing Plan-task trailer, never a merge', async () => {
  const root = await gitRepository({ 'app.js': 'export const a = 1;\n' });
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'commit', '--allow-empty', '-m', 'feat: plain', '-m', 'Plan-task: plan/1');
  assert.equal(signatureChangedSince(base, root), false);
  git(root, 'commit', '--allow-empty', '-m', 'feat: breaking', '-m', 'Plan-task: plan/2\nSignature: app.js:a(x) -> (x, y)');
  assert.equal(signatureChangedSince(base, root), true);
  const second = git(root, 'rev-parse', 'HEAD');
  assert.equal(signatureChangedSince(second, root), false);
  git(root, 'commit', '--allow-empty', '-m', 'fix: review fix');
  assert.equal(signatureChangedSince(second, root), true);
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

test('--effort prints low for a lockfile-only change, not skip', async () => {
  const root = await gitRepository({
    'package.json': '{\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n',
    'package-lock.json': '{\n  "lockfileVersion": 3,\n  "packages": {}\n}\n'
  });
  await fs.writeFile(path.join(root, 'package-lock.json'), '{\n  "lockfileVersion": 3,\n  "packages": {\n    "left-pad": {}\n  }\n}\n');
  const result = await run(SCRIPT, ['--effort'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'low\n');
});

test('--effort prints low for a version-only bump with no dependency added', async () => {
  const root = await gitRepository({ 'package.json': '{\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n' });
  await fs.writeFile(path.join(root, 'package.json'), '{\n  "dependencies": {\n    "left-pad": "1.0.1"\n  }\n}\n');
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
