import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTestGitEnv } from '../verify/checks/test-git-env.mjs';
import { createReport } from '../verify/report.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const REAL_PRELOAD = fs.readFileSync(fileURLToPath(new URL('./clean-run-env.mjs', import.meta.url)), 'utf8');
const BARE_PRELOAD = 'export const RUN_VARIABLES = [];\n';
const LOADED_SCRIPT = 'node --import ./tests/clean-run-env.mjs --test "tests/*.test.mjs"';
const BARE_SCRIPT = 'node --test "tests/*.test.mjs"';

function write(root, relativePath, text) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function run({ preload = REAL_PRELOAD, script = LOADED_SCRIPT, extra = {} }) {
  const root = tempDir('test-git-env-');
  write(root, 'package.json', JSON.stringify({ scripts: { test: script } }));
  write(root, 'tests/clean-run-env.mjs', preload);
  write(root, 'tests/sample.test.mjs', "const root = await gitRepository({});\n");
  for (const [file, text] of Object.entries(extra)) write(root, file, text);
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try { checkTestGitEnv(createReport(), createRepository(root)); } finally { console.log = original; }
  return lines.join('\n');
}

test('a test script that loads the isolating preload passes', () => {
  assert.match(run({}), /^\[PASS\] test git env/);
});

test('a test script without the preload fails and names the git tests it exposes', () => {
  const output = run({ script: BARE_SCRIPT });
  assert.match(output, /^\[FAIL\] test git env: package\.json script test runs tests without tests\/clean-run-env\.mjs/);
  assert.match(output, /tests\/sample\.test\.mjs/);
});

test('a verify script that spawns the test runner without the preload fails', () => {
  const output = run({ extra: { 'verify/checks/runner.mjs': "spawn(process.execPath, ['--test', file]);\n" } });
  assert.match(output, /\[FAIL\] test git env: verify\/checks\/runner\.mjs runs tests without/);
});

test('a preload that leaves the git config open fails', () => {
  const output = run({ preload: BARE_PRELOAD });
  assert.match(output, /\[FAIL\] test git env: .*leaves it open: git reads a config file/);
});
