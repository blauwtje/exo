import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { budgetSpent, settleRound } from '../skills/gate/scripts/repair-round.mjs';
import { GATE_TIMEOUT_MS } from '../skills/gate/scripts/gate-constants.mjs';
import { fixDiffRanges, insideFixDiff } from '../skills/gate/scripts/fix-diff-scope.mjs';
import { git, tempDir } from './harness.mjs';

function repoWithFix() {
  const root = tempDir('round-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'user.email', 't@example.com');
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\ntwo\nthree\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const pre = git(root, 'rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\nTWO\nthree\n');
  git(root, 'commit', '-q', '-am', 'fix: two');
  return { root, pre, sha: git(root, 'rev-parse', '--short', 'HEAD').trim() };
}

const rows = (root) => fs.readFileSync(path.join(root, '.exo', 'review-rounds.tsv'), 'utf8').trim().split('\n');

test('a fix whose checks pass is kept and logged as one row', () => {
  const { root, sha } = repoWithFix();
  assert.deepEqual(settleRound({ root, round: 1, commits: [sha], checksGreen: true, fixBefore: 2, fixAfter: 0 }), []);
  assert.equal(rows(root)[1], `1\t${sha}\tpass\t2\t0\tkept`);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'one\nTWO\nthree\n');
});

test('a fix whose checks fail is reverted, logged discarded and keeps the fix count', () => {
  const { root, sha } = repoWithFix();
  const lines = settleRound({ root, round: 1, commits: [sha], checksGreen: false, fixBefore: 2, fixAfter: 0 });
  assert.match(lines[0], /^DISCARDED round 1/);
  assert.equal(rows(root)[1], `1\t${sha}\tfail\t2\t2\tdiscarded`);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'one\ntwo\nthree\n');
});

test('a new fix finding inside the fix diff discards a green fix', () => {
  const { root, sha } = repoWithFix();
  settleRound({ root, round: 2, commits: [sha], checksGreen: true, newFixInDiff: 1, fixBefore: 1, fixAfter: 0 });
  assert.match(rows(root)[1], /discarded$/);
});

test('fix diff ranges hold the changed lines and findings outside them are not inside', () => {
  const { root, pre } = repoWithFix();
  const ranges = fixDiffRanges(root, pre);
  assert.equal(insideFixDiff(ranges, { path: 'a.txt', range: '2' }), true);
  assert.equal(insideFixDiff(ranges, { path: 'a.txt', range: '3' }), false);
  assert.equal(insideFixDiff(ranges, { path: 'b.txt', range: '2' }), false);
});

test('the gate budget is spent at the shared constant', () => {
  assert.equal(budgetSpent(1000, 1000 + GATE_TIMEOUT_MS - 1), false);
  assert.equal(budgetSpent(1000, 1000 + GATE_TIMEOUT_MS), true);
  assert.equal(budgetSpent(undefined, 1e15), false);
});
