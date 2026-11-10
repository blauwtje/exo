import test from 'node:test';
import assert from 'node:assert/strict';
import { runBounded, KILL_GRACE_MS } from '../lib/bounded-command.mjs';

test('a command that exits is reported with its output', async () => {
  const result = await runBounded('echo hi', 5000);
  assert.equal(result.ok, true);
  assert.match(result.output, /hi/);
});

test('a hung command whose grandchild holds the pipe resolves within the deadline plus the kill grace', async () => {
  const started = Date.now();
  const result = await runBounded('sleep 30 & sleep 30', 300);
  assert.equal(result.ok, false);
  assert.equal(result.timedOutMs, 300);
  assert.ok(Date.now() - started < 300 + KILL_GRACE_MS);
});
