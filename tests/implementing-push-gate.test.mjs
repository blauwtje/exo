// `implementing` stays model-invocable, so the run commits only where the
// workspace question placed it and pushes only after the finish question. The
// model follows these rules by reading them; no pattern matches a run, so this
// test guards the skill text that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const SKILL = read('implementing/SKILL.md');
const WORKSPACE = read('implementing/references/workspace.md');
const FINISHING = read('implementing/references/finishing.md');

function loopStep(number) {
  const step = SKILL.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('step 1 settles the workspace before any dispatch and pushes nothing', () => {
  const branchStep = loopStep(1);
  assert.ok(branchStep.includes('settle where the run commits as `references/workspace.md` says, before any dispatch'));
  assert.ok(!branchStep.includes('git push'), 'step 1 runs no push');
  assert.ok(!branchStep.includes('release run'), 'no release run bypasses the question');
});

test('the workspace question offers a branch, a worktree and the current branch, in that order', () => {
  const branch = WORKSPACE.indexOf('(1) Branch (Recommended):');
  const worktree = WORKSPACE.indexOf('(2) Worktree:');
  const current = WORKSPACE.indexOf('(3) Current branch:');
  assert.ok(branch !== -1 && branch < worktree && worktree < current);
  assert.ok(!WORKSPACE.includes('git push'), 'the workspace step pushes nothing');
});

test('a green task commits and pushes nothing', () => {
  const commitStep = loopStep(6);
  assert.ok(commitStep.includes('push nothing'));
  assert.ok(!commitStep.includes('git push'), 'step 6 runs no push');
});

test('the tail pushes only through the finish question', () => {
  const tailStep = loopStep(7);
  assert.ok(tailStep.includes('`references/finishing.md`'));
  assert.ok(!tailStep.includes('git push'), 'step 7 names no push of its own');
  const question = FINISHING.indexOf('## The question');
  const firstPush = FINISHING.indexOf('git push');
  assert.ok(question !== -1 && firstPush > question, 'no push is named before the question');
  assert.ok(FINISHING.includes('(1) Open PR (Recommended):'));
  assert.ok(FINISHING.includes('(3) Keep local:'));
});

test('the authorization line grants no push before the finish answer and no merge', () => {
  const authorization = SKILL.match(/^Invoking `\/exo:implementing` on a plan authorizes .+$/m);
  assert.ok(authorization, 'the authorization line exists');
  assert.ok(authorization[0].includes('a push or a pull request only after your answer to the finish question'));
  assert.ok(!authorization[0].includes('merge'), 'implementing grants no merge');
});

test('implementing-batch and debug settle the workspace and end on the finish question', () => {
  for (const skill of ['implementing-batch', 'debug']) {
    const text = read(`${skill}/SKILL.md`);
    assert.ok(text.includes('`../implementing/references/workspace.md`'), `${skill} names the workspace step`);
    assert.ok(text.includes('`../implementing/references/finishing.md`'), `${skill} names the finish step`);
    assert.ok(!text.includes('git push'), `${skill} runs no push of its own`);
  }
});
