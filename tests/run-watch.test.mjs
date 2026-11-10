import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from '../hooks/run-watch.mjs';

const ROOT = '/repo';
const STATE_FILE = `${ROOT}/.exo/run/r1/state.json`;

function runState(phase) {
  return JSON.stringify({ phase, ownerSession: 'me', landed: 1, total: 2, startedAt: new Date().toISOString() });
}

function startHost() {
  const files = { [STATE_FILE]: runState('running'), [`${ROOT}/.exo/run/r1/run.log`]: '' };
  const submitted = [];
  const handlers = {};
  let tick;
  const $ = {
    fs: {
      read: async (file) => {
        if (!(file in files)) throw new Error('missing');
        return files[file];
      },
      list: async (dir) => {
        if (dir !== `${ROOT}/.exo/run`) throw new Error('missing');
        return [{ kind: 'dir', name: 'r1', mtimeMs: Date.now() }];
      },
    },
    session: { root: async () => ROOT, id: () => 'me' },
    agent: { list: async () => [] },
    prompt: { submit: ({ text }) => submitted.push(text) },
    ui: { status() {} },
    clock: { every: (ms, callback) => { tick = callback; }, now: async () => Date.now() },
  };
  register((name, handler) => { handlers[name] = handler; });
  const send = (name, event) => handlers[name]($, event, (passed) => passed);
  return { files, submitted, send, tick: () => tick() };
}

async function endRunWhileBusy(host) {
  await host.send('session.start', { isInteractive: true });
  await host.tick();
  host.files[STATE_FILE] = runState('passed');
  await host.send('turn.start', {});
  await host.tick();
  assert.deepEqual(host.submitted, []);
}

test('a run that ends during a turn wakes the session when the turn completes', async () => {
  const host = startHost();
  await endRunWhileBusy(host);
  await host.send('turn.complete', {});
  assert.equal(host.submitted.length, 1);
  assert.match(host.submitted[0], /exo run r1 ended passed\. Report the result to the user\./);
});

test('a task notification naming the run clears the pending wake', async () => {
  const host = startHost();
  await endRunWhileBusy(host);
  await host.send('session.receive', { origin: { kind: 'task-notification' }, text: 'run r1 finished' });
  await host.send('turn.complete', {});
  assert.deepEqual(host.submitted, []);
});
