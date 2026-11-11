import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachedPass } from '#check-cache';
import { runCheck } from '../lib/run-check.mjs';
import { wholeSuiteKeys } from '#suite-command';
import { landingCheckout } from './land-task-fixture.mjs';

const PASSING = "node -e \"console.log('ℹ tests 1\\nℹ pass 1\\nℹ fail 0')\"";

test('a passing check is recorded and the next run is cached', async () => {
  const { root } = await landingCheckout();
  const first = runCheck(root, PASSING);
  assert.equal(first.ok, true);
  assert.equal(first.cached, false);
  assert.notEqual(cachedPass(root, PASSING), null);
  assert.equal(runCheck(root, PASSING).cached, true);
});

test('an empty or failing run is never recorded', async () => {
  const { root } = await landingCheckout();
  assert.equal(runCheck(root, 'true').ok, true);
  assert.equal(cachedPass(root, 'true'), null);
  const failing = runCheck(root, 'node -e "process.exit(1)"');
  assert.equal(failing.ok, false);
  assert.equal(cachedPass(root, 'node -e "process.exit(1)"'), null);
});

test('hook keys equal the recorded command', () => {
  for (const command of ['npm run check', 'npm run validate:static', 'node --test', 'npm test']) {
    assert.deepEqual(wholeSuiteKeys(command), [command]);
  }
});

test('a retry run with record off never records a pass', async () => {
  const { root } = await landingCheckout();
  assert.equal(runCheck(root, PASSING, { record: false }).ok, true);
  assert.equal(cachedPass(root, PASSING), null);
});

test('a blank command is never recorded', async () => {
  const { root } = await landingCheckout();
  runCheck(root, '   ');
  assert.equal(cachedPass(root, '   '), null);
});

test('a killed check returns its signal', async () => {
  const { root } = await landingCheckout();
  const killed = runCheck(root, 'node -e "process.kill(process.pid, \'SIGKILL\')"');
  assert.equal(killed.ok, false);
  assert.equal(killed.signal, 'SIGKILL');
  assert.equal(runCheck(root, PASSING).signal, null);
});

test('an env that differs from the process env keys its own pass record', async () => {
  const { root } = await landingCheckout();
  const env = { ...process.env, EXO_RUN_CHECK_PROBE: 'a' };
  assert.equal(runCheck(root, PASSING, { env }).cached, false);
  assert.equal(runCheck(root, PASSING, { env }).cached, true);
  assert.equal(runCheck(root, PASSING, { env: { ...env, EXO_RUN_CHECK_PROBE: 'b' } }).cached, false);
  assert.equal(runCheck(root, PASSING).cached, false);
});

test('a fresh run skips a recorded pass and still runs', async () => {
  const { root } = await landingCheckout();
  runCheck(root, PASSING);
  const again = runCheck(root, PASSING, { fresh: true });
  assert.equal(again.cached, false);
  assert.match(again.output, /pass 1/);
});
