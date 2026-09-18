// A wave builds independent plan tasks together, each in a worktree the run
// creates and removes. The model follows these rules by reading them, so this
// test guards the skill text that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const WORKSPACE = read('implementing/references/workspace.md');
const IMPLEMENTER = read('implementing/implementer-prompt.md');

test('the run creates, lands and removes every wave worktree itself', () => {
  const start = WORKSPACE.indexOf('## Wave worktrees');
  const end = WORKSPACE.indexOf('## Judgment');
  assert.ok(start !== -1 && start < end, 'the wave section sits before the judgment ladder');
  const section = WORKSPACE.slice(start, end);
  assert.ok(section.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(section.includes('`Worktree setup:`'));
  assert.ok(section.includes('git cherry-pick <sha>'));
  assert.ok(section.includes('git cherry-pick --abort'));
  assert.ok(section.includes('git worktree remove "<root>-task-<n>"'));
  assert.ok(section.includes('git worktree list'));
  assert.ok(!section.includes('git push'), 'a wave pushes nothing');
  assert.ok(!section.includes('git branch'), 'a wave creates and deletes no branch');
});

test('the implementer brief names its checkout and still writes nothing through git', () => {
  assert.ok(IMPLEMENTER.includes('Task <n> of <plan path>, branch <branch>, checkout <checkout>.'));
  assert.ok(IMPLEMENTER.includes('start every command with `cd <checkout> &&`'));
  assert.ok(IMPLEMENTER.includes('Never create a worktree, never switch, stash or reset.'));
  assert.ok(IMPLEMENTER.includes('Report to: <report directory>/implementer-<n>.md'));
  assert.ok(IMPLEMENTER.includes('`push`, `worktree`, and no `gh` command at all'));
});

const SKILL = read('implementing/SKILL.md');

function loopStep(number) {
  const step = SKILL.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('step 3 forms a wave only from the plan, three tasks at most', () => {
  const landedStep = loopStep(3);
  assert.ok(landedStep.includes('`Worktree setup:`'));
  assert.ok(landedStep.includes('three at most'));
  assert.ok(landedStep.includes('never a guess from paths'));
});

test('a wave builds in worktrees and lands in plan order or not at all', () => {
  const dispatchStep = loopStep(5);
  assert.ok(dispatchStep.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(dispatchStep.includes('in one message'));
  const commitStep = loopStep(6);
  assert.ok(commitStep.includes('only when every report in it is green'));
  assert.ok(commitStep.includes('`git cherry-pick <sha>` brings the commits onto the branch in plan order'));
  assert.ok(commitStep.includes('no task of it commits'));
  const authorization = SKILL.match(/^Invoking `\/exo:implementing` on a plan authorizes .+$/m);
  assert.ok(authorization[0].includes("a wave's temporary worktrees beside it"));
});

test('the plan basis is where a plan allows waves', () => {
  const handoff = read('planning/references/handoff-spec.md');
  assert.ok(handoff.includes('`Worktree setup: <command>`'));
  assert.ok(handoff.includes('`Worktree setup: none`'));
  assert.ok(handoff.includes('without the line the run builds one task at a time'));
});
