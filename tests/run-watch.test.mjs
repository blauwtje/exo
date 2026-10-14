import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FINAL_PHASES as MOD_FINAL_PHASES, register } from '../hooks/run-watch.mjs';
import { FINAL_PHASES, phaseForExit } from '../skills/build/scripts/run-state.mjs';

function makeState(fields) {
  return { phase: 'build', task: { n: 2, subject: 'add log' }, landed: 1, total: 5, startedAt: '2026-10-13T10:00:00Z', updatedAt: '2999-01-01T00:00:00Z', ...fields };
}

function makeFs({ root, main, gitText, states, mainStates, mtimeMs, lists }) {
  const runBases = { [`${main}/.exo/run`]: mainStates, [`${root}/.exo/run`]: states };
  return {
    list: async (path) => {
      lists.push(path);
      const runs = runBases[path];
      if (runs) return Object.keys(runs).map((name) => ({ name, kind: 'dir' }));
      return [{ name: 'run.log', kind: 'file', mtimeMs }];
    },
    read: async (file) => {
      if (file.endsWith('/.git')) {
        if (gitText === undefined) throw new Error('ENOENT');
        return gitText;
      }
      const runId = file.split('/').at(-2);
      return JSON.stringify(file.startsWith(`${root}/`) ? states[runId] : mainStates[runId]);
    }
  };
}

function makeHarness(states, options = {}) {
  const { root = '/repo', main = '/repo', gitText, mainStates = {}, mtimeMs = Date.now(), clockNow = () => Date.now() } = options;
  const calls = { timers: [], lines: [], prompts: [], lists: [] };
  const handlers = {};
  const matchers = {};
  const renders = [];
  const renderHint = async () => {
    if (matchers['ui.render']?.component !== 'PromptHint') return undefined;
    const drawn = await handlers['ui.render']($, { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } }, (event) => event);
    return drawn.props.tail;
  };
  const $ = {
    clock: {
      every: (ms, tick) => calls.timers.push({ ms, tick: async () => {
        await tick();
        calls.lines.push(...(await Promise.all(renders.splice(0))));
      } }),
      now: async () => clockNow()
    },
    session: { root: async () => root },
    fs: makeFs({ root, main, gitText, states, mainStates, mtimeMs, lists: calls.lists }),
    ui: { invalidate: (event) => event === 'ui.render' && renders.push(renderHint()) },
    prompt: { submit: async (message) => calls.prompts.push(message.text) }
  };
  register((name, ...args) => {
    handlers[name] = args.at(-1);
    if (args.length > 1) matchers[name] = args[0];
  });
  const fire = (name, e = {}) => handlers[name]?.($, e, (event) => event);
  return { calls, $, fire, start: (e) => handlers['session.start']($, e, (event) => event) };
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

test('the prompt hint tail shows the newest active run, then clears', async () => {
  const states = { 'run-a': makeState({}) };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.match(harness.calls.lines[0], /^▰▱{7} {2}1 of 5 {2}· {2}\d+:\d{2}$/);
  states['run-a'] = makeState({ phase: 'passed' });
  await tick();
  assert.equal(harness.calls.lines.length, 2);
  assert.equal(harness.calls.lines[1], undefined);
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

test('a stop seen while the lead is busy and resumed before the turn ends sends no stop prompt', async () => {
  const states = { 'run-a': makeState({}) };
  const harness = makeHarness(states);
  let runLog = '[09:30:00] run start: plan.md, branch exo/run-a, 5 tasks (4 to build)\n';
  const readState = harness.$.fs.read;
  harness.$.fs.read = async (file) => (file.endsWith('/run.log') ? runLog : readState(file));
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  await harness.fire('turn.start');
  states['run-a'] = makeState({ phase: 'stopped', reason: 'task 2 blocked' });
  runLog += '[09:36:00] run stopped: task 2 blocked\n';
  await tick();
  runLog += '[09:37:22] run start: plan.md, branch exo/run-a, 5 tasks (3 to build)\n';
  await harness.fire('turn.complete');
  await tick();
  assert.deepEqual(harness.calls.prompts, []);
});

test('a stop a wait already reported while the lead is busy sends no stop prompt', async () => {
  const states = { 'run-a': makeState({}) };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  await harness.fire('turn.start');
  states['run-a'] = makeState({ phase: 'stopped', reason: 'task 2 blocked' });
  await tick();
  await harness.fire('session.receive', { origin: { kind: 'task-notification' }, text: 'exo: run run-a stopped; report /repo/.exo/run/run-a/report.md' });
  await harness.fire('turn.complete');
  await tick();
  assert.deepEqual(harness.calls.prompts, []);
});

test('a real stop while idle prompts once; a real stop while busy prompts once after the turn ends', async () => {
  const states = { 'run-a': makeState({}), 'run-b': makeState({}) };
  const harness = makeHarness(states);
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  states['run-a'] = makeState({ phase: 'stopped', reason: 'task 2 blocked' });
  await tick();
  await tick();
  assert.equal(harness.calls.prompts.length, 1);
  assert.match(harness.calls.prompts[0], /run-a ended stopped: task 2 blocked/);
  await harness.fire('turn.start');
  states['run-b'] = makeState({ phase: 'stopped', reason: 'task 3 blocked' });
  await tick();
  assert.equal(harness.calls.prompts.length, 1);
  await harness.fire('turn.complete');
  await tick();
  assert.equal(harness.calls.prompts.length, 2);
  assert.match(harness.calls.prompts[1], /run-b ended stopped: task 3 blocked/);
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

test('an active run updated before the session started still shows its line', async () => {
  const harness = makeHarness({ 'run-a': makeState({ updatedAt: '2000-01-01T00:00:00Z' }) });
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.match(harness.calls.lines[0], /^▰▱{7} {2}1 of 5/);
});

test('a non-final run whose run directory is over an hour old shows no line', async () => {
  const harness = makeHarness({ 'run-a': makeState({}) }, { mtimeMs: Date.now() - 3600001 });
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.deepEqual(harness.calls.lines, [undefined]);
});

test('a worktree session shows a main checkout run whose runRoot is that worktree', async () => {
  const harness = makeHarness({}, {
    root: '/repo/.worktrees/x',
    gitText: 'gitdir: /repo/.git/worktrees/x\n',
    mainStates: { 'run-main': makeState({ landed: 3, runRoot: '/repo/.worktrees/x' }) }
  });
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  assert.ok(harness.calls.lists.includes('/repo/.worktrees/x/.exo/run'));
  assert.ok(harness.calls.lists.includes('/repo/.exo/run'));
  assert.match(harness.calls.lines[0], /3 of 5/);
});

for (const { name, root, main, gitText } of [
  { name: 'a backslash gitdir', root: 'C:/repo/.worktrees/x', main: 'C:/repo', gitText: 'gitdir: C:\\repo\\.git\\worktrees\\x\n' },
  { name: 'a relative gitdir', root: '/repo/.worktrees/x', main: '/repo', gitText: 'gitdir: ../../.git/worktrees/x\n' }
]) {
  test(`a worktree session with ${name} shows a main checkout run whose runRoot is that worktree`, async () => {
    const harness = makeHarness({}, { root, main, gitText, mainStates: { 'run-main': makeState({ landed: 3, runRoot: root }) } });
    await harness.start({ isInteractive: true });
    const [{ tick }] = harness.calls.timers;
    await tick();
    assert.ok(harness.calls.lists.includes(`${main}/.exo/run`));
    assert.match(harness.calls.lines[0], /3 of 5/);
  });
}

// The run line format the user picked: an 8-cell bar, landed of total, elapsed H:MM.
function expectedElapsed(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function expectedLine({ landed, total, minutes }) {
  const filled = Math.floor((landed / total) * 8);
  return `${'▰'.repeat(filled)}${'▱'.repeat(8 - filled)}  ${landed} of ${total}  ·  ${expectedElapsed(minutes)}`;
}

const STARTED = Date.parse('2026-10-13T10:00:00Z');
const SEVEN_OF_EIGHT = { landed: 7, total: 8, startedAt: new Date(STARTED).toISOString() };

for (const minutes of [42, 648]) {
  test(`the run line reads ${expectedLine({ landed: 7, total: 8, minutes })} after ${minutes} minutes, drawn as the prompt hint tail`, async () => {
    const harness = makeHarness({ 'run-a': makeState(SEVEN_OF_EIGHT) }, { clockNow: () => STARTED + minutes * 60000 });
    await harness.start({ isInteractive: true });
    await harness.calls.timers[0].tick();
    assert.deepEqual(harness.calls.lines, [expectedLine({ landed: 7, total: 8, minutes })]);
  });
}

test('the elapsed time follows the session clock on each tick while the run state stays unchanged', async () => {
  let now = STARTED + 42 * 60000;
  const harness = makeHarness({ 'run-a': makeState(SEVEN_OF_EIGHT) }, { clockNow: () => now });
  await harness.start({ isInteractive: true });
  const [{ tick }] = harness.calls.timers;
  await tick();
  now += 61 * 60000;
  await tick();
  assert.deepEqual(harness.calls.lines.map((line) => line?.split('  ·  ').at(-1)), [expectedElapsed(42), expectedElapsed(103)]);
});

test('a worktree session does not show a main checkout run started for another root', async () => {
  const harness = makeHarness({}, {
    root: '/repo/.worktrees/x',
    gitText: 'gitdir: /repo/.git/worktrees/x\n',
    mainStates: { 'run-main': makeState({ landed: 3 }), 'run-y': makeState({ landed: 4, runRoot: '/repo/.worktrees/y' }) }
  });
  await harness.start({ isInteractive: true });
  await harness.calls.timers[0].tick();
  assert.deepEqual(harness.calls.lines, [undefined]);
});

test('a worktree session shows its own run, not a newer run of the main checkout', async () => {
  const harness = makeHarness({ '20261013T100000-aaaa': makeState({ landed: 2 }) }, {
    root: '/repo/.worktrees/x',
    gitText: 'gitdir: /repo/.git/worktrees/x\n',
    mainStates: { '20261013T110000-bbbb': makeState({ landed: 3 }) }
  });
  await harness.start({ isInteractive: true });
  await harness.calls.timers[0].tick();
  assert.match(harness.calls.lines[0] ?? '', / 2 of 5 /);
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
