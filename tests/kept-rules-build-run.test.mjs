import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RUN_PLAN = fileURLToPath(new URL('../skills/build/scripts/run-plan.mjs', import.meta.url));
const EXO_CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('run-plan: --help prints the flags and the exit codes, and exits 0', () => {
  const { status, stdout } = run(RUN_PLAN, ['plan.md', '--help']);
  assert.equal(status, 0);
  assert.ok(stdout.includes('--max-run-usd'));
  assert.ok(stdout.includes('--session auto|task|plan'));
  assert.ok(stdout.includes('Exit 0 done with gate PASS, 3 parked'));
});

test('exo-cli: --help prints the usage and exits 0', () => {
  const { status, stdout } = run(EXO_CLI, ['--help']);
  assert.equal(status, 0);
  assert.ok(stdout.includes('exo run --resume <id>'));
  assert.ok(stdout.includes('exo run config'));
});

test('exo-cli: an unknown command is refused with the usage', () => {
  const { status, stderr } = run(EXO_CLI, ['bogus']);
  assert.equal(status, 2);
  assert.ok(stderr.includes('usage: exo run'));
});
