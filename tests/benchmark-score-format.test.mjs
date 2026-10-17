import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCORE = path.join(import.meta.dirname, '..', 'benchmarks', 'score.mjs');

const USAGE = { counts: { weightedInput: 1000, output: 500 }, subagents: [] };

function writeCell(runs, where, files) {
  const cell = path.join(runs, where.task, where.arm, String(where.run));
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify(files.checks));
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: files.cost, duration_ms: 60000 }));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify(USAGE));
}

function scoreCosts(tier, costs) {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-format-'));
  const meta = {
    model: 'm', claudeVersion: '1', fixture: { name: 'f', commit: 'c' }, runs: costs.length, date: '2026-01-01',
    arms: ['exo'], tasks: ['t'], cells: costs.length, mode: 'x'
  };
  fs.writeFileSync(path.join(runs, 'meta.json'), JSON.stringify(meta));
  const checks = tier === 'template'
    ? { tier, correct: true, loc: { added: 10 } }
    : { tier, pass: true, defects: 0, loc: { added: 5 }, wallMs: 60000 };
  costs.forEach((cost, index) => writeCell(runs, { task: 't', arm: 'exo', run: index + 1 }, { checks, cost }));
  const output = spawnSync(process.execPath, [SCORE, runs], { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  return output.stdout;
}

test('template header names the spread as standard deviation', () => {
  assert.match(scoreCosts('template', [1, 1.1, 1.2]), /· 2026-01-01 · mean ±standard deviation\n/);
});

test('template cost with SD 0.10 prints ±0.10 at two decimals', () => {
  assert.match(scoreCosts('template', [1, 1.1, 1.2]), /\$1\.10 ±0\.10 /);
});

test('value cost with SE 0.004 prints ±$0.0040 and the mean at four decimals', () => {
  assert.match(scoreCosts('value', [1, 1.008]), /\$1\.0040 ±\$0\.0040 /);
});

test('template cost with zero spread keeps cents', () => {
  assert.match(scoreCosts('template', [1, 1, 1]), /\$1\.00 ±0\.00 /);
});
