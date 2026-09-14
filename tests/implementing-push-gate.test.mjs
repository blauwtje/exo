// `implementing` stays model-invocable, so a push must wait for the user's
// answer to the tail question. The one exception is a release run, and the
// skill enters it only when the plan's `Branch:` names the default branch and
// the root CLAUDE.md or AGENTS.md commits and releases there. The model judges
// that instruction by reading it; no pattern matches it, so this test guards
// the skill text that states the gate, not a run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const SKILL = fs.readFileSync(new URL('../skills/implementing/SKILL.md', import.meta.url), 'utf8');

function loopStep(number) {
  const step = SKILL.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('a plan branch other than the default is created without a push', () => {
  const branchStep = loopStep(1);
  assert.ok(branchStep.includes("On the default branch while `Branch:` names another, `git switch -c <Branch:>`; the first push waits for the tail's pull-request answer."));
  assert.ok(!branchStep.includes('git push'), 'step 1 runs no push');
});

test('only a default-branch plan in a repository that releases there becomes a release run', () => {
  const branchStep = loopStep(1);
  assert.ok(branchStep.includes("On the default branch while `Branch:` names it too, read the root `CLAUDE.md` or `AGENTS.md`: when it states both that work is committed on the default branch and that this session runs its release steps there, stay there and treat the run as a release run"));
  assert.ok(branchStep.includes('otherwise branch as `<type>/<slug>`'), 'a repository without release instructions gets a branch');
});

test('a green task commits and pushes nothing', () => {
  const commitStep = loopStep(6);
  assert.ok(commitStep.includes('push nothing'));
  assert.ok(!commitStep.includes('git push'), 'step 6 runs no push');
});

test('the tail pushes only after the question, except on a release run', () => {
  const tailStep = loopStep(7);
  const questionStart = tailStep.indexOf('Any other run asks one question');
  const firstPush = tailStep.indexOf('git push');
  assert.ok(questionStart !== -1, 'the tail asks a question outside a release run');
  assert.ok(firstPush > questionStart, 'no push is named before the question');
  assert.ok(tailStep.includes('push and open the pull request; push and stop; or keep the branch local'));
  assert.ok(tailStep.includes('A release run then follows the repository\'s release steps in order, pushing where they push, and asks no pull-request question.'));
});

test('the authorization line grants no push before the tail answer and no merge', () => {
  const authorization = SKILL.match(/^Invoking `\/exo:implementing` on a plan authorizes .+$/m);
  assert.ok(authorization, 'the authorization line exists');
  assert.ok(authorization[0].includes('a push or a pull request only after your answer to the tail question'));
  assert.ok(!authorization[0].includes('merge'), 'implementing grants no merge');
});
