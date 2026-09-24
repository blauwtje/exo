// The bounded wait `shipping` runs before its merge gate: gh's verdict passes
// through, a watch past the limit stops with 124, and a pull request whose
// checks never registered is left to the gate instead of read as red.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';
import { TIMEOUT_EXIT } from '../skills/shipping/scripts/wait-checks.mjs';

const WAIT_CHECKS = fileURLToPath(new URL('../skills/shipping/scripts/wait-checks.mjs', import.meta.url));

// Stands in for gh: logs its arguments, then acts out the mode it is given.
const STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, process.argv.slice(2).join(' ') + '\\n');",
  'const mode = process.env.STAND_IN_MODE;',
  "if (mode === 'pass') { console.log('All checks were successful'); process.exit(0); }",
  "if (mode === 'fail') { console.log('test (ubuntu-latest)  fail'); process.exit(1); }",
  "if (mode === 'none') { console.error(\"no checks reported on the 'feat/x' branch\"); process.exit(1); }",
  'setTimeout(() => process.exit(0), 30000);',
  ''
].join('\n');

async function waitChecks(mode, args) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), STAND_IN, { mode: 0o755 });
  execFileSync('git', ['init', '-q'], { cwd: directory });
  const log = path.join(directory, 'calls.log');
  const outcome = await run(WAIT_CHECKS, args, {
    cwd: directory,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: log, STAND_IN_MODE: mode }
  });
  const logged = await fs.readFile(log, 'utf8').catch(() => '');
  const calls = logged.split('\n').filter((line) => line !== '');
  const gitDirectory = execFileSync('git', ['-C', directory, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  return { ...outcome, calls, gitDirectory };
}

test('a green run passes through and watches the named pull request', async () => {
  const outcome = await waitChecks('pass', ['--pr', '12']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.deepEqual(outcome.calls, ['pr checks 12 --watch --fail-fast']);
});

test('a red check exits 1', async () => {
  const outcome = await waitChecks('fail', ['--pr', '12']);
  assert.equal(outcome.code, 1, outcome.stderr);
});

test('a watch past the limit stops with 124 and says the pull request stays open', async () => {
  const outcome = await waitChecks('hang', ['--pr', '12', '--minutes', '0.005']);
  assert.equal(outcome.code, TIMEOUT_EXIT, outcome.stderr);
  assert.equal(outcome.stdout, 'checks: timeout\n');
});

test('no checks after the grace period exits 0 and leaves the verdict to the gate', async () => {
  const outcome = await waitChecks('none', ['--pr', '12', '--grace-seconds', '0']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'checks: none\n');
});

test('a green run logs gh\'s table under the git directory and prints one line', async () => {
  const outcome = await waitChecks('pass', ['--pr', '12']);
  assert.equal(outcome.stdout, 'checks: pass\n', outcome.stdout);
  const logged = await fs.readFile(path.join(outcome.gitDirectory, 'exo', 'wait-checks.log'), 'utf8');
  assert.match(logged, /All checks were successful/);
});

test('a missing or malformed argument is a usage error that runs no gh', async () => {
  for (const args of [[], ['--pr', 'abc'], ['--pr', '12', '--minutes', '0'], ['--pr', '12', '--grace-seconds', '-1']]) {
    const outcome = await waitChecks('pass', args);
    assert.equal(outcome.code, 2, args.join(' '));
    assert.deepEqual(outcome.calls, [], args.join(' '));
  }
});
