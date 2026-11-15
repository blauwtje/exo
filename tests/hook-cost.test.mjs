import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkHookCost } from '../verify/checks/hook-budgets.mjs';
import { createRepository } from '../verify/repository.mjs';
import { REPOSITORY_ROOT as REPOSITORY, tempDir } from './harness.mjs';

const repository = createRepository(REPOSITORY);

function verdict(locks, target = repository) {
  const results = [];
  checkHookCost({ result: (status, name, detail) => results.push({ status, name, detail }) }, target, locks);
  return results[0];
}

test('the hook cost check counts every command across events and groups', () => {
  const root = tempDir('hook-cost-');
  fs.mkdirSync(path.join(root, 'hooks'));
  const hooks = { hooks: { Stop: [{ hooks: [{}, {}] }], PreToolUse: [{ matcher: 'Bash', hooks: [{}] }] } };
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), JSON.stringify(hooks));
  assert.match(verdict(undefined, createRepository(root)).detail, /^3 hook entries/);
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
