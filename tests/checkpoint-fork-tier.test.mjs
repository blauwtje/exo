import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseArguments } from '../benchmarks/checkpoint-fork.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'benchmarks', 'checkpoint-fork.mjs');
const base = ['--checkpoints', 'keep', '--full-runs', 'runs', '--out', 'out'];

test('the default tier is quick and plans one fork', () => {
  const options = parseArguments(base);
  assert.equal(options.tier, 'quick');
  assert.equal(options.forks, 1);
  assert.equal(options.dryRun, false);
});

test('--full restores two forks', () => {
  const options = parseArguments([...base, '--full']);
  assert.equal(options.tier, 'full');
  assert.equal(options.forks, 2);
});

test('an explicit --forks overrides the tier', () => {
  assert.equal(parseArguments([...base, '--forks', '3']).forks, 3);
  assert.equal(parseArguments([...base, '--full', '--forks', '1']).forks, 1);
});

test('--dry-run parses and --full with --dry-run keeps both', () => {
  const options = parseArguments([...base, '--dry-run', '--full']);
  assert.equal(options.dryRun, true);
  assert.equal(options.forks, 2);
});

test('--dry-run cannot combine with --confirm', () => {
  assert.throws(() => parseArguments([...base, '--dry-run', '--confirm']), /--dry-run/);
});

test('--dry-run prints the plan, starts nothing and exits 0', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-tier-'));
  try {
    const result = spawnSync(process.execPath, [SCRIPT, '--checkpoints', directory, '--full-runs', directory, '--out', path.join(directory, 'out'), '--dry-run'], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /quick tier/);
    assert.match(result.stdout, /dry run: nothing started/);
    assert.equal(fs.existsSync(path.join(directory, 'out')), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
