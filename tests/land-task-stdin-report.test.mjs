import assert from 'node:assert/strict';
import { test } from 'node:test';
import { git, run } from './harness.mjs';
import { SCRIPT, compactCheckout, PASS_REPORT } from './land-task-fixture.mjs';

test('a report piped on stdin with --report - lands a compact task that has no report file', async () => {
  const { root, planPath } = await compactCheckout();
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT });
  assert.equal(landed.code, 0, landed.stderr);
  assert.match(landed.stdout, /^Landed: 1$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: compact\/1$/m);
});

test('an empty stdin report with --report - is still refused as a missing report', async () => {
  const { root, planPath } = await compactCheckout();
  const refused = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: '' });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /no build report at 'stdin'/);
});
