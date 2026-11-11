import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ledgerDirOf, settleRound } from '../skills/gate/scripts/repair-round.mjs';
import { readLedger } from '../lib/loop-budget.mjs';
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

const planPath = 'docs/plans/p.md';

const rows = (root) => readLedger(ledgerDirOf(root, planPath));

test('a fix whose checks pass is kept and logged as one row', () => {
  const { root, sha } = repoWithFix();
  assert.deepEqual(settleRound({ root, planPath, round: 1, commits: [sha], checksGreen: true, fixBefore: 2, fixAfter: 0 }), []);
  assert.deepEqual(rows(root).map((row) => [row.kind, row.open_before, row.open_after, row.verdict]), [['fix', '2', '0', 'stop']]);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'one\nTWO\nthree\n');
});

test('a fix whose checks fail is reverted, logged discarded and keeps the fix count', () => {
  const { root, sha } = repoWithFix();
  const lines = settleRound({ root, planPath, round: 1, commits: [sha], checksGreen: false, fixBefore: 2, fixAfter: 0 });
  assert.match(lines[0], /^DISCARDED round 1/);
  assert.deepEqual(rows(root).map((row) => [row.open_before, row.open_after, row.verdict]), [['2', '2', 'discard']]);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'one\ntwo\nthree\n');
});

test('a new fix finding inside the fix diff discards a green fix', () => {
  const { root, sha } = repoWithFix();
  settleRound({ root, planPath, round: 2, commits: [sha], checksGreen: true, newFixInDiff: 1, fixBefore: 1, fixAfter: 0 });
  assert.equal(rows(root)[0].verdict, 'discard');
});

test('fix diff ranges hold the changed lines and findings outside them are not inside', () => {
  const { root, pre } = repoWithFix();
  const ranges = fixDiffRanges(root, pre);
  assert.equal(insideFixDiff(ranges, { path: 'a.txt', range: '2' }), true);
  assert.equal(insideFixDiff(ranges, { path: 'a.txt', range: '3' }), false);
  assert.equal(insideFixDiff(ranges, { path: 'b.txt', range: '2' }), false);
});

test('a fix that touches the judge is discarded even when green', () => {
  const { root, sha } = repoWithFix();
  const lines = settleRound({ root, planPath, round: 1, commits: [sha], checksGreen: true, judgeTouched: true, fixBefore: 2, fixAfter: 0 });
  assert.match(lines[0], /^DISCARDED round 1/);
  assert.equal(rows(root)[0].verdict, 'discard');
});

test('a green fix whose fix count did not drop is reverted as no progress', () => {
  const { root, sha } = repoWithFix();
  const lines = settleRound({ root, planPath, round: 1, commits: [sha], checksGreen: true, fixBefore: 2, fixAfter: 2 });
  assert.match(lines[0], /^DISCARDED round 1/);
  assert.deepEqual(rows(root).map((row) => [row.open_before, row.open_after, row.verdict]), [['2', '2', 'discard']]);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'one\ntwo\nthree\n');
});

test('a merge without a repair stays in the same round', async () => {
  const { mergeRound, appendLedger } = await import('../skills/gate/scripts/merge-reviews.mjs');
  const { root } = repoWithFix();
  assert.deepEqual(mergeRound(root, false), { round: 1, priorRound: 0 });
  appendLedger(root, [], 1);
  fs.writeFileSync(path.join(root, 'b.txt'), 'x');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'later');
  assert.deepEqual(mergeRound(root, false), { round: 1, priorRound: 0 });
  assert.deepEqual(mergeRound(root, true), { round: 2, priorRound: 1 });
});
