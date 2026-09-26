// A wave builds independent plan tasks together, each in a worktree the run
// creates and removes. The model follows these rules by reading them, so this
// test guards the skill text that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const WORKSPACE = read('run-plan/references/workspace.md');
const WAVE_WORKTREES = read('run-plan/references/wave-worktrees.md');
const IMPLEMENTER_BRIEF = read('run-plan/implementer-prompt.md');
const IMPLEMENTER_AGENT = fs.readFileSync(new URL('../agents/build-task.md', import.meta.url), 'utf8');

test('the run creates, lands and removes every wave worktree itself', () => {
  assert.ok(!WORKSPACE.includes('## Wave worktrees'), 'the wave section moved out of workspace.md');
  const section = WAVE_WORKTREES;
  assert.ok(section.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(section.includes('`Worktree setup:`'));
  assert.ok(section.includes('git cherry-pick <sha>'));
  assert.ok(section.includes('git cherry-pick --abort'));
  assert.ok(section.includes('git worktree remove "<root>-task-<n>"'));
  assert.ok(section.includes('git worktree list'));
  assert.ok(section.includes('Never dispatch a build with the dispatch tool\'s worktree isolation'), 'a wave builds only in folders the run makes');
  assert.ok(!section.includes('isolated delegate returned'), 'no wave task lands from an isolated delegate');
  assert.ok(!section.includes('git push'), 'a wave pushes nothing');
  assert.ok(!section.includes('git branch'), 'a wave creates and deletes no branch');
});

test('the implementer brief carries only the task fields, and the agent still writes nothing through git', () => {
  assert.ok(IMPLEMENTER_BRIEF.includes('Task <n> of <plan path>, branch <branch>, checkout <checkout>.'));
  assert.ok(IMPLEMENTER_BRIEF.includes('Report to: <report directory>/implementer-<n>.md'));
  assert.ok(!IMPLEMENTER_BRIEF.includes('Hard boundaries:'), 'the rules live in agents/build-task.md');
  assert.ok(IMPLEMENTER_AGENT.includes('start every command with `cd <checkout> &&`'));
  assert.ok(IMPLEMENTER_AGENT.includes('Never create a worktree, never switch, stash or reset.'));
  assert.ok(IMPLEMENTER_AGENT.includes('`push`, `worktree`, and no `gh` command at all'));
  assert.ok(IMPLEMENTER_AGENT.includes('Never call a tool that enters or leaves a worktree'));
  assert.ok(IMPLEMENTER_AGENT.includes('- Run no writing git,'), 'the agent commits nothing, inside a wave or not');
  assert.ok(!IMPLEMENTER_BRIEF.includes('Wave:'), 'no dispatch sends the agent a wave to commit in');
  assert.ok(!IMPLEMENTER_BRIEF.includes('Your brief:'), 'the brief is named by path, never pasted');
});

const SKILL = read('run-plan/SKILL.md');

function loopStep(number) {
  const step = SKILL.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('step 3 forms a wave only from the plan, four tasks at most', () => {
  const landedStep = loopStep(3);
  assert.ok(landedStep.includes('`Worktree setup:`'));
  assert.ok(landedStep.includes('four at most'));
  assert.ok(landedStep.includes('whose `Files:` paths share none with a task already in it'));
});

test('a wave builds in worktrees and lands in plan order or not at all', () => {
  const dispatchStep = loopStep(5);
  assert.ok(dispatchStep.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(dispatchStep.includes('in one message'));
  const commitStep = loopStep(6);
  assert.ok(commitStep.includes('only when every report in it is green'));
  assert.ok(commitStep.includes('`git cherry-pick <sha>` brings the commits onto the branch in plan order'));
  assert.ok(commitStep.includes('no task of it commits'));
  const authorization = SKILL.match(/^Invoking `\/exo:run-plan` on a plan authorizes .+$/m);
  assert.ok(authorization[0].includes("a wave's temporary worktrees beside it"));
});

test('the plan basis is where a plan allows waves', () => {
  const specification = read('draft-plan/references/plan-spec.md');
  assert.ok(specification.includes('`Worktree setup: <command>`'));
  assert.ok(specification.includes('`Worktree setup: none`'));
  assert.ok(specification.includes('without the line the run builds one task at a time'));
});
