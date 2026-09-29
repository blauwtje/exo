// A wave builds independent plan tasks together, each in a worktree the run
// creates and removes. The model follows these rules by reading them, so this
// test guards the skill text that states them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { nextWave } from '../lib/plan-tasks.mjs';

const read = (relative) => fs.readFileSync(new URL(`../skills/${relative}`, import.meta.url), 'utf8');
const WORKSPACE = read('build/references/workspace.md');
const WAVE_WORKTREES = read('build/references/wave-worktrees.md');
const IMPLEMENTER_BRIEF = read('build/implementer-prompt.md');
const IMPLEMENTER_AGENT = fs.readFileSync(new URL('../agents/build-task.md', import.meta.url), 'utf8');

test('the run creates, lands and removes every wave worktree itself', () => {
  assert.ok(!WORKSPACE.includes('## Wave worktrees'), 'the wave section moved out of workspace.md');
  const section = WAVE_WORKTREES;
  assert.ok(section.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(section.includes('`Worktree setup:`'));
  assert.ok(!section.includes('run_in_background'), 'the lead demands no foreground flag on a wave dispatch');
  assert.ok(section.includes('git cherry-pick <sha>'));
  assert.ok(section.includes('git cherry-pick --abort'));
  assert.ok(section.includes('remove-worktree.mjs" --worktree "<root>-task-<n>" --run <root>'));
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

test('the build session\'s own dispatch adds `Return: one line`, and the agent answers with a diff and log pointer', () => {
  assert.ok(IMPLEMENTER_BRIEF.includes('`Return: one line`'), 'the field is named in the prompt file');
  assert.ok(IMPLEMENTER_BRIEF.includes('run-loop.md` step 5'), 'only the direct dispatch adds the field');
  assert.ok(IMPLEMENTER_BRIEF.includes('run-unit'), 'run-unit keeps the report-pasting return');
  assert.ok(IMPLEMENTER_AGENT.includes('Task <n>: GREEN | diff: <diff path> | log: <log path>'));
  assert.ok(IMPLEMENTER_AGENT.includes('Task <n>: <BLOCKED, PLAN DRIFT or FAIL> <what stopped, one clause> | diff: <diff path> | log: <log path>'));
});

const RUN_LOOP = read('build/references/run-loop.md');
const UNIT_AGENT = fs.readFileSync(new URL('../agents/run-unit.md', import.meta.url), 'utf8');

function loopStep(number, text = RUN_LOOP) {
  const step = text.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

test('run-loop step 5 reads the diff itself and hands a stop\'s report to the repair delegate unread', () => {
  const dispatchStep = loopStep(5);
  assert.ok(dispatchStep.includes('carries `Return: one line`'));
  assert.ok(dispatchStep.includes('reads itself, never the report'));
  assert.ok(dispatchStep.includes('hands its report path, unread, to a repair delegate'));
});

test('a wave comes only from next-task.mjs, which needs `Worktree setup:`, four tasks at most, disjoint `Files:`', () => {
  const askStep = loopStep(1, UNIT_AGENT);
  assert.ok(askStep.includes('Run `node "<skill>/scripts/next-task.mjs" --plan <plan> --root <checkout>` and read its `Landed:` line and its `Next:` or `Wave:` line'));
  assert.ok(loopStep(2, UNIT_AGENT).includes("**Take the task from the script's output**, never from the plan file"));
  const task = (number, path) => ({ number, dependsOn: [], design: false, files: path ? [{ path }] : [] });
  const disjoint = [1, 2, 3, 4, 5].map((number) => task(number, `src/file-${number}.mjs`));
  assert.deepEqual(nextWave(disjoint, [], null).map((t) => t.number), [1], 'no `Worktree setup:`, no wave');
  assert.deepEqual(nextWave(disjoint, [], 'npm ci').map((t) => t.number), [1, 2, 3, 4], 'four at most');
  const shared = [task(1, 'src/a.mjs'), task(2, 'src/a.mjs'), task(3, 'src/b.mjs'), task(4, 'src/c.mjs')];
  assert.deepEqual(nextWave(shared, [], 'npm ci').map((t) => t.number), [1, 3, 4], 'a task sharing a `Files:` path stays out');
});

test('a unit wave builds in worktrees and keeps each green task per wave-worktrees.md', () => {
  const dispatchStep = loopStep(3, UNIT_AGENT);
  assert.ok(dispatchStep.includes('a wave builds per `<skill>/references/wave-worktrees.md`'), 'the reference owns the wave');
  assert.ok(WAVE_WORKTREES.includes('git worktree add --detach "<root>-task-<n>" HEAD'));
  assert.ok(dispatchStep.includes('in one message'));
  const commitStep = loopStep(4, UNIT_AGENT);
  assert.ok(commitStep.includes("A wave lands and removes its worktrees per that reference's steps 3 and 4"));
  assert.ok(commitStep.includes('its failed task goes back through step 3'));
  assert.ok(!commitStep.includes('only when every report in it is green'), 'no unit wave waits on every report');
  assert.ok(!commitStep.includes('no task of it commits'), 'a failed sibling costs no green task');
  assert.ok(!UNIT_AGENT.includes('git cherry-pick'), 'the landing command has one owner');
  assert.ok(WAVE_WORKTREES.includes('a failed sibling never discards a green task: for each green task in plan order'));
  assert.ok(WAVE_WORKTREES.includes('on the run branch `git cherry-pick <sha>`'));
  const authorization = loopStep(1).match(/Invoking build authorizes [^.]+\./);
  assert.ok(authorization[0].includes("a wave's worktrees beside it"));
});

test('the plan basis is where a plan allows waves', () => {
  const specification = read('spec/references/task-list.md');
  assert.ok(specification.includes('`Worktree setup: <command>`'));
  assert.ok(specification.includes('`Worktree setup: none`'));
  assert.ok(specification.includes('without the line the run builds one task at a time'));
});


test('a wave stops and lands nothing when it dirties the run\'s checkout', () => {
  const section = WAVE_WORKTREES;
  assert.ok(section.includes("record `git -C <root> status --porcelain` as this wave's baseline"), 'step 1 records the baseline before dispatch');
  assert.ok(section.includes("First run `git -C <root> status --porcelain` again and compare it with step 1's baseline"), 'step 3 checks it again before landing');
  assert.ok(section.includes('stop, show the listed paths, land nothing from this wave'), 'a dirtied checkout lands nothing');
  assert.ok(section.includes('go to step 4, which force-removes it as a discarded wave'), 'the worktrees are still removed');
  assert.ok(section.includes("excluded by `lib/scratch-exclude.mjs`"), '.exo/ never counts as dirt');
});

test('a wave lands each green task past a failed sibling and saves every diff before a worktree goes', () => {
  const section = WAVE_WORKTREES;
  assert.ok(section.includes('a failed sibling never discards a green task: for each green task in plan order'), 'a failed sibling costs no green task');
  assert.ok(section.includes('diff --cached <base> > "<root>-task-<n>/.exo/task-<n>.patch"'), 'the diff lands in the .exo/ remove-worktree.mjs copies');
  assert.ok(section.includes('and only after its patch is written'), '--force waits for the saved diff');
  assert.ok(section.includes('a folder whose diff is unsaved is never force-removed'));
  assert.ok(!section.includes('With every report green'), 'no wave waits on every report before landing');
});

const BUILD_SKILL = read('build/SKILL.md');
const NEXT_TASK_CALL = 'node "${CLAUDE_SKILL_DIR}/scripts/next-task.mjs" --plan <plan> --root <checkout>';

test('the at-most-eight route asks next-task.mjs for a wave, never one task at a time', () => {
  const askStep = loopStep(3);
  assert.ok(askStep.includes(NEXT_TASK_CALL));
  assert.ok(!askStep.includes('--one'), 'a printed wave reaches step 5 whole');
  assert.ok(askStep.includes('`Route:` picks step 5\'s route'), 'the printed route, not a Wave: line, picks the dispatch');
  assert.ok(!RUN_LOOP.includes('--one'));
});

test('the at-most-eight route builds a printed wave per wave-worktrees.md and keeps every green task', () => {
  const dispatchStep = loopStep(5);
  assert.ok(dispatchStep.includes('`Wave:` line'), 'a Wave: line is handled');
  assert.ok(dispatchStep.indexOf('`Route: unit`: **dispatch the unit**, never build a `Wave:` here.') < dispatchStep.indexOf('`Route: direct`: a `Next:` line'), 'the unit route precedes the direct recipe');
  assert.ok(dispatchStep.indexOf('`Route: unit`') !== -1);
  assert.ok(dispatchStep.includes('per the wave worktrees reference'), 'the wave is built per its reference, which SKILL.md links');
  assert.ok(dispatchStep.includes('one message'), 'the wave builds in parallel');
  assert.ok(dispatchStep.includes('a failed sibling never discards a green task'));
  assert.ok(dispatchStep.includes("That reference's step 4 saves each worktree's diff, then removes it"), 'the diff is saved before the worktree goes');
  assert.ok(!RUN_LOOP.includes('diff --cached'), 'the save command has one owner');
  assert.ok(WAVE_WORKTREES.includes('diff --cached <base> > "<root>-task-<n>/.exo/task-<n>.patch"'));
  assert.ok(WAVE_WORKTREES.includes('the patch counts as written only once `test -s` finds it non-empty'), 'a saved diff is confirmed non-empty');
  assert.ok(WAVE_WORKTREES.includes('a folder whose diff is unsaved is never force-removed'));
});

test('the build table names the loop as the wave reference\'s reader, and run-loop.md\'s lock follows it down', async () => {
  const row = BUILD_SKILL.split('\n').find((line) => line.startsWith('| `references/wave-worktrees.md`'));
  assert.ok(row, 'the table keeps its wave row');
  assert.ok(!row.includes('Never here'), 'the wave reference is no longer unread by the loop');
  assert.ok(row.includes('run-loop.md'), 'the row names the loop as its reader');
  assert.ok(row.includes('under `Route: direct`'), 'only the direct route reads the wave reference');
  const { REFERENCE_TOKEN_LOCKS } = await import('#budgets');
  const tokens = Math.round(Buffer.byteLength(RUN_LOOP) / 4);
  assert.equal(REFERENCE_TOKEN_LOCKS['skills/build/references/run-loop.md'], tokens);
  assert.ok(tokens <= 925, 'the lock never rises');
});
