import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPOSITORY_ROOT, tempDir } from './harness.mjs';

const evalsDirectory = path.join(REPOSITORY_ROOT, 'evals');
const scripts = readdirSync(evalsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(evalsDirectory, entry.name, 'scaffold.sh'))
  .filter((script) => existsSync(script));

for (const script of scripts) {
  test(`${path.basename(path.dirname(script))} scaffold exits 0 in an empty directory`, () => {
    const result = spawnSync('bash', [script], {
      cwd: tempDir('exo-scaffold-'),
      env: { ...process.env, EXO_ROOT: REPOSITORY_ROOT },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
