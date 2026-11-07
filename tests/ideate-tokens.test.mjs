import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { planLines, plannedModes, promptFor, sessionIdOf, tokenTable } from '../benchmarks/ideate-tokens.mjs';

test('promptFor adds fast only in fast mode', () => {
  assert.equal(promptFor('full'), '/exo:ideate hoe toon ik voortgang van een lange run');
  assert.equal(promptFor('fast'), '/exo:ideate hoe toon ik voortgang van een lange run fast');
});

test('tokenTable gives one row per model and mode with both cache writes summed', () => {
  const counts = { input: 1, output: 2, cacheRead: 3, cache5m: 4, cache1h: 5 };
  const table = tokenTable({ full: { sonnet: counts }, fast: { opus: counts } });
  assert.match(table, /\| full \| sonnet \| 1 \| 2 \| 3 \| 9 \|/);
  assert.match(table, /\| fast \| opus \| 1 \| 2 \| 3 \| 9 \|/);
});

test('sessionIdOf reads session_id and rejects a result without one', () => {
  assert.equal(sessionIdOf('{"session_id":"abc"}'), 'abc');
  assert.throws(() => sessionIdOf('{}'), /session_id/);
});

test('quick tier plans one mode and full plans both', () => {
  assert.deepEqual(plannedModes('quick'), ['full']);
  assert.deepEqual(plannedModes('full'), ['full', 'fast']);
  assert.throws(() => plannedModes('x'), /tier/);
  assert.match(planLines('full').join('\n'), /power: 1 tasks x 1 samples x 2 arms = 2 runs/);
});

test('--dry-run prints the planned runs and spends nothing', () => {
  const run = spawnSync(process.execPath, ['benchmarks/ideate-tokens.mjs', '--dry-run', '--tier', 'full'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /run: \/exo:ideate .* fast/);
  assert.match(run.stdout, /power:/);
});
