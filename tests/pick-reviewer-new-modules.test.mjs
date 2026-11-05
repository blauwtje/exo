import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { taskReviewer } from '../skills/gate/scripts/pick-reviewer.mjs';
import { reviewLines } from '../skills/gate/scripts/review-lines.mjs';
import { parsePlan } from '../lib/plan-tasks.mjs';
import { landedTasks, planTaskTrailer, proofRecordPath } from '../lib/plan-landed.mjs';

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

function git(root, ...args) {
  return execFileSync('git', ['-C', root, '-c', 'user.name=Jane Doe', '-c', 'user.email=user@example.com', ...args], { encoding: 'utf8' });
}

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
