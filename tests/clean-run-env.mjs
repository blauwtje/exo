// why: loaded with `node --import` before `--test` for four purposes. A test run started inside `exo run`
// why: would otherwise hand the run's variables to every test and hook it spawns, and their guard refusals
// why: would park as open gates in the live run. And git 2.54 detaches `git maintenance run --auto` after a
// why: commit, which repacks a temp repository's .git while the test removes it (ENOTEMPTY), so every git of
// why: this process and its children gets maintenance.auto=false, appended to git's GIT_CONFIG_COUNT entries.
// why: Third, tests and the scripts they spawn leave mkdtemp folders in the user temp folder, so this process
// why: points TMPDIR at one run root that every child inherits, and removes that root on exit. Fourth, a test
// why: must not read the developer's git setup, so HOME is a fresh folder, the global and system git config
// why: are empty, init.defaultBranch is main and user.useConfigOnly is true, and the git identity, GIT_DIR and
// why: index variables are dropped; a test that commits names its own identity. Fifth, a test must not read the
// why: developer's exo settings, so every CLAUDE_PLUGIN_OPTION_* variable is dropped and CLAUDE_PROJECT_DIR
// why: names an empty folder, which also stops the git-toplevel fallback from reaching this checkout.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export const RUN_VARIABLES = ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_RUN_SESSION', 'EXO_DROPS', 'EXO_PENDING_EVIDENCE'];

for (const name of RUN_VARIABLES) delete process.env[name];

const INHERITED_GIT_VARIABLE = /^(GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)|GIT_(DIR|WORK_TREE|INDEX_FILE|PREFIX|COMMON_DIR|OBJECT_DIRECTORY|NAMESPACE)|GIT_(AUTHOR|COMMITTER)_\w+)$/;

export const GIT_TEST_CONFIG = [
  ['maintenance.auto', 'false'],
  ['init.defaultBranch', 'main'],
  ['user.useConfigOnly', 'true']
];

function isolateGit(home) {
  for (const name of Object.keys(process.env)) if (INHERITED_GIT_VARIABLE.test(name)) delete process.env[name];
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.XDG_CONFIG_HOME;
  process.env.GIT_CONFIG_GLOBAL = os.devNull;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  GIT_TEST_CONFIG.forEach(([key, value], index) => {
    process.env[`GIT_CONFIG_KEY_${index}`] = key;
    process.env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  process.env.GIT_CONFIG_COUNT = String(GIT_TEST_CONFIG.length);
}

function isolateSettings(root) {
  for (const name of Object.keys(process.env)) if (name.startsWith('CLAUDE_PLUGIN_OPTION_')) delete process.env[name];
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  process.env.CLAUDE_PROJECT_DIR = project;
  const config = path.join(root, 'claude-config');
  fs.mkdirSync(config);
  process.env.CLAUDE_CONFIG_DIR = config;
}

function createRunRoot() {
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
  return root;
}

if (!process.env.EXO_TEST_TMP_ROOT) {
  const root = createRunRoot();
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  isolateGit(home);
  isolateSettings(root);
}
