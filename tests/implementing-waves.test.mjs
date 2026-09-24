// A wave builds independent plan tasks together, each in a worktree the run
// creates and removes. The model follows these rules by reading them, so this
// test guards the skill text that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const WORKSPACE = read('implementing/references/workspace.md');
const WAVE_WORKTREES = read('implementing/references/wave-worktrees.md');
const IMPLEMENTER_BRIEF = read('implementing/implementer-prompt.md');
const IMPLEMENTER_AGENT = fs.readFileSync(new URL('../agents/implementer.md', import.meta.url), 'utf8');

test('the run creates, lands and removes every wave worktree itself', () => {
  assert.ok(!WORKSPACE.includes('## Wave worktrees'), 'the wave section moved out of workspace.md');
  const section = WAVE_WORKTREES;
  assert.ok(section.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(section.includes('`Worktree setup:`'));
  assert.ok(section.includes('git cherry-pick <sha>'));
  assert.ok(section.includes('git cherry-pick --abort'));
  assert.ok(section.includes('git worktree remove "<root>-task-<n>"'));
  assert.ok(section.includes('git worktree list'));
  assert.ok(section.includes('`isolation: "worktree"`'), 'an isolated session dispatches wave builds with worktree isolation');
  assert.ok(section.includes('`Commit:` sha an isolated delegate returned'));
  assert.ok(!section.includes('git push'), 'a wave pushes nothing');
  assert.ok(!section.includes('git branch'), 'a wave creates and deletes no branch');
});

test('the implementer brief carries only the task fields, and the agent still writes nothing through git', () => {
  assert.ok(IMPLEMENTER_BRIEF.includes('Task <n> of <plan path>, branch <branch>, checkout <checkout>.'));
  assert.ok(IMPLEMENTER_BRIEF.includes('Report to: <report directory>/implementer-<n>.md'));
  assert.ok(!IMPLEMENTER_BRIEF.includes('Hard boundaries:'), 'the rules live in agents/implementer.md');
  assert.ok(IMPLEMENTER_AGENT.includes('start every command with `cd <checkout> &&`'));
  assert.ok(IMPLEMENTER_AGENT.includes('Never create a worktree, never switch, stash or reset.'));
  assert.ok(IMPLEMENTER_AGENT.includes('`push`, `worktree`, and no `gh` command at all'));
  assert.ok(IMPLEMENTER_AGENT.includes('Never call a tool that enters or leaves a worktree'));
  assert.ok(IMPLEMENTER_AGENT.includes('first run `git switch --detach <its base sha>`'), 'an isolated delegate starts on the run branch commit');
});

const SKILL = read('implementing/SKILL.md');

function loopStep(number) {
  const step = SKILL.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('step 3 forms a wave only from the plan, two tasks at most', () => {
  const landedStep = loopStep(3);
  assert.ok(landedStep.includes('`Worktree setup:`'));
  assert.ok(landedStep.includes('two at most'));
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
  const specification = read('planning/references/plan-spec.md');
  assert.ok(specification.includes('`Worktree setup: <command>`'));
  assert.ok(specification.includes('`Worktree setup: none`'));
  assert.ok(specification.includes('without the line the run builds one task at a time'));
});
