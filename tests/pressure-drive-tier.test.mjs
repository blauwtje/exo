import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
