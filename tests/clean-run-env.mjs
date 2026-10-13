// why: loaded with `node --import` before `--test` for two purposes. A test run started inside `exo run`
// why: would otherwise hand the run's variables to every test and hook it spawns, and their guard refusals
// why: would park as open gates in the live run. And git 2.54 detaches `git maintenance run --auto` after a
// why: commit, which repacks a temp repository's .git while the test removes it (ENOTEMPTY), so every git of
// why: this process and its children gets maintenance.auto=false, appended to git's GIT_CONFIG_COUNT entries.

import process from 'node:process';

export const RUN_VARIABLES = ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_DROPS'];

for (const name of RUN_VARIABLES) delete process.env[name];

const configIndex = Number(process.env.GIT_CONFIG_COUNT ?? '0');
process.env[`GIT_CONFIG_KEY_${configIndex}`] = 'maintenance.auto';
process.env[`GIT_CONFIG_VALUE_${configIndex}`] = 'false';
process.env.GIT_CONFIG_COUNT = String(configIndex + 1);
