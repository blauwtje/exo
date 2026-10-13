import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINAL_PHASES as MOD_FINAL_PHASES, register } from '../hooks/run-watch.mjs';
import { FINAL_PHASES, phaseForExit } from '../skills/build/scripts/run-state.mjs';

function makeState(fields) {
  return { phase: 'build', task: { n: 2, subject: 'add log' }, landed: 1, total: 5, startedAt: '2026-10-13T10:00:00Z', updatedAt: '2999-01-01T00:00:00Z', ...fields };
}

function makeHarness(states) {
  const calls = { timers: [], statuses: [], prompts: [] };
  const handlers = {};
  const $ = {
    clock: { every: (ms, tick) => calls.timers.push({ ms, tick }) },
    session: { root: async () => '/repo' },
    fs: {
      list: async () => Object.keys(states).map((name) => ({ name, kind: 'dir' })),
      read: async (file) => JSON.stringify(states[file.split('/').at(-2)])
    },
    ui: { status: (text) => calls.statuses.push(text) },
    prompt: { submit: async (message) => calls.prompts.push(message.text) }
  };
  register((name, handler) => {
    handlers[name] = handler;
  });
  return { calls, $, start: (e) => handlers['session.start'](e, $, (event) => event) };
}

test('no timer starts when the session is not interactive', async () => {
  const harness = makeHarness({});
  await harness.start({ isInteractive: false });
  assert.deepEqual(harness.calls.timers, []);
});

test('an interactive session starts a five second tick and passes the event on', async () => {
  const harness = makeHarness({});
  const event = { isInteractive: true };
  assert.equal(await harness.start(event), event);
  assert.deepEqual(harness.calls.timers.map((timer) => timer.ms), [5000]);
});

test('the status shows the newest active run, then clears', async () => {
  const states = { 'run-a': makeState({}) };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.match(harness.calls.statuses[0], /^exo ▸ task 2\/5 add log · 1 landed · \d+m$/);
  states['run-a'] = makeState({ phase: 'passed' });
  await tick();
  assert.equal(harness.calls.statuses[1], undefined);
});

test('a run moving to a final phase wakes the lead once; a run final on the first tick does not', async () => {
  const states = {
    'run-a': makeState({}),
    'run-b': makeState({ phase: 'stopped', reason: 'old stop' })
  };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.deepEqual(harness.calls.prompts, []);
  states['run-a'] = makeState({ phase: 'stopped', reason: 'task 2 blocked' });
  await tick();
  await tick();
  assert.equal(harness.calls.prompts.length, 1);
  assert.match(harness.calls.prompts[0], /run-a/);
  assert.match(harness.calls.prompts[0], /stopped/);
  assert.match(harness.calls.prompts[0], /task 2 blocked/);
  assert.match(harness.calls.prompts[0], /follow exo:build references\/run-loop\.md to repair and resume/i);
});

test('a landed run asks the lead to report the result', async () => {
  const states = { 'run-a': makeState({}) };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  states['run-a'] = makeState({ phase: 'landed' });
  await tick();
  assert.match(harness.calls.prompts[0], /report the result to the user/i);
  assert.doesNotMatch(harness.calls.prompts[0], /run-loop/);
});

test('a run last updated before the session started is ignored', async () => {
  const states = { 'run-a': makeState({ updatedAt: '2000-01-01T00:00:00Z' }) };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.equal(harness.calls.statuses[0], undefined);
});

test('the mod copy of FINAL_PHASES equals run-state FINAL_PHASES', () => {
  assert.deepEqual(MOD_FINAL_PHASES, FINAL_PHASES);
});

test('phaseForExit maps each run-plan exit code to one run phase', () => {
  assert.equal(phaseForExit(0), 'passed');
  assert.equal(phaseForExit(2), 'refused');
  assert.equal(phaseForExit(3), 'parked');
  assert.equal(phaseForExit(1), 'stopped');
});
