import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runSetupCommands } from '../skills/build/scripts/setup-commands.mjs';
import { git, tempDir } from './harness.mjs';

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a setup timeout also ends the grandchild a stalled command spawned', async () => {
  const checkout = fs.realpathSync(tempDir('setup-grandchild-'));
  git(checkout, 'init', '-q');
  const pidFile = path.join(checkout, 'grandchild.pid');
  process.env.EXO_SETUP_TIMEOUT_MS = '500';
  try {
    await runSetupCommands([`sleep 30 & echo $! > ${pidFile}; wait`], checkout);
  } finally {
    delete process.env.EXO_SETUP_TIMEOUT_MS;
  }
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(alive(pid), false);
});
