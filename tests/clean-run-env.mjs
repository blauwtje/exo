// Loaded with `node --import` before `--test`: a test run started inside `exo run`
// would otherwise hand the run's variables to every test and hook it spawns, and
// their guard refusals would park as open gates in the live run.

import process from 'node:process';

export const RUN_VARIABLES = ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_DROPS'];

for (const name of RUN_VARIABLES) delete process.env[name];
