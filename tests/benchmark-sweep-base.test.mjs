import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArguments } from '../benchmarks/sweep.mjs';

const SWEEP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'sweep.mjs');

function dryRun(...args) {
  return spawnSync(process.execPath, [SWEEP, ...args], { encoding: 'utf8', timeout: 60000 });
}

test('--base is parsed to an absolute path and is null without it', () => {
  assert.equal(parseArguments([]).base, null);
  assert.equal(parseArguments(['--base', '.']).base, process.cwd());
  assert.throws(() => parseArguments(['--base', './no-such-checkout']), /does not exist/);
});

test('--results ending in .md is refused, naming the folder form', () => {
  assert.throws(() => parseArguments(['--results', 'out/report.md']), /folder.*<date>-sweep\.md/);
});

test('--base plans a base and a candidate arm per repeat, base first on odd repeats', () => {
  const run = dryRun('--set', 'flow', '--cells', 'flow-unit', '--repeat', '2', '--base', '.');
  assert.match(run.stdout, /2 pairs|4 claude -p calls planned/);
  const names = [...run.stdout.matchAll(/^ {2}(flow-unit-\d-\w+):/gm)].map((match) => match[1]);
  assert.deepEqual(names, ['flow-unit-1-base', 'flow-unit-1-cand', 'flow-unit-2-cand', 'flow-unit-2-base']);
});

test('--base with a cell that has a plugin variant is refused', () => {
  const run = dryRun('--set', 'flow', '--cells', 'flow-session', '--base', '.');
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /plugin variant/);
});
