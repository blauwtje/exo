import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { clusterFindings, mergeReviews, parseFinding } from '../skills/gate/scripts/merge-reviews.mjs';
import { boundaryLines, writeReviewInput } from '../skills/gate/scripts/review-input.mjs';
import { git, tempDir } from './harness.mjs';

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

const settledFix = (file) => ['FINDINGS', `${file}:3-4; defect; swallowed failure; catch drops error; fix`, '  Probe: true', '  Class: swallowed failure', '  Sweep: true', ''].join('\n');

function rootWithRow(state) {
  const root = tempDir('scope-');
  fs.mkdirSync(path.join(root, '.exo'));
  const row = { round: 1, rule: 'swallowed failure', path: 'lib/b.mjs', range: '1-2', weight: 'defect', state, head: null };
  fs.writeFileSync(path.join(root, '.exo', 'review-ledger.jsonl'), `${JSON.stringify(row)}\n`);
  return root;
}

test('a fix finding whose rule@path has a declined ledger row is demoted to report and named', () => {
  const root = rootWithRow('declined');
  const merged = mergeReviews([{ name: 'review-branch', text: settledFix('lib/b.mjs') }], new Map(), null, root);
  assert.equal(merged.counts.fix, 0);
  assert.equal(merged.demoted, 0);
  assert.deepEqual(merged.settledDemoted, ['lib/b.mjs:3-4']);
  assert.equal(merged.findings[0].state, 'reported');
  assert.equal(mergeReviews([{ name: 'review-branch', text: settledFix('lib/c.mjs') }], new Map(), null, root).counts.fix, 1);
});

test('a reported ledger row written by merge leaves a later detailed fix finding at fix', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: settledFix('lib/b.mjs') }], new Map(), null, rootWithRow('reported'));
  assert.equal(merged.counts.fix, 1);
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
  const checkout = tempDir('scope-');
  git(checkout, 'init', '-q', '-b', 'main');
  git(checkout, 'commit', '-q', '--allow-empty', '-m', 'init');
  const boundaries = ['Task 1: Boundary: in a path | out symlinks | test t'];
  writeReviewInput({ goal: 'g', nonGoals: [] }, { checkout, base: 'HEAD', head: 'HEAD', redSection: ['none'], boundaries });
  const input = fs.readFileSync(path.join(checkout, '.exo', 'review-input.md'), 'utf8');
  assert.match(input, /## Boundaries\n.*out-of-scope.*\nTask 1: Boundary: in a path \| out symlinks \| test t\n/);
});

test('open fix findings cluster by file into groups of at most five', () => {
  const at = (file, count) => Array.from({ length: count }, (_, index) => ({ path: file, range: String(index + 1), state: 'open' }));
  const findings = [...at('a.mjs', 3), ...at('b.mjs', 3), ...at('c.mjs', 7), { path: 'd.mjs', range: '1', state: 'reported' }];
  const clusters = clusterFindings(findings);
  assert.deepEqual(clusters.map((cluster) => cluster.length), [5, 3, 5]);
  assert.deepEqual([...new Set(clusters[0].map((finding) => finding.path))], ['a.mjs', 'c.mjs']);
  assert.equal(clusters.flat().some((finding) => finding.path === 'd.mjs'), false);
});
