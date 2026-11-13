import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { clusterFindings, mergeReviews, parseFinding } from '../skills/gate/scripts/merge-reviews.mjs';
import { boundaryLines, writeReviewInput } from '../skills/gate/scripts/review-input.mjs';
import { git, tempDir } from './harness.mjs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { taskReviewer } from '../skills/gate/scripts/pick-reviewer.mjs';
import { reviewLines } from '../skills/gate/scripts/review-lines.mjs';
import { parsePlan } from '../lib/plan-tasks.mjs';
import { landedTasks, planTaskTrailer, proofRecordPath } from '../lib/plan-landed.mjs';

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

test('open defect findings form one cluster; concern and reported ones stay out', () => {
  const at = (file, count, weight) => Array.from({ length: count }, (_, index) => ({ path: file, range: String(index + 1), state: 'open', weight }));
  const findings = [...at('a.mjs', 3, 'defect'), ...at('c.mjs', 7, 'defect'), ...at('e.mjs', 1, 'concern'), { path: 'd.mjs', range: '1', state: 'reported', weight: 'defect' }];
  const clusters = clusterFindings(findings);
  assert.deepEqual(clusters.map((cluster) => cluster.length), [10]);
  assert.equal(clusters.flat().some((finding) => ['d.mjs', 'e.mjs'].includes(finding.path)), false);
});

test('a later-round fix finding outside the fix diff is demoted to report', () => {
  const ranges = new Map([['lib/b.mjs', [[3, 4]]]]);
  const inside = mergeReviews([{ name: 'review-branch', text: settledFix('lib/b.mjs') }], new Map(), null, null, 4, ranges);
  assert.equal(inside.counts.fix, 1);
  const outside = mergeReviews([{ name: 'review-branch', text: settledFix('lib/c.mjs') }], new Map(), null, null, 4, ranges);
  assert.equal(outside.counts.fix, 0);
  assert.deepEqual(outside.scopeDemoted, ['lib/c.mjs:3-4']);
});

const task = { number: 1, risk: null };
const added = (name) => `diff --git a/${name} b/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/${name}\n@@ -0,0 +1 @@\n+x\n`;
const modified = (name) => `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-a\n+b\n`;
const paths = ['lib/thing.mjs', 'tests/thing.test.mjs'];
const newDiff = added('lib/thing.mjs') + added('tests/thing.test.mjs');

test('new test-first modules skip the review', () => {
  assert.equal(taskReviewer(task, paths, { route: 'waves', taskDiff: newDiff, redProved: true }), 'none (new test-first modules)');
});

test('an unproved red keeps the review', () => {
  assert.match(taskReviewer(task, paths, { route: 'waves', taskDiff: newDiff, redProved: false }), /review-branch/);
});

test('a modified file keeps the review', () => {
  const diff = added('tests/thing.test.mjs') + modified('lib/thing.mjs');
  assert.match(taskReviewer(task, paths, { route: 'waves', taskDiff: diff, redProved: true }), /review-branch/);
});

test('no test path keeps the review', () => {
  assert.match(taskReviewer(task, ['lib/thing.mjs'], { route: 'waves', taskDiff: added('lib/thing.mjs'), redProved: true }), /review-branch/);
});

test('a Risk field keeps the review', () => {
  const risky = { number: 1, risk: 'migration' };
  assert.match(taskReviewer(risky, paths, { route: 'waves', taskDiff: newDiff, redProved: true }), /review-branch/);
});

const PLAN_ID = 'new-modules';
const PLAN_TEXT = '# Plan\n\n### Task 1: Add the module\n\nDepends on: none\n';

function write(root, name, text) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), text);
}

function landedRepo(extraEdit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-new-modules-'));
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/index.js', 'export const a = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  git(root, 'checkout', '-q', '-b', 'feature');
  write(root, 'src/a.js', 'export const a = 1;\n');
  write(root, 'src/a.test.js', 'import { a } from "./a.js";\n');
  if (extraEdit) write(root, 'src/index.js', 'export const a = 2;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Add the module', '-m', planTaskTrailer(PLAN_ID, 1));
  write(root, path.relative(root, proofRecordPath(root, PLAN_ID, 1)), 'Red: proved\n');
  return root;
}

function branchLine(root) {
  const plan = parsePlan(PLAN_TEXT);
  const landed = new Set(landedTasks(plan.tasks, root, PLAN_ID));
  return reviewLines(plan, landed, { root, planId: PLAN_ID, base: 'main' }).find((line) => line.startsWith('REVIEW Branch'));
}

test('a landed task of only new test-first files skips the branch review', (context) => {
  const root = landedRepo(false);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.match(branchLine(root), /^REVIEW Branch main\.\.HEAD: none \(new test-first modules\)$/);
});

test('a landed task that also edits an existing file keeps the branch review', (context) => {
  const root = landedRepo(true);
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const line = branchLine(root);
  assert.match(line, /^REVIEW Branch main\.\.HEAD: .*review-branch/);
  assert.doesNotMatch(line, /: none/);
});
