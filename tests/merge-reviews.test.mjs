// merge-reviews.mjs combines task and overlap reports into one findings file and the reviewer's return line.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';
import { run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/merge-reviews.mjs', import.meta.url));

const CLEAN = 'CLEAN\n\nCount: defect=0 hazard=0 question=0\n';
const FINDINGS = [
  'FINDINGS',
  '',
  'a.mjs:3-4 defect missing guard; evidence here. fix',
  '  Probe: grep -q guard a.mjs',
  'b.mjs:9 hazard swallowed error; evidence. report',
  '',
  'Count: defect=1 hazard=1'
].join('\n');

test('all clean reports merge to CLEAN with zero counts', () => {
  const { verdict, counts } = mergeReviews([{ name: 'task-1', text: CLEAN }, { name: 'overlap', text: CLEAN }]);
  assert.equal(verdict, 'CLEAN');
  assert.deepEqual(counts, { defect: 0, hazard: 0, question: 0, fix: 0 });
});

test('findings sum across reports and fix counts only fix findings', () => {
  const { verdict, counts, text } = mergeReviews([{ name: 'task-1', text: FINDINGS }, { name: 'task-2', text: FINDINGS }]);
  assert.equal(verdict, 'FINDINGS');
  assert.deepEqual(counts, { defect: 2, hazard: 2, question: 0, fix: 2 });
  assert.match(text, /^FINDINGS\n/);
  assert.match(text, /## task-2/);
});

test('one BLOCKED or unreadable report makes the merge BLOCKED', () => {
  assert.equal(mergeReviews([{ name: 'a', text: CLEAN }, { name: 'b', text: 'BLOCKED\nplan unreadable\n' }]).verdict, 'BLOCKED');
  assert.equal(mergeReviews([{ name: 'a', text: 'no verdict here' }]).verdict, 'BLOCKED');
});

test('the command writes .exo/branch-review.md and prints the return line', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-reviews-'));
  const one = path.join(root, 'task-1.md');
  const two = path.join(root, 'task-2.md');
  await fs.writeFile(one, FINDINGS);
  await fs.writeFile(two, CLEAN);
  const result = await run(SCRIPT, ['--root', root, '--report', one, '--report', two]);
  const target = path.join(root, '.exo', 'branch-review.md');
  assert.equal(result.stdout.trim(), `verdict=FINDINGS defect=1 hazard=1 question=0 fix=1 report=${target}`);
  assert.match(await fs.readFile(target, 'utf8'), /## task-1[\s\S]*## task-2/);
});

test('a missing report file is BLOCKED and a missing flag exits 2', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-reviews-'));
  const result = await run(SCRIPT, ['--root', root, '--report', path.join(root, 'none.md')]);
  assert.match(result.stdout, /^verdict=BLOCKED /);
  const bad = await run(SCRIPT, ['--root', root]);
  assert.equal(bad.code, 2);
});

test('a fix finding with no Probe line under it is demoted to report', () => {
  const { counts, text } = mergeReviews([{ name: 'task-1', text: 'FINDINGS\n\na.mjs:3 defect x; y. fix\n' }]);
  assert.equal(counts.fix, 0);
  assert.equal(counts.defect, 1);
  assert.match(text, /a\.mjs:3 defect x; y\. report/);
});

test('the demoted count is returned and printed on its own line only above zero', async () => {
  assert.equal(mergeReviews([{ name: 'task-1', text: 'FINDINGS\n\na.mjs:3 defect x; y. fix\n' }]).demoted, 1);
  assert.equal(mergeReviews([{ name: 'task-1', text: CLEAN }]).demoted, 0);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-reviews-'));
  const demoted = path.join(root, 'task-1.md');
  await fs.writeFile(demoted, 'FINDINGS\n\na.mjs:3 defect x; y. fix\n');
  const lines = (await run(SCRIPT, ['--root', root, '--report', demoted])).stdout.trim().split('\n');
  assert.equal(lines[1], 'DEMOTED 1 fix finding(s) to report: no Probe: line under them');
  const clean = path.join(root, 'task-2.md');
  await fs.writeFile(clean, CLEAN);
  assert.equal((await run(SCRIPT, ['--root', root, '--report', clean])).stdout.trim().split('\n').length, 1);
});
