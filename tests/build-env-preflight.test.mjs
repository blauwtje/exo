import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runSetupCommands, setupCommands } from '../skills/build/scripts/setup-commands.mjs';
import { git, tempDir } from './harness.mjs';

test('an e2e runner in a Proof yields its setup command once', () => {
  const tasks = [{ proof: 'npx playwright test a' }, { proof: 'npx playwright test b' }];
  assert.deepEqual(setupCommands({ app: null }, tasks), ['npx -y playwright install chromium']);
});

test('the App start line counts and a plain Proof yields nothing', () => {
  assert.equal(setupCommands({ app: { start: 'cypress open' } }, []).length, 1);
  assert.deepEqual(setupCommands({ app: null }, [{ proof: 'node --test x' }, { proof: null }]), []);
});

test('commands run once and log; a failure names the command', async () => {
  const checkout = fs.realpathSync(tempDir('preflight-'));
  git(checkout, 'init', '-q');
  assert.equal(await runSetupCommands([], checkout), null);
  assert.equal(await runSetupCommands(['echo ok'], checkout), null);
  const failure = await runSetupCommands(['echo first', 'exit 3'], checkout);
  assert.equal(failure.command, 'exit 3');
  assert.match(fs.readFileSync(failure.logFile, 'utf8'), /\$ echo first/);
});
