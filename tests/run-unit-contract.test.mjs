// Pins the return contract between build and its exo:run-unit agent: a unit
// ends its turn only when every block task is LANDED or BLOCKED, or with a
// BUDGET line at the hard budget message, and the caller reads a BUDGET line as
// unfinished work whose landed part only the branch knows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const RUN_LOOP = fs.readFileSync(new URL('../skills/build/references/run-loop.md', import.meta.url), 'utf8');
const UNIT_AGENT = fs.readFileSync(new URL('../agents/run-unit.md', import.meta.url), 'utf8');
const BUDGETS = JSON.parse(fs.readFileSync(new URL('../skills/show-savings/assets/delegate-budgets.json', import.meta.url), 'utf8'));

function loopStep(number, text) {
  const step = text.match(new RegExp(`^${number}\\. \\*\\*.+$`, 'm'));
  assert.ok(step, `step ${number} exists`);
  return step[0];
}

function section(text, heading) {
  const start = text.indexOf(`## ${heading}\n`);
  assert.ok(start !== -1, `## ${heading} exists`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

test('the unit dispatches every build in the foreground, a wave still in one message', () => {
  const dispatchStep = loopStep(3, UNIT_AGENT);
  assert.ok(dispatchStep.includes('Each build goes to the `exo:build-task` agent with `run_in_background: false`'));
  assert.ok(dispatchStep.includes('in one message, so they run in parallel and this agent waits for all'));
});

test('the unit ends its turn only with every block task LANDED or BLOCKED, or at the hard budget message', () => {
  const stop = section(UNIT_AGENT, 'Stop');
  assert.ok(stop.includes('Your turn ending is your return: never end it while a block task lacks a `LANDED` or `BLOCKED` line'));
  assert.ok(stop.includes('Only the hard message, `past the limit of`, ends the loop'));
  assert.ok(loopStep(4, UNIT_AGENT).includes('until every block task has a `LANDED` or `BLOCKED` line'));
});

test('the unit returns LANDED or BLOCKED per task, never OPEN, and never BUDGET as a completion report', () => {
  const unitReturn = section(UNIT_AGENT, 'Return');
  assert.ok(unitReturn.includes('`LANDED <n> <sha>`'));
  assert.ok(unitReturn.includes('`BLOCKED <n> <reason or question for the user>`'));
  assert.ok(unitReturn.includes('With every block task landed or blocked, return these lines, never a `BUDGET:` line'));
  assert.doesNotMatch(UNIT_AGENT, /`OPEN/);
});

test('each former OPEN case in the unit becomes a BLOCKED line', () => {
  assert.ok(loopStep(1, UNIT_AGENT).includes('return each `BLOCKED <n> waits on <m>`'));
  assert.ok(loopStep(2, UNIT_AGENT).includes('is returned `BLOCKED <n> Design: task`'));
  assert.ok(loopStep(3, UNIT_AGENT).includes('a second drift or failure on one task returns it `BLOCKED` with both report paths and two or three options'));
});

test('build forms no block around an unlanded dependency outside it', () => {
  assert.ok(loopStep(4, RUN_LOOP).includes('ending before a `Design:` task or an unlanded `Depends on:` outside the block'));
});

test('build dispatches in the background, ends the turn, and never polls while a return is outstanding', () => {
  const dispatchStep = loopStep(5, RUN_LOOP);
  assert.ok(dispatchStep.startsWith('5. **Dispatch.** After the dispatch message, end the turn; each completion notification resumes it.'), 'step 5 ends the turn on dispatch');
  for (const tool of ['ScheduleWakeup', 'ListAgents', 'Monitor', 'sleep']) assert.ok(dispatchStep.includes(tool), `step 5 forbids ${tool}`);
  assert.ok(dispatchStep.includes('never call'), 'the polling tools are forbidden');
  assert.ok(dispatchStep.includes('A wave lands only after every sibling returned'), 'a wave lands after every sibling returned');
  assert.ok(!dispatchStep.includes('run_in_background'), 'the lead demands no foreground flag');
  assert.ok(UNIT_AGENT.includes('`run_in_background: false`'), 'run-unit still dispatches build-task in the foreground');
  assert.ok(dispatchStep.includes('a `Wave:` line each task'));
  const routeStep = loopStep(6, RUN_LOOP);
  for (const line of ['`LANDED`', '`BUDGET:`', '`BLOCKED`']) assert.ok(routeStep.includes(line), `step 6 routes a ${line} return`);
  assert.doesNotMatch(RUN_LOOP, /`OPEN`/);
});

test('build reads a BUDGET return as unfinished and asks the branch what landed', () => {
  const routeStep = loopStep(6, RUN_LOOP);
  assert.ok(routeStep.includes('`BUDGET:` means unfinished, whatever its `done` list says: a fresh unit takes the rest from step 3.'));
  const askStep = loopStep(3, RUN_LOOP);
  assert.ok(askStep.includes('**Ask the branch what landed.**'));
  assert.ok(askStep.includes('Only a `Plan-task:` commit decides what landed, never memory'));
  assert.ok(routeStep.includes('`BLOCKED` with a question runs `node "${CLAUDE_SKILL_DIR}/scripts/resume-plan.mjs" wait`'));
});

test('the run-unit agent has its own budget sized for an eight-task block', () => {
  assert.deepEqual(BUDGETS.agents['exo:run-unit'], { soft: 70, calls: 90 });
});
