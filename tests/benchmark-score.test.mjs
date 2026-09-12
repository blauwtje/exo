// score.mjs turns a runs directory into one table: per arm the mean and
// spread of LOC, tokens, cost and time over correct template cells as a
// percentage of the baseline, the safe rate over safe cells, and with
// --publish the ratios file the savings counter reads. Tokens come from each
// cell's usage.json, which sums the main thread and every subagent.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture } from './harness.mjs';

const SCORE = fileURLToPath(new URL('../benchmarks/score.mjs', import.meta.url));
const HAIKU = 'claude-haiku-4-5-20251001';

function runScore(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCORE, ...args], { timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

// The shape cell-usage.mjs writes, with no cache writes.
function cellUsage(input, cacheRead, output, extra = {}) {
  const counts = { input, cacheRead, cache5m: 0, cache1h: 0, output, raw: input + cacheRead + output, weightedInput: input + cacheRead * 0.1 };
  return { transcript: 'fixture.jsonl', counts, byModel: { [HAIKU]: counts }, subagents: [], ladder: false, ...extra };
}

function result(cost, durationMs, modelUsage = { [HAIKU]: { costUSD: cost } }) {
  return { total_cost_usd: cost, duration_ms: durationMs, modelUsage };
}

async function cell(root, task, arm, run, cellResult, checks, usage = null) {
  const directory = path.join(root, task, arm, String(run));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(cellResult));
  await fs.writeFile(path.join(directory, 'checks.json'), JSON.stringify(checks));
  if (usage !== null) await fs.writeFile(path.join(directory, 'usage.json'), JSON.stringify(usage));
}

async function writeMeta(root, tasks, runs, cells) {
  await fs.writeFile(path.join(root, 'meta.json'), JSON.stringify({
    date: '2026-09-12', mode: 'test', model: HAIKU, claudeVersion: '2.1.268 (Claude Code)',
    fixture: { name: 'full-stack-fastapi-template', commit: 'cd83fc1' }, arms: ['baseline', 'exo'], tasks, runs, cells
  }));
}

const template = (loc, correct) => ({ tier: 'template', timedOut: false, resultParsed: true, loc: { added: loc, removed: 0, testAdded: 0, files: [] }, correct, correctReason: '' });
const safe = (pass) => ({ tier: 'safe', timedOut: false, resultParsed: true, loc: { added: 5, removed: 0, testAdded: 0, files: [] }, safe: pass, safeReason: '' });

async function runsFixture() {
  const root = await fixture();
  await writeMeta(root, ['t1', 'safe-path'], 2, 8);
  const scouted = { subagents: ['general-purpose'], ladder: true };
  await cell(root, 't1', 'baseline', 1, result(0.4, 100000), template(200, true), cellUsage(100, 1000, 500));
  await cell(root, 't1', 'baseline', 2, result(0.6, 140000), template(240, true), cellUsage(100, 1000, 700));
  await cell(root, 't1', 'exo', 1, result(0.3, 60000, { [HAIKU]: { costUSD: 0.25 }, 'claude-sonnet-5': { costUSD: 0.05 } }), template(100, true), cellUsage(100, 1000, 300, scouted));
  await cell(root, 't1', 'exo', 2, result(0.5, 80000), template(20, false), cellUsage(100, 1000, 400, { ladder: true }));
  await cell(root, 'safe-path', 'baseline', 1, result(0.1, 10000), safe(true));
  await cell(root, 'safe-path', 'baseline', 2, result(0.1, 10000), safe(false));
  await cell(root, 'safe-path', 'exo', 1, result(0.1, 10000), safe(true));
  await cell(root, 'safe-path', 'exo', 2, result(0.1, 10000), safe(true));
  return root;
}

test('the table shows baseline absolutes, other arms as percentages, and excludes incorrect cells', async () => {
  const root = await runsFixture();
  const scored = await runScore([root]);
  assert.equal(scored.code, 0, scored.stderr);
  assert.match(scored.stdout, /model claude-haiku-4-5-20251001 · Claude Code 2\.1\.268 \(Claude Code\) · fixture full-stack-fastapi-template@cd83fc1 · n=2 · 2026-09-12/);
  assert.match(scored.stdout, /\| arm \| LOC \| tokens \| cost \| time \| safe \| correct \|/);
  // baseline: LOC mean 220 sd 28; weighted input 100 + 0.1 × 1000 = 200, plus output 500/700 → 700/900, mean 800 sd 141
  assert.match(scored.stdout, /\| baseline \| 220 ±28 \| 800 ±141 \| \$0\.50 ±0\.14 \| 2\.0m ±0\.5m \| 50% \(1\/2\) \| 100% \(2\/2\) \|/);
  // exo: one correct cell, LOC 100 → -55%; tokens 200 + 300 = 500 → -37.5%, rounded -37%; cost 0.3 → -40%; time 60s → -50%
  assert.match(scored.stdout, /\| exo \| 100 ±0 \(-55%\) \| 500 ±0 \(-37%\) \| \$0\.30 ±0\.00 \(-40%\) \| 1\.0m ±0\.0m \(-50%\) \| 100% \(2\/2\) \| 50% \(1\/2\) \|/);
});

test('a line per arm gives cost per correct cell by model, the subagents spawned and the ladder in context', async () => {
  const root = await runsFixture();
  const scored = await runScore([root]);
  assert.equal(scored.code, 0, scored.stderr);
  assert.match(scored.stdout, /^- baseline: cost per correct cell claude-haiku-4-5-20251001 \$0\.500; subagents none; ladder in context 0% \(0\/2\)$/m);
  assert.match(scored.stdout, /^- exo: cost per correct cell claude-haiku-4-5-20251001 \$0\.250, claude-sonnet-5 \$0\.050; subagents general-purpose 1\/2; ladder in context 100% \(2\/2\)$/m);
});

test('a correct template cell without usage.json stops the score', async () => {
  const root = await fixture();
  await writeMeta(root, ['t1'], 1, 2);
  await cell(root, 't1', 'baseline', 1, result(0.4, 100000), template(100, true), cellUsage(100, 1000, 500));
  await cell(root, 't1', 'exo', 1, result(0.3, 60000), template(80, true));
  const scored = await runScore([root]);
  assert.equal(scored.code, 1);
  assert.match(scored.stderr, /score: t1\/exo\/1 has no usage\.json; run node benchmarks\/backfill-usage\.mjs on the runs directory/);
});

test('--publish writes the results file and the ratios file the counter reads', async () => {
  const root = await runsFixture();
  const out = await fixture();
  const results = path.join(out, 'results.md');
  const ratios = path.join(out, 'ratios.mjs');
  const scored = await runScore([root, '--publish', '--results', results, '--ratios', ratios]);
  assert.equal(scored.code, 0, scored.stderr);
  const written = (await import(pathToFileURL(ratios).href)).default;
  assert.deepEqual({ lines: written.lines, tokens: written.tokens, cost: written.cost, time: written.time }, { lines: 0.55, tokens: 0.38, cost: 0.4, time: 0.5 });
  // Standard errors: √(sd_E²/n_E + (E/B)² · sd_B²/n_B) / B, with the exo arm's one cell at sd 0.
  assert.deepEqual(written.spread, { lines: 0.04, tokens: 0.08, cost: 0.12, time: 0.08 });
  assert.match(written.source, /results\.md: exo vs baseline, 2 tasks, claude-haiku-4-5-20251001, n=2, 2026-09-12/);
  const document = await fs.readFile(results, 'utf8');
  assert.match(document, /^# Benchmark 2026-09-12/);
  assert.match(document, /^- exo: cost per correct cell /m);
  assert.match(document, /## Limitations/);
  assert.match(document, /summed over every transcript of the cell, main thread and subagents/);
});

test('--publish keeps a cut negative when the exo arm used more than the baseline', async () => {
  const root = await fixture();
  await writeMeta(root, ['t1'], 1, 2);
  await cell(root, 't1', 'baseline', 1, result(0.4, 100000), template(100, true), cellUsage(100, 1000, 500));
  await cell(root, 't1', 'exo', 1, result(0.6, 150000), template(150, true), cellUsage(100, 1000, 800));
  const out = await fixture();
  const ratios = path.join(out, 'ratios.mjs');
  const scored = await runScore([root, '--publish', '--results', path.join(out, 'results.md'), '--ratios', ratios]);
  assert.equal(scored.code, 0, scored.stderr);
  const written = (await import(pathToFileURL(ratios).href)).default;
  assert.deepEqual({ lines: written.lines, cost: written.cost, time: written.time }, { lines: -0.5, cost: -0.5, time: -0.5 });
});
