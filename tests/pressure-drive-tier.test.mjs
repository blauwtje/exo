import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { driveArguments } from '../lib/plugin-copy.mjs';
import { runLines, runOutcome, turnRecord } from '../benchmarks/pressure/run-measures.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'pressure', 'drive.mjs');
const RUNS = '/tmp/exo-pressure/runs';

function drive(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30000 });
}

test('dry run prints the quick tier plan and exits 0 without a run folder', () => {
  const folder = path.join(RUNS, 'B-sonnet-with-tier-test');
  fs.rmSync(folder, { recursive: true, force: true });
  const result = drive('B', 'sonnet', 'with', '--dry-run', '--label', 'tier-test');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quick tier/);
  assert.match(result.stdout, /scenario B/);
  assert.match(result.stdout, /model sonnet/);
  assert.match(result.stdout, /arm with/);
  assert.match(result.stdout, /2 turns/);
  assert.equal(fs.existsSync(folder), false);
});

test('full restores the 99 turn run', () => {
  const result = drive('B', 'sonnet', 'with', '--dry-run', '--full');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /full tier/);
  assert.match(result.stdout, /99 turns/);
});

test('an explicit turn count overrides the tier', () => {
  const result = drive('B', 'sonnet', 'with', '5', '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /custom tier/);
  assert.match(result.stdout, /5 turns/);
});

test('an explicit turn count with full is a usage error', () => {
  const result = drive('B', 'sonnet', 'with', '5', '--dry-run', '--full');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /full/);
});

test('every drive turn reads project and local settings only, whichever arm', () => {
  for (const armFlags of [['--plugin-dir', '/exo'], ['--settings', '{"enabledPlugins":{"exo@x":false}}']]) {
    const args = driveArguments({ prompt: 'hi', model: 'sonnet', armFlags, sessionId: 'abc' });
    assert.deepEqual(args.slice(args.indexOf('--setting-sources'), args.indexOf('--setting-sources') + 2), ['--setting-sources', 'project,local']);
    assert.deepEqual(args.slice(-2), ['--resume', 'abc']);
    assert.equal(args.includes('--strict-mcp-config'), true);
  }
});

const done = { sid: 's', text: 'ok', costUsd: 0.2, wallMs: 3000 };

test('a timed out, errored or empty turn is aborted and an unpriced turn keeps a null cost', () => {
  assert.equal(turnRecord({ ...done, timedOut: true }).aborted, true);
  assert.equal(turnRecord({ ...done, isError: true }).aborted, true);
  assert.equal(turnRecord({ ...done, text: undefined }).aborted, true);
  assert.equal(turnRecord({ ...done, sid: undefined }).aborted, true);
  const unpriced = turnRecord({ ...done, costUsd: undefined });
  assert.equal(unpriced.aborted, false);
  assert.equal(unpriced.costUsd, null);
});

test('an aborted turn or a wrong copy makes the run outcome a failure', () => {
  const finished = turnRecord(done);
  assert.equal(runOutcome({ turns: [finished], loadedWrongCopy: false }), 'completed');
  assert.equal(runOutcome({ turns: [finished, turnRecord({ ...done, timedOut: true })], loadedWrongCopy: false }), 'aborted');
  assert.equal(runOutcome({ turns: [finished], loadedWrongCopy: true }), 'wrong-copy');
});

test('one turn prints no SE and aborted turns stay out of the cost and wall means with the count', () => {
  const lines = runLines({ turns: [turnRecord(done)], outcome: 'completed' });
  assert.match(lines[0], /^outcome completed$/);
  assert.match(lines[2], /cost usd per finished turn 0\.200 no SE n 1 excluded 0/);
  const mixed = runLines({ turns: [turnRecord(done), turnRecord({ ...done, costUsd: 0.4, wallMs: 5000 }), turnRecord({ ...done, timedOut: true, costUsd: 9, wallMs: 360000 })], outcome: 'aborted' });
  assert.match(mixed[0], /counted as a failure/);
  assert.match(mixed[2], /0\.300 se 0\.100 n 2 excluded 1/);
  assert.match(mixed[3], /4\.0 se 1\.0 n 2 excluded 1/);
});
