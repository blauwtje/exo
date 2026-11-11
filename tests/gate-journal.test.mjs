import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { noteGateStep, passedOnTree } from '../skills/gate/scripts/gate-journal.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { runGate } from '../skills/gate/scripts/gate-run.mjs';
import { gitRepository, tempDir } from './harness.mjs';

function repo() {
  const root = tempDir('exo-gate-journal-');
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}

test('a gate step recorded on a tree is passed on that tree only', () => {
  const root = repo();
  noteGateStep(root, 'checks', 'tree-a');
  assert.equal(passedOnTree(root, 'checks', 'tree-a'), true);
  assert.equal(passedOnTree(root, 'checks', 'tree-b'), false);
  assert.equal(passedOnTree(root, 'review', 'tree-a'), false);
});

test('the latest record of a step wins', () => {
  const root = repo();
  noteGateStep(root, 'checks', 'tree-a');
  noteGateStep(root, 'checks', 'tree-b');
  assert.equal(passedOnTree(root, 'checks', 'tree-a'), false);
  assert.equal(passedOnTree(root, 'checks', 'tree-b'), true);
});

const PLAN = '# Plan\n\n## Success criterion\n\n`node -e "require(\'fs\').appendFileSync(\'ran.txt\',\'x\')"`\n\n### Task 1: feat: one\n\nFiles: `a.txt`\n';
const taskLines = (run) => run.lines.filter((line) => /^(DONE|OPEN) /.test(line));

async function gateRoot() {
  const root = await gitRepository({ 'a.txt': 'a' });
  const planPath = path.join(root, 'plan.md');
  fs.writeFileSync(planPath, PLAN);
  return { root, planPath };
}

test('a gate with no recorded step runs the check', async () => {
  const { root, planPath } = await gateRoot();
  await runGate(PLAN, { planPath, root, base: 'HEAD' });
  assert.equal(fs.existsSync(path.join(root, 'ran.txt')), true);
});

test('a re-entered gate skips the check recorded as passed on the same tree and keeps its task lines', async () => {
  const { root, planPath } = await gateRoot();
  noteGateStep(root, 'checks');
  const again = await runGate(PLAN, { planPath, root, base: 'HEAD' });
  assert.equal(fs.existsSync(path.join(root, 'ran.txt')), false);
  assert.ok(again.lines.some((line) => line.startsWith('SKIP success-criterion')));
  assert.equal(taskLines(again).length, 1);
});

test('the first recorded review keeps its sha and a second record never replaces it', async () => {
  const { recordedReview, recordReview } = await import('../skills/gate/scripts/review-record.mjs');
  const root = await gitRepository({ 'a.txt': 'a' });
  assert.equal(recordedReview(root), null);
  recordReview(root, ['branch.md', 'overlap.md']);
  const first = recordedReview(root);
  recordReview(root, ['other.md']);
  assert.deepEqual(recordedReview(root), first);
  assert.deepEqual(first.branch, ['branch.md']);
  assert.deepEqual(first.overlap, ['overlap.md']);
});
