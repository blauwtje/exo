import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// why: the outer test runner sets this, and a nested `node --test` that inherits it runs as a child, not as a runner.
const RUNNER_VARIABLE = 'NODE_TEST_CONTEXT';
const STATE = '{"id":"live","phase":"starting"}\n';

for (const file of ['run-plan.test.mjs', 'run-tail.test.mjs']) {
  test(`bare node --test ${file} leaves the caller's run directory untouched`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-test-run-env-'));
    try {
      const runDirectory = path.join(home, '.exo', 'run', 'live');
      fs.mkdirSync(runDirectory, { recursive: true });
      fs.writeFileSync(path.join(runDirectory, 'state.json'), STATE);
      const run = spawnSync(process.execPath, ['--test', path.join(ROOT, 'tests', file)], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, [RUNNER_VARIABLE]: undefined, EXO_RUN: 'live', EXO_RUN_TASK: 'p/1', EXO_RUN_DIR: runDirectory }
      });
      assert.deepEqual(fs.readdirSync(runDirectory), ['state.json']);
      assert.equal(fs.readFileSync(path.join(runDirectory, 'state.json'), 'utf8'), STATE);
      assert.equal(run.status, 0, `${run.stdout}${run.stderr}`.slice(-2000));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
