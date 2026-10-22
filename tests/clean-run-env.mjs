// why: loaded with `node --import` before `--test` for three purposes. A test run started inside `exo run`
// why: would otherwise hand the run's variables to every test and hook it spawns, and their guard refusals
// why: would park as open gates in the live run. And git 2.54 detaches `git maintenance run --auto` after a
// why: commit, which repacks a temp repository's .git while the test removes it (ENOTEMPTY), so every git of
// why: this process and its children gets maintenance.auto=false, appended to git's GIT_CONFIG_COUNT entries.
// why: Third, tests and the scripts they spawn leave mkdtemp folders in the user temp folder, so this process
// why: points TMPDIR at one run root that every child inherits, and removes that root on exit.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const RUN_VARIABLES = ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_RUN_SESSION', 'EXO_DROPS'];

for (const name of RUN_VARIABLES) delete process.env[name];

const configIndex = Number(process.env.GIT_CONFIG_COUNT ?? '0');
process.env[`GIT_CONFIG_KEY_${configIndex}`] = 'maintenance.auto';
process.env[`GIT_CONFIG_VALUE_${configIndex}`] = 'false';
process.env.GIT_CONFIG_COUNT = String(configIndex + 1);

if (!process.env.EXO_TEST_TMP_ROOT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-test-'));
  process.env.EXO_TEST_TMP_ROOT = root;
  process.env.TMPDIR = root;
  process.on('exit', () => {
    try {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // a late writer must not fail the run
    }
  });
}
