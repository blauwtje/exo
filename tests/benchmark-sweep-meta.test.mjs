import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readOrWriteMeta } from '../benchmarks/sweep-meta.mjs';
import { git, tempDir } from './harness.mjs';

function fakeClaude() {
  const bin = fs.realpathSync(tempDir('sweep-meta-bin-'));
  const script = path.join(bin, 'claude');
  fs.writeFileSync(script, '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
}

function baseCheckout() {
  const directory = fs.realpathSync(tempDir('sweep-meta-base-'));
  git(directory, 'init', '--quiet', '-b', 'main');
  git(directory, 'config', 'user.email', 'test@example.com');
  git(directory, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(directory, 'a.txt'), 'a\n');
  git(directory, 'add', 'a.txt');
  git(directory, 'commit', '--quiet', '-m', 'one');
  return directory;
}

const options = { sets: ['x'], provider: null, baseline: null };

test('meta without a base has one plugin commit and no baseDirty', () => {
  fakeClaude();
  const meta = readOrWriteMeta(tempDir('sweep-meta-run-'), options, 1);
  assert.equal(Object.keys(meta.pluginCommits).length, 1);
  assert.equal('baseDirty' in meta, false);
});

test('meta with a base records its commit and dirty state', () => {
  fakeClaude();
  const base = baseCheckout();
  fs.writeFileSync(path.join(base, 'b.txt'), 'b\n');
  const run = tempDir('sweep-meta-run-');
  const meta = readOrWriteMeta(run, { ...options, base }, 1);
  assert.equal(meta.pluginCommits[base], git(base, 'rev-parse', 'HEAD').trim());
  assert.equal(meta.baseDirty, true);
  assert.deepEqual(readOrWriteMeta(run, { ...options, base: null }, 2), meta);
});
