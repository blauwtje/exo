import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refusalHandler } from '../lib/refusal-handlers.mjs';
import { git, run } from './harness.mjs';
import { SCRIPT, landingCheckout, editApp } from './land-task-fixture.mjs';

test('landing a task whose change is already on the target is refused as landed, with no exo-retry', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const first = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(first.code, 0, first.stderr);
  const again = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(again.code, 1);
  assert.match(again.stderr, /Task 1 is already landed/);
  assert.ok(again.stderr.endsWith(`${refusalHandler('landed')}\n`), again.stderr);
  assert.doesNotMatch(again.stderr, /exo-retry/);
  assert.equal(git(root, 'rev-list', '--count', 'HEAD'), '2');
});

test('a run pinned to another task is refused with no exo-retry', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const refused = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env: { EXO_RUN_TASK: 'fixture/2' } });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /pins this run to fixture\/2/);
  assert.ok(refused.stderr.includes(`\n${refusalHandler('pin')}\n`), refused.stderr);
  assert.doesNotMatch(refused.stderr, /exo-retry/);
});
