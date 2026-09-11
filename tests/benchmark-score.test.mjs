// score.mjs turns a runs directory into one table: per arm the mean and
// spread of LOC, tokens, cost and time over correct template cells as a
// percentage of the baseline, the safe rate over safe cells, and with
// --publish the ratios file the savings counter reads.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture } from './harness.mjs';

const SCORE = fileURLToPath(new URL('../benchmarks/score.mjs', import.meta.url));

function runScore(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCORE, ...args], { timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

function usage(input, cacheRead, output) {
  return { input_tokens: input, cache_read_input_tokens: cacheRead, output_tokens: output, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } };
}

async function cell(root, task, arm, run, result, checks) {
  const directory = path.join(root, task, arm, String(run));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result));
  await fs.writeFile(path.join(directory, 'checks.json'), JSON.stringify(checks));
}

async function runsFixture() {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'meta.json'), JSON.stringify({
    date: '2026-09-12', mode: 'test', model: 'claude-haiku-4-5-20251001', claudeVersion: '2.1.268 (Claude Code)',
    fixture: { name: 'full-stack-fastapi-template', commit: 'cd83fc1' }, arms: ['baseline', 'exo'], tasks: ['t1', 'safe-path'], runs: 2, cells: 8
  }));
  const template = (loc, correct) => ({ tier: 'template', timedOut: false, resultParsed: true, loc: { added: loc, removed: 0, testAdded: 0, files: [] }, correct, correctReason: '' });
  const safe = (pass) => ({ tier: 'safe', timedOut: false, resultParsed: true, loc: { added: 5, removed: 0, testAdded: 0, files: [] }, safe: pass, safeReason: '' });
  await cell(root, 't1', 'baseline', 1, { total_cost_usd: 0.4, duration_ms: 100000, usage: usage(100, 1000, 500) }, template(200, true));
  await cell(root, 't1', 'baseline', 2, { total_cost_usd: 0.6, duration_ms: 140000, usage: usage(100, 1000, 700) }, template(240, true));
  await cell(root, 't1', 'exo', 1, { total_cost_usd: 0.3, duration_ms: 60000, usage: usage(100, 1000, 300) }, template(100, true));
  await cell(root, 't1', 'exo', 2, { total_cost_usd: 0.5, duration_ms: 80000, usage: usage(100, 1000, 400) }, template(20, false));
  await cell(root, 'safe-path', 'baseline', 1, { total_cost_usd: 0.1, duration_ms: 10000, usage: usage(10, 100, 50) }, safe(true));
  await cell(root, 'safe-path', 'baseline', 2, { total_cost_usd: 0.1, duration_ms: 10000, usage: usage(10, 100, 50) }, safe(false));
  await cell(root, 'safe-path', 'exo', 1, { total_cost_usd: 0.1, duration_ms: 10000, usage: usage(10, 100, 50) }, safe(true));
  await cell(root, 'safe-path', 'exo', 2, { total_cost_usd: 0.1, duration_ms: 10000, usage: usage(10, 100, 50) }, safe(true));
  return root;
}

test('the table shows baseline absolutes, other arms as percentages, and excludes incorrect cells', async () => {
  const root = await runsFixture();
  const result = await runScore([root]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /model claude-haiku-4-5-20251001 · Claude Code 2\.1\.268 \(Claude Code\) · fixture full-stack-fastapi-template@cd83fc1 · n=2 · 2026-09-12/);
  assert.match(result.stdout, /\| arm \| LOC \| tokens \| cost \| time \| safe \| correct \|/);
  // baseline: LOC mean 220 sd 28; weighted input 100 + 0.1 × 1000 = 200, plus output 500/700 → 700/900, mean 800 sd 141
  assert.match(result.stdout, /\| baseline \| 220 ±28 \| 800 ±141 \| \$0\.50 ±0\.14 \| 2\.0m ±0\.5m \| 50% \(1\/2\) \| 100% \(2\/2\) \|/);
  // exo: one correct cell, LOC 100 → -55%; tokens 200 + 300 = 500 → -37.5%, rounded -37%; cost 0.3 → -40%; time 60s → -50%
  assert.match(result.stdout, /\| exo \| -55% \| -37% \| -40% \| -50% \| 100% \(2\/2\) \| 50% \(1\/2\) \|/);
});

test('--publish writes the results file and the ratios file the counter reads', async () => {
  const root = await runsFixture();
  const out = await fixture();
  const results = path.join(out, 'results.md');
  const ratios = path.join(out, 'ratios.mjs');
  const result = await runScore([root, '--publish', '--results', results, '--ratios', ratios]);
  assert.equal(result.code, 0, result.stderr);
  const written = (await import(pathToFileURL(ratios).href)).default;
  assert.deepEqual({ lines: written.lines, tokens: written.tokens, cost: written.cost, time: written.time }, { lines: 0.55, tokens: 0.38, cost: 0.4, time: 0.5 });
  assert.match(written.source, /results\.md: exo vs baseline, 2 tasks, claude-haiku-4-5-20251001, n=2, 2026-09-12/);
  assert.match(await fs.readFile(results, 'utf8'), /^# Benchmark 2026-09-12/);
  assert.match(await fs.readFile(results, 'utf8'), /## Limitations/);
});
