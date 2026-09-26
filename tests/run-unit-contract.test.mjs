// Pins the return contract between run-plan and its exo:run-unit agent: a unit
// ends its turn only when every block task is LANDED or BLOCKED, or with a
// BUDGET line at the hard budget message, and the caller reads a BUDGET line as
// unfinished work whose landed part only the branch knows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const SKILL = fs.readFileSync(new URL('../skills/run-plan/SKILL.md', import.meta.url), 'utf8');
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
  assert.match(stop, /A soft `exo budget: .+` note means read nothing new and keep looping/);
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

test('run-plan forms no block around an unlanded dependency outside it', () => {
  assert.ok(loopStep(4, SKILL).includes('ending before the first task with a `Design:` line or one with an unlanded `Depends on:` outside it'));
});

test('run-plan dispatches the unit in the foreground and waits on its return, never a poll', () => {
  const dispatchStep = loopStep(5, SKILL);
  assert.ok(dispatchStep.includes('Each block goes to the `exo:run-unit` agent with `run_in_background: false`'));
  assert.ok(dispatchStep.includes('Wait on its return, one `LANDED` or `BLOCKED` line per task or one `BUDGET:` line, never a commit poll or Monitor'));
  assert.doesNotMatch(SKILL, /`OPEN`/);
});

test('run-plan reads a BUDGET return as unfinished and asks the branch what landed', () => {
  const routeStep = loopStep(6, SKILL);
  assert.ok(routeStep.includes('A `BUDGET:` line means unfinished, whatever its `done` list says: step 3 asks the branch what landed and a fresh unit takes the unlanded rest'));
  assert.ok(routeStep.includes('`BLOCKED` with a question runs `node "${CLAUDE_SKILL_DIR}/scripts/resume-plan.mjs" wait`'));
});

test('the run-unit agent has its own budget sized for an eight-task block', () => {
  assert.deepEqual(BUDGETS.agents['exo:run-unit'], { soft: 70, calls: 90 });
});
