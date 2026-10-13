import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

test('build: step 1 starts the detached run and watches it; the unit route is only for --task, codex or no claude', () => {
  const skills = new URL('../skills/', import.meta.url);
  const loop = readFileSync(new URL('build/references/run-loop.md', skills), 'utf8');
  const skill = readFileSync(new URL('build/SKILL.md', skills), 'utf8');
  const step = loop.match(/^1\. \*\*[\s\S]*?(?=\n2\. )/m)[0];
  assert.ok(step.includes('exo-cli.mjs" run <plan> --detach'), 'step 1 runs the detached loop');
  assert.ok(step.includes("spec hand-off reference's `## Watching the run`"), 'step 1 watches per the hand-off');  assert.ok(/`--task`/.test(step) && /codex/.test(step) && /`claude`/.test(step), 'step 1 names the unit route cases');
  assert.ok(step.indexOf('--detach') < step.indexOf('start-run.mjs --plan'), 'the detached route comes first');
  assert.ok(skill.includes('1. **Find the plan, then start its detached run.**'), 'SKILL.md step 1 starts the run');
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
