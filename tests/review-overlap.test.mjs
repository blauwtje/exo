// review-overlap.mjs lists files and exported names more than one task changed.

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { findOverlaps, formatOverlaps, readChanges } from '../skills/verify/scripts/review-overlap.mjs';
import { commitFiles, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/review-overlap.mjs', import.meta.url));
const change = (task, path, before, after, added = '') => ({ task, path, before, after, added });

test('lists a file two tasks changed', () => {
  const overlaps = findOverlaps([change(1, 'a.md', '', 'x'), change(2, 'a.md', 'x', 'y'), change(2, 'b.md', '', 'z')]);
  assert.deepEqual(overlaps, [{ target: 'a.md', tasks: [1, 2] }]);
});

test('lists an exported name whose signature changed and another task mentions', () => {
  const overlaps = findOverlaps([
    change(1, 'lib/f.mjs', 'export function f(a) {}', 'export function f(a, b) {}'),
    change(2, 'lib/g.mjs', '', 'x', 'const v = f(1);')
  ]);
  assert.deepEqual(overlaps, [{ target: 'lib/f.mjs:f', tasks: [1, 2] }]);
});

test('ignores a changed name no other task mentions as a word, and an unchanged signature', () => {
  assert.deepEqual(findOverlaps([
    change(1, 'lib/f.mjs', 'export function f(a) {}', 'export function f(a, b) {}'),
    change(2, 'lib/g.mjs', '', 'x', 'const v = foo(1); // fx')
  ]), []);
  assert.deepEqual(findOverlaps([
    change(1, 'lib/f.mjs', 'export function f(a) {}', 'export function f(a) { return 1; }'),
    change(2, 'lib/g.mjs', '', 'x', 'f(1)')
  ]), []);
});

test('formats the list and the empty case', () => {
  assert.equal(formatOverlaps([]), 'OVERLAP none');
  assert.equal(formatOverlaps([{ target: 'a.md', tasks: [1, 3] }]), 'OVERLAP a.md (Tasks 1, 3)');
});

test('reads the commits of tasks from a repository and prints the overlap', async () => {
  const root = await gitRepository({ 'seed.md': 's\n' });
  const base = git(root, 'rev-parse', 'HEAD');
  await commitFiles(root, { 'lib.mjs': 'export function f(a) {}\n' }, 'one\n\nPlan-task: p/1');
  await commitFiles(root, { 'lib.mjs': 'export function f(a, b) {}\n', 'use.mjs': 'f(1, 2);\n' }, 'two\n\nPlan-task: p/2');
  await commitFiles(root, { 'other.md': 'x\n' }, 'untracked by tasks');
  assert.equal(readChanges(base, root).length, 3);
  const result = await run(SCRIPT, ['--base', base, '--root', root]);
  assert.equal(result.stdout, 'OVERLAP lib.mjs (Tasks 1, 2)\nOVERLAP lib.mjs:f (Tasks 1, 2)\n');
});
