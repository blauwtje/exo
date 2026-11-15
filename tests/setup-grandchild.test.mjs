import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { tempDir } from './harness.mjs';
import { startRunWithNpx } from './setup-fixture.mjs';

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a setup timeout also ends the grandchild a stalled command spawned', async () => {
  const pidFile = path.join(tempDir('setup-grandchild-'), 'grandchild.pid');
  const npxBody = `sleep 30 & echo $! > '${pidFile}'; wait`;
  const { result } = startRunWithNpx({ proofs: ['npx playwright test a'], npxBody, env: { EXO_SETUP_TIMEOUT_MS: '500' } });
  assert.equal(result.status, 1);
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(alive(pid), false);
});
