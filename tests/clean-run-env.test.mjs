// A test run started inside `exo run` must not park guard refusals as open gates in
// the live run, so both test entry points strip the run variables before any test starts.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkSkillScriptBehavior } from '../verify/checks/skill-script-behavior.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUN_ENV = { EXO_RUN: 'x', EXO_RUN_TASK: 'p/1', EXO_DROPS: 'not in skills/x.md' };
// Set by the outer test runner; a nested `node --test` that inherits it runs as a child, not as a runner.
const RUNNER_VARIABLE = 'NODE_TEST_CONTEXT';

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clean-run-env-'));
}

// The node arguments the `npm test` script passes before `--test`.
function entryArguments() {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.test;
  const words = script.split(/\s+/);
  assert.equal(words[0], 'node');
  return words.slice(1, words.indexOf('--test'));
}

test('npm test arguments leave no gate in a run directory', () => {
  const runDirectory = temporaryDirectory();
  try {
    const run = spawnSync(process.execPath, [
      ...entryArguments(),
      '--test',
      '--test-name-pattern=a command no step objects to produces no output',
      path.join(ROOT, 'tests', 'dispatch-bash.test.mjs')
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, [RUNNER_VARIABLE]: undefined, ...RUN_ENV, EXO_RUN_DIR: runDirectory }
    });
    assert.equal(fs.existsSync(path.join(runDirectory, 'gates.md')), false, 'gates.md was written into the run directory');
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  } finally {
    fs.rmSync(runDirectory, { recursive: true, force: true });
  }
});

test('the skill script behavior check runs its tests without the run variables', () => {
  const repository = temporaryDirectory();
  const saved = Object.fromEntries([RUNNER_VARIABLE, 'EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_DROPS'].map((name) => [name, process.env[name]]));
  try {
    fs.mkdirSync(path.join(repository, 'tests'));
    const strip = path.join(ROOT, 'tests', 'clean-run-env.mjs');
    if (fs.existsSync(strip)) fs.copyFileSync(strip, path.join(repository, 'tests', 'clean-run-env.mjs'));
    fs.writeFileSync(path.join(repository, 'tests', 'probe.test.mjs'), [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "test('no run variable reaches the test', () => {",
      "  for (const name of ['EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_TASK', 'EXO_DROPS']) assert.equal(process.env[name], undefined, name);",
      '});',
      ''
    ].join('\n'));
    delete process.env[RUNNER_VARIABLE];
    Object.assign(process.env, RUN_ENV, { EXO_RUN_DIR: repository });
    const results = [];
    checkSkillScriptBehavior({ result: (...fields) => results.push(fields) }, { join: (...parts) => path.join(repository, ...parts) });
    assert.deepEqual(results.map(([status]) => status), ['PASS'], JSON.stringify(results));
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(repository, { recursive: true, force: true });
  }
});

function gitConfigUnderPreload({ givenEnv, keys }) {
  const inherited = Object.entries(process.env).filter(([name]) => !/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/.test(name));
  const env = { ...Object.fromEntries(inherited), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...givenEnv };
  const readKeys = [
    "const { execFileSync } = require('node:child_process');",
    `for (const key of ${JSON.stringify(keys)}) console.log(key + '=' + execFileSync('git', ['config', key], { encoding: 'utf8' }).trim());`
  ].join('\n');
  const preload = pathToFileURL(path.join(ROOT, 'tests', 'clean-run-env.mjs')).href;
  const run = spawnSync(process.execPath, ['--import', preload, '-e', readKeys], { cwd: os.tmpdir(), encoding: 'utf8', env });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  return run.stdout.trim().split('\n');
}

test('a child git under the preload reports maintenance.auto false', () => {
  assert.deepEqual(gitConfigUnderPreload({ givenEnv: {}, keys: ['maintenance.auto'] }), ['maintenance.auto=false']);
});

test('the preload appends maintenance.auto after the git config entries the environment already holds', () => {
  const givenEnv = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'kept' };
  const keys = ['user.name', 'maintenance.auto'];
  assert.deepEqual(gitConfigUnderPreload({ givenEnv, keys }), ['user.name=kept', 'maintenance.auto=false']);
});
