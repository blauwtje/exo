// The sweep asks for nothing billed unless invoked on purpose: without
// --confirm it prints how many `claude -p` calls it would make and starts none.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const SWEEP = fileURLToPath(new URL('../benchmarks/sweep.mjs', import.meta.url));

// A stand-in `claude` first on PATH leaves a file when called, so any started process shows.
async function fakeClaude() {
  const bin = await fixture();
  const marker = path.join(bin, 'called');
  await fs.writeFile(path.join(bin, 'claude'), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
  return { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` }, marker };
}

test('without --confirm the sweep prints its call count and starts no claude process', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--set', 'all'], { env });
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stdout, /^44 claude -p calls planned, one per cell:/);
  assert.match(result.stdout, /review-safe-path-seeded-low: --model claude-opus-5-5 --effort low/);
  assert.match(result.stdout, /plan-fable-xhigh: --model claude-fable-5-1 --effort xhigh/);
  assert.match(result.stdout, /Re-run with --confirm/);
  await assert.rejects(fs.access(marker));
});

test('a named set counts only its cells', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--set', 'plan,flow'], { env });
  assert.equal(result.code, 2, result.stderr);
  assert.match(result.stdout, /^4 claude -p calls planned/);
  await assert.rejects(fs.access(marker));
});

test('a fixer cell prepares a branch carrying a real branch-review.md fixture', async () => {
  const { env } = await fakeClaude();
  const out = await fixture();
  const results = await fixture();
  const result = await run(SWEEP, ['--set', 'fixer', '--confirm', '--concurrency', '1', '--out', out, '--results', results], { env });
  assert.equal(result.code, 0, result.stderr);
  const report = await fs.readFile(path.join(out, 'fixer-safe-path', 'branch-review.md'), 'utf8');
  assert.match(report, /^FINDINGS/);
  assert.match(report, /uploads\.js:\d+-\d+ .*fix\s*$/m);
  const published = await fs.readdir(results);
  assert.equal(published.filter((name) => name.endsWith('-sweep.md')).length, 1, published.join(', '));
});

test('an unknown flag stops before any call', async () => {
  const { env, marker } = await fakeClaude();
  const result = await run(SWEEP, ['--sets', 'all'], { env });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unknown flag --sets/);
  await assert.rejects(fs.access(marker));
});
