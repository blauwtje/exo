import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runSetupCommands } from '../skills/build/scripts/setup-commands.mjs';
import { git, tempDir } from './harness.mjs';

test('a stalled setup command ends at its injected deadline and is named as the failure', async () => {
  const checkout = fs.realpathSync(tempDir('setup-timeout-'));
  git(checkout, 'init', '-q');
  process.env.EXO_SETUP_TIMEOUT_MS = '300';
  const started = Date.now();
  try {
    assert.equal((await runSetupCommands(['sleep 6'], checkout)).command, 'sleep 6');
  } finally {
    delete process.env.EXO_SETUP_TIMEOUT_MS;
  }
  assert.ok(Date.now() - started < 3000, 'timing-ok: the 6 s sleep runs twice this bound when the deadline is ignored');
});
