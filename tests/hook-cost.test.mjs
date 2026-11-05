import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkHookCost, hookEntryCount, reasonBytes } from '../verify/checks/hook-budgets.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const repository = { join: (...parts) => path.join(REPOSITORY, ...parts) };

function verdict(locks) {
  const results = [];
  checkHookCost({ result: (status, name, detail) => results.push({ status, name, detail }) }, repository, locks);
  return results[0];
}

test('hookEntryCount counts every command across events and groups', () => {
  const hooks = { hooks: { Stop: [{ hooks: [{}, {}] }], PreToolUse: [{ matcher: 'Bash', hooks: [{}] }] } };
  assert.equal(hookEntryCount(JSON.stringify(hooks)), 3);
});

test('reasonBytes sums the deny reason literals', () => {
  assert.equal(reasonBytes("permissionDecisionReason: 'abc' x permissionDecisionReason: `de`"), 5);
});

test('the hook cost check passes at the locks and fails one entry or one byte under them', () => {
  const pass = verdict(undefined);
  assert.equal(pass.status, 'PASS', pass.detail);
  const [, entries, bytes] = /^(\d+) hook entries against \d+ and (\d+) bytes/.exec(pass.detail).map(Number);
  const at = (entryLock, byteLock) => ({ entries: { entries: entryLock, measured: 'test' }, bytes: { bytes: byteLock } });
  assert.equal(verdict(at(entries, bytes)).status, 'PASS');
  assert.equal(verdict(at(entries - 1, bytes)).status, 'FAIL');
  assert.equal(verdict(at(entries, bytes - 1)).status, 'FAIL');
});
