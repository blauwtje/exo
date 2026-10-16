import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sandboxProfile } from '../lib/confine-claude.mjs';

const darwin = process.platform === 'darwin';

function userTempDir() {
  return fs.realpathSync(execFileSync('getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim());
}

function sandboxedTouch(profile, file) {
  return spawnSync('sandbox-exec', ['-p', profile, '/usr/bin/touch', file], { encoding: 'utf8' });
}

test('sandbox profile lets xcrun refresh its cache in the user temp dir', { skip: !darwin }, () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'confine-root-'));
  const profile = sandboxProfile([root]);
  const dir = userTempDir();
  const cache = path.join(dir, `xcrun_db-confine-test-${process.pid}`);
  const other = path.join(dir, `confine-test-other-${process.pid}`);
  try {
    const allowed = sandboxedTouch(profile, cache);
    assert.equal(allowed.status, 0, allowed.stderr);
    const denied = sandboxedTouch(profile, other);
    assert.notEqual(denied.status, 0, 'a file outside the xcrun cache must stay unwritable');
    assert.equal(fs.existsSync(other), false);
  } finally {
    fs.rmSync(cache, { force: true });
    fs.rmSync(other, { force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
