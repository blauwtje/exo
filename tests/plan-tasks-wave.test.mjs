import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameOf, nextWave, parsePlan } from '../lib/plan-tasks.mjs';

function planWith(parallelLine) {
  const task = (number, depends, file) => `### Task ${number}: step ${number}\n\nDepends on: ${depends} | Files: \`${file}\`\n`;
  return [
    '# Plan', '', '## Plan basis', '', 'Worktree setup: none', '', '## Checkpoint', '', `- Parallel: ${parallelLine}`, '', '## Tasks', '',
    task(1, 'none', 'lib/base.mjs'),
    task(2, '1', 'lib/a.mjs'),
    task(3, '1', 'lib/b.mjs'),
    task(4, '2', 'lib/c.mjs'),
    task(5, '3', 'lib/d.mjs'),
    task(6, '1', 'lib/a.mjs')
  ].join('\n');
}

function waveOf(parallelLine, landed, inFlight = []) {
  const plan = parsePlan(planWith(parallelLine));
  const frame = frameOf(plan.frame);
  return nextWave(plan.tasks, landed, frame.worktreeSetup, frame.parallel, inFlight).map((task) => task.number);
}

test('nextWave batches tasks that became independent after the Parallel: line was written', () => {
  assert.deepEqual(waveOf('Tasks 2 and 3.', [1, 2, 3]), [4, 5, 6]);
});

test('nextWave starts an independent task beside a running one that the Parallel: line left out', () => {
  assert.deepEqual(waveOf('Tasks 2 and 3.', [1, 2, 3], [4]), [5, 6]);
});

test('nextWave never puts two tasks that share a file in one wave', () => {
  assert.deepEqual(waveOf('Tasks 2 and 3.', [1]), [2, 3]);
  assert.deepEqual(waveOf('every task', [1, 2, 3, 4, 5]), [6]);
  assert.deepEqual(waveOf('Tasks 2 and 3.', [1], [2]), [3]);
});

test('nextWave keeps a plan whose Parallel: line reads none serial', () => {
  assert.deepEqual(waveOf('none.', [1]), [2]);
  assert.deepEqual(waveOf('none.', [1], [2]), []);
});
