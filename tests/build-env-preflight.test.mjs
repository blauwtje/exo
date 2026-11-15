import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { startRunWithNpx } from './setup-fixture.mjs';

test('an e2e runner in a Proof yields its setup command once', () => {
  const { result, called } = startRunWithNpx({ proofs: ['npx playwright test a', 'npx playwright test b'] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(called, ['-y playwright install chromium']);
});

test('the App start line counts and a plain Proof yields nothing', () => {
  const app = startRunWithNpx({ proofs: ['true'], app: 'cypress open' });
  assert.equal(app.result.status, 0, app.result.stderr);
  assert.deepEqual(app.called, ['-y cypress install']);
  const plain = startRunWithNpx({ proofs: ['node --test x', 'true'] });
  assert.equal(plain.result.status, 0, plain.result.stderr);
  assert.deepEqual(plain.called, []);
});

test('commands run once and log; a failure names the command', () => {
  const ok = startRunWithNpx({ proofs: ['npx playwright test a'] });
  assert.equal(ok.result.status, 0, ok.result.stderr);
  const failing = startRunWithNpx({ proofs: ['npx playwright test a', 'npx cypress run'], npxBody: 'case "$*" in *cypress*) exit 3;; esac' });
  assert.equal(failing.result.status, 1);
  assert.match(failing.result.stderr, /setup command `npx -y cypress install` failed, log (\S+)\./);
  const logFile = failing.result.stderr.match(/log (\S+)\./)[1];
  assert.match(fs.readFileSync(logFile, 'utf8'), /\$ npx -y playwright install chromium/);
  assert.deepEqual(failing.called, ['-y playwright install chromium', '-y cypress install']);
});
