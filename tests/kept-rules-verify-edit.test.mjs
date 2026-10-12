import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';
import { isTestPath } from '#red-green';
import { REVIEWER_AGENTS, pickEffort, taskReviewer, touchesManifest } from '../skills/verify/scripts/pick-reviewer.mjs';
import { findOverlaps, formatOverlaps } from '../skills/verify/scripts/review-overlap.mjs';
import { fixedProbes } from '../skills/verify/scripts/run-probes.mjs';

const script = (relative) => fileURLToPath(new URL(`../skills/${relative}`, import.meta.url));

test('help: each verify and edit-skills script prints its usage and exits 0', () => {
  const scripts = ['merge-reviews', 'pick-reviewer', 'review-overlap', 'run-probes', 'verify'].map((name) => `verify/scripts/${name}.mjs`);
  scripts.push('edit-skills/scripts/pressure.mjs', 'edit-skills/scripts/rename-skill.mjs');
  for (const relative of scripts) {
    const run = spawnSync(process.execPath, [script(relative), '--help'], { encoding: 'utf8' });
    assert.equal(run.status, 0, relative);
    assert.match(run.stdout, /^usage:/i, relative);
  }
});

test('merge: a report with no readable verdict counts as BLOCKED', () => {
  assert.equal(mergeReviews([{ name: 'one', text: 'nothing here\n' }]).verdict, 'BLOCKED');
});

test('merge: a fix finding with no Probe line under it is demoted to report', () => {
  const finding = 'a.mjs:3 defect fix';
  const demoted = mergeReviews([{ name: 'one', text: `FINDINGS\n${finding}\n` }]);
  assert.equal(demoted.demoted, 1);
  assert.equal(demoted.counts.fix, 0);
  const kept = mergeReviews([{ name: 'one', text: `FINDINGS\n${finding}\n  Probe: node a.mjs\n` }]);
  assert.equal(kept.demoted, 0);
  assert.equal(kept.counts.fix, 1);
});

test('probes: a fixed finding takes the command of the Probe line under it, or null', () => {
  const report = 'a.mjs:1 defect fix fixed\n  Probe: node a.mjs\nb.mjs:2 defect fix fixed\n';
  assert.deepEqual(fixedProbes(report).map((probe) => probe.command), ['node a.mjs', null]);
});

test('reviewer: the light pick covers a script or instruction-text change, text only and inline get none', () => {
  const task = { risk: null };
  assert.equal(taskReviewer(task, ['lib/a.mjs'], 'tasks'), REVIEWER_AGENTS.light);
  assert.equal(taskReviewer(task, ['skills/x/SKILL.md'], 'tasks'), REVIEWER_AGENTS.light);
  assert.equal(taskReviewer(task, ['docs/a.md'], 'tasks'), 'none (text only)');
  assert.equal(taskReviewer(task, ['lib/a.mjs'], 'inline'), 'none (inline route)');
});

test('reviewer: only a security boundary Risk picks the deep reviewer', () => {
  assert.equal(taskReviewer({ risk: 'security boundary' }, ['docs/a.md'], 'tasks'), REVIEWER_AGENTS.deep);
  assert.equal(taskReviewer({ risk: 'migration' }, ['docs/a.md'], 'tasks'), REVIEWER_AGENTS.light);
});

test('reviewer: a diff of only comments and output calls in a script, with a test file, needs no review', () => {
  const diff = 'diff --git a/lib/a.mjs b/lib/a.mjs\n--- a/lib/a.mjs\n+++ b/lib/a.mjs\n@@ -1 +1 @@\n-// old\n+console.log("x");\n';
  const paths = ['lib/a.mjs', 'tests/a.test.mjs'];
  assert.equal(taskReviewer({ risk: null }, paths, 'tasks', diff), 'none (output only, test covered)');
  assert.equal(taskReviewer({ risk: null }, paths, 'tasks', diff.replace('console.log("x");', 'run();')), REVIEWER_AGENTS.light);
});

test('reviewer: an output-only diff on a spec-skill script counts as covered by the test file', () => {
  const diff = 'diff --git a/skills/spec/scripts/plan-check.mjs b/skills/spec/scripts/plan-check.mjs\n--- a/skills/spec/scripts/plan-check.mjs\n+++ b/skills/spec/scripts/plan-check.mjs\n@@ -1 +1 @@\n-// old\n+console.log("x");\n';
  const paths = ['skills/spec/scripts/plan-check.mjs', 'tests/a.test.mjs'];
  assert.equal(taskReviewer({ risk: null }, paths, 'tasks', diff), 'none (output only, test covered)');
  assert.equal(taskReviewer({ risk: null }, paths.slice(0, 1), 'tasks', diff), REVIEWER_AGENTS.light);
});

test('test file: folders, test_ prefix and .test or _spec suffix count', () => {
  for (const name of ['tests/a.mjs', 'src/__tests__/a.js', 'test_a.py', 'a.test.mjs', 'a_spec.rb']) assert.ok(isTestPath(name), name);
  assert.ok(!isTestPath('lib/contest.mjs'));
});

test('effort: any manifest touch, a lockfile bump included, moves the pick off skip', () => {
  assert.ok(touchesManifest(['package-lock.json']));
  assert.equal(pickEffort({ files: 1, changedLines: 1, manifestChanged: false }), 'skip');
  assert.equal(pickEffort({ files: 1, changedLines: 1, manifestChanged: true }), 'low');
});

test('overlap: a file two tasks changed is listed, one task alone is not', () => {
  const change = (task, path) => ({ task, path, before: '', after: '', added: '' });
  const overlaps = findOverlaps([change(1, 'a.txt'), change(2, 'a.txt'), change(1, 'b.txt')]);
  assert.equal(formatOverlaps(overlaps), 'OVERLAP a.txt (Tasks 1, 2)');
  assert.equal(formatOverlaps([]), 'OVERLAP none');
});
