import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mergeReviews, parseFinding } from '../skills/gate/scripts/merge-reviews.mjs';
import { boundaryLines, writeReviewInput } from '../skills/gate/scripts/review-input.mjs';

const SCOPE_LINE = 'lib/a.mjs:4-6; out-of-scope; path escape; symlink bypass sits in an out class; report';

test('an out-of-scope finding is listed and counts in no verdict', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: `CLEAN\n${SCOPE_LINE}\n` }]);
  assert.equal(merged.verdict, 'CLEAN');
  assert.deepEqual(merged.shown, [SCOPE_LINE]);
  assert.equal(merged.counts.defect + merged.counts.concern + merged.counts.question + merged.counts.note, 0);
  assert.equal(merged.unread, 0);
  assert.deepEqual(merged.recurring, []);
});

test('a FINDINGS report whose only finding is out-of-scope merges as CLEAN', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: `FINDINGS\n${SCOPE_LINE}\n` }]);
  assert.equal(merged.verdict, 'CLEAN');
});

test('an out-of-scope finding marked fix is reported without Probe lines', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: SCOPE_LINE.replace(/report$/, 'fix') }]);
  assert.equal(merged.counts.fix, 0);
  assert.equal(merged.demoted, 0);
  assert.deepEqual(merged.shown, [SCOPE_LINE]);
});

test('an out-of-scope finding beside a defect leaves the defect to set the verdict', () => {
  const defect = 'lib/b.mjs:1-2; defect; swallowed failure; catch drops error; report';
  const merged = mergeReviews([{ name: 'review-branch', text: `FINDINGS\n${SCOPE_LINE}\n${defect}\n` }]);
  assert.equal(merged.verdict, 'FINDINGS');
  assert.equal(merged.counts.defect, 1);
});

test('parseFinding reads the out-of-scope weight', () => {
  assert.equal(parseFinding(SCOPE_LINE).weight, 'out-of-scope');
});

const PLAN = {
  tasks: [
    { number: 1, boundary: { in: 'a path', out: 'symlinks', test: 'tests/a.test.mjs' } },
    { number: 2, boundary: null },
    { number: 3, boundary: { in: 'a url', out: 'redirects', test: 'tests/c.test.mjs' } }
  ]
};

test('boundaryLines copies each landed task Boundary and says none without one', () => {
  assert.deepEqual(boundaryLines(PLAN, new Set([1, 2])), ['Task 1: Boundary: in a path | out symlinks | test tests/a.test.mjs']);
  assert.deepEqual(boundaryLines(PLAN, new Set([2])), ['none']);
});

test('review input holds a Boundaries block that names the out-of-scope weight', () => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-'));
  const git = (...args) => execFileSync('git', ['-C', checkout, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  const boundaries = ['Task 1: Boundary: in a path | out symlinks | test t'];
  writeReviewInput({ goal: 'g', nonGoals: [] }, { checkout, base: 'HEAD', head: 'HEAD', redSection: ['none'], boundaries });
  const input = fs.readFileSync(path.join(checkout, '.exo', 'review-input.md'), 'utf8');
  assert.match(input, /## Boundaries\n.*out-of-scope.*\nTask 1: Boundary: in a path \| out symlinks \| test t\n/);
});
