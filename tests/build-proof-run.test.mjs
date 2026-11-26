import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import { test } from 'node:test';
import { run } from './harness.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

const PROOF_RUN = new URL('../skills/build/scripts/proof-run.mjs', import.meta.url).pathname;

async function proof(command, name = 'proof-fixture') {
  const { root } = await landingCheckout();
  const result = await run(PROOF_RUN, ['--name', name, '--command', command], { cwd: root });
  return { result, root };
}

test('a failing proof prints its log path, the exit code and only the failing lines', async () => {
  const { result } = await proof('echo "ok 1 - fine"; echo "not ok 2 - broken"; echo "FAIL here"; exit 3');
  assert.equal(result.code, 0, result.stderr);
  const log = result.stdout.match(/^Log: (.*)$/m)[1];
  assert.match(log, /proof-fixture\.log$/);
  assert.match(result.stdout, /^Exit: 3$/m);
  assert.match(result.stdout, /^not ok 2 - broken$/m);
  assert.match(result.stdout, /^FAIL here$/m);
  assert.doesNotMatch(result.stdout, /ok 1 - fine/);
  assert.match(fsSync.readFileSync(log, 'utf8'), /ok 1 - fine/);
});

test('a passing proof prints the last 40 lines of the log', async () => {
  const { result } = await proof('seq 1 100');
  assert.match(result.stdout, /^Exit: 0$/m);
  assert.match(result.stdout, /^100$/m);
  assert.match(result.stdout, /^61$/m);
  assert.doesNotMatch(result.stdout, /^60$/m);
});

test('the command runs in the checkout as one shell string', async () => {
  const { result, root } = await proof('pwd && echo a | tr a b');
  assert.ok(result.stdout.includes(fsSync.realpathSync(root)) || result.stdout.includes(root));
  assert.match(result.stdout, /^b$/m);
});
