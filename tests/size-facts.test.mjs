// size-facts.mjs counts the size facts a skill's activation gate judges by
// hand: changed files, changed lines, and whether a dependency was added.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { isSmall, measureSizeFacts, parseNumstat } from '../lib/size-facts.mjs';
import { git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../lib/size-facts.mjs', import.meta.url));

test('parseNumstat sums numstat lines and treats a binary marker as zero', () => {
  assert.deepEqual(parseNumstat('5\t2\tfoo.js\n1\t0\tbar.js\n'), { files: 2, changedLines: 8 });
  assert.deepEqual(parseNumstat('-\t-\timage.png\n'), { files: 1, changedLines: 0 });
  assert.deepEqual(parseNumstat(''), { files: 0, changedLines: 0 });
});

test('isSmall holds at or under every limit with no dependency added', () => {
  assert.equal(isSmall({ files: 2, changedLines: 79, dependencyAdded: false }), true);
  assert.equal(isSmall({ files: 0, changedLines: 0, dependencyAdded: false }), true);
});

test('isSmall fails past the file limit', () => {
  assert.equal(isSmall({ files: 3, changedLines: 1, dependencyAdded: false }), false);
});

test('isSmall fails past the line limit', () => {
  assert.equal(isSmall({ files: 1, changedLines: 80, dependencyAdded: false }), false);
});

test('isSmall fails on an added dependency alone', () => {
  assert.equal(isSmall({ files: 1, changedLines: 1, dependencyAdded: true }), false);
});

test('a small edit prints small with no dependency added', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'app.js'), 'export function greet() { return 1; }\n');
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'changed files 1\nchanged lines 2\ndependency-added no\nsmall\n');
});

test('large by file count over the two-file limit', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'a.js'), 'const a = 1;\n');
  await fs.writeFile(path.join(root, 'b.js'), 'const b = 1;\n');
  await fs.writeFile(path.join(root, 'c.js'), 'const c = 1;\n');
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'changed files 3\nchanged lines 3\ndependency-added no\nlarge\n');
});

test('large by changed lines at or over the 80-line limit', async () => {
  const root = await gitRepository({ 'app.js': 'line\n'.repeat(90) });
  await fs.writeFile(path.join(root, 'app.js'), 'line\n'.repeat(10));
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^changed files 1\nchanged lines 80\ndependency-added no\nlarge\n$/);
});

test('large by a dependency added to package.json, even at one file and few lines', async () => {
  const root = await gitRepository({ 'package.json': '{\n  "name": "demo",\n  "dependencies": {}\n}\n' });
  await fs.writeFile(path.join(root, 'package.json'), '{\n  "name": "demo",\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n');
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'changed files 1\nchanged lines 4\ndependency-added yes\nlarge\n');
});

test('a version-only bump in package.json is not a dependency added', async () => {
  const root = await gitRepository({ 'package.json': '{\n  "dependencies": {\n    "left-pad": "1.0.0"\n  }\n}\n' });
  await fs.writeFile(path.join(root, 'package.json'), '{\n  "dependencies": {\n    "left-pad": "1.0.1"\n  }\n}\n');
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /dependency-added no\n/);
});

test('an added dependency in a new untracked package.json counts too', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'requirements.txt'), 'requests==2.31.0\n');
  const result = await run(SCRIPT, [], { cwd: root });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /dependency-added yes\nlarge\n$/);
});

test('--base measures a committed branch against a base ref instead of the working tree', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  await fs.writeFile(path.join(root, 'app.js'), 'export function greet() { return 1; }\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: change greet');
  const result = await run(SCRIPT, ['--base', 'HEAD~1'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'changed files 1\nchanged lines 2\ndependency-added no\nsmall\n');
});

test('an unknown flag is rejected', async () => {
  const root = await gitRepository({ 'app.js': 'export function greet() {}\n' });
  const result = await run(SCRIPT, ['--bogus'], { cwd: root });
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
});
