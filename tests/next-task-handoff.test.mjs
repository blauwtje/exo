import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SCRATCH_FOLDER } from '../lib/scratch-path.mjs';
import { taskBrief } from '../skills/build/scripts/next-task-brief.mjs';
import { commitFiles, git } from './harness.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

function briefTask(number) {
  return { number, files: [], section: `### Task ${number}: x`, runs: [], proof: null, design: false };
}

const frame = { goal: 'goal', successCriterion: null, nonGoals: [], context: [], decisions: [], assumptions: [], visualDirection: null };

async function checkpointCommit(root, file, trailer) {
  await commitFiles(root, { [file]: `${trailer}\n` }, `checkpoint: ${trailer}\n\nPlan-checkpoint: ${trailer}`);
  return git(root, 'rev-parse', '--short', 'HEAD');
}

test('a brief names the existing handoff file of its task', async () => {
  const { root } = await landingCheckout();
  const handoff = path.join(root, SCRATCH_FOLDER, 'handoff-task-1.md');
  await fs.mkdir(path.dirname(handoff), { recursive: true });
  await fs.writeFile(handoff, 'left off at step 2\n');
  assert.match(taskBrief(briefTask(1), frame, root), new RegExp(`^Handoff: .*${handoff}`, 'm'));
  assert.doesNotMatch(taskBrief(briefTask(2), frame, root), /^Handoff:/m);
});

test('a brief names the latest Plan-checkpoint commit of its task only', async () => {
  const { root } = await landingCheckout();
  await checkpointCommit(root, 'one.txt', 'demo/1');
  const second = await checkpointCommit(root, 'two.txt', 'demo/1');
  await checkpointCommit(root, 'three.txt', 'demo/2');
  assert.match(taskBrief(briefTask(1), frame, root), new RegExp(`^Plan-checkpoint: ${second}$`, 'm'));
});

test('a brief with no handoff and no checkpoint names neither', async () => {
  const { root } = await landingCheckout();
  const brief = taskBrief(briefTask(1), frame, root);
  assert.doesNotMatch(brief, /^Handoff:/m);
  assert.doesNotMatch(brief, /^Plan-checkpoint:/m);
});
