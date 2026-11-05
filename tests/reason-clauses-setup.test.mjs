import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { tempDir } from './harness.mjs';

const SETUP = new URL('../benchmarks/pressure/reason-clauses/setup.sh', import.meta.url).pathname;

test('setup.sh fails when it cannot add the ignored dist/math.js', () => {
  const shim = tempDir('exo-git-shim-');
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\n[ "$1 $2" = "add -f" ] && exit 1\nexec ${realGit} "$@"\n`, { mode: 0o755 });
  const root = tempDir('exo-pressure-test-');
  const result = spawnSync('bash', [SETUP], { encoding: 'utf8', env: { ...process.env, EXO_PRESSURE_ROOT: root, PATH: `${shim}:${process.env.PATH}` }, timeout: 60000 });
  assert.notEqual(result.status, 0);
});
