import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { moduleSizeProblems, CEILINGS_FILE } from '../verify/checks/module-size.mjs';
import { MODULE_FILE_CAP } from '../verify/budgets.mjs';

function fixture(files, ceilings = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-module-size-'));
  spawnSync('git', ['init', '-q', root]);
  for (const [name, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), 'x'.repeat(bytes));
  }
  fs.mkdirSync(path.join(root, 'verify'), { recursive: true });
  fs.writeFileSync(path.join(root, CEILINGS_FILE), ceilings);
  return root;
}

const over = MODULE_FILE_CAP.bytes + 100;

test('a new module over the cap fails without any list naming it', () => {
  const { problems } = moduleSizeProblems(fixture({ 'lib/new.mjs': over }));
  assert.match(problems.join(), /lib\/new\.mjs is \d+ bytes, over the/);
});

test('a test file is left to the test cap', () => {
  assert.deepEqual(moduleSizeProblems(fixture({ 'tests/big.test.mjs': over })).problems, []);
});

test('a listed module at its ceiling passes', () => {
  assert.deepEqual(moduleSizeProblems(fixture({ 'lib/old.mjs': over }, `${over} lib/old.mjs\n`)).problems, []);
});

test('a listed module that grows fails', () => {
  const { problems } = moduleSizeProblems(fixture({ 'lib/old.mjs': over + 1 }, `${over} lib/old.mjs\n`));
  assert.match(problems.join(), /grew to/);
});

test('a listed module that shrinks fails until its ceiling follows', () => {
  const { problems } = moduleSizeProblems(fixture({ 'lib/old.mjs': over - 1 }, `${over} lib/old.mjs\n`));
  assert.match(problems.join(), /lower its ceiling .* to \d+/);
});

test('a listed module under the cap or gone fails until its line leaves the list', () => {
  const { problems } = moduleSizeProblems(fixture({ 'lib/old.mjs': 10 }, `${over} lib/old.mjs\n${over} lib/gone.mjs\n`));
  assert.match(problems.join(), /lib\/old\.mjs is 10 bytes, within the cap: remove its line/);
  assert.match(problems.join(), /lib\/gone\.mjs is gone: remove its line/);
});

test('this repository holds every module within the cap or its ceiling', () => {
  assert.deepEqual(moduleSizeProblems(path.resolve(import.meta.dirname, '..')).problems, []);
});
