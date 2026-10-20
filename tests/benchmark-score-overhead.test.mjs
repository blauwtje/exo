import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCORE = path.join(import.meta.dirname, '..', 'benchmarks', 'score.mjs');
const USAGE = { counts: { weightedInput: 1000, output: 500 }, subagents: [] };

// Five cells per task and arm: `passes` of them pass, each costing `cost`.
function writeArm(runs, task, arm, { passes, cost }) {
  for (let run = 1; run <= 5; run += 1) {
    const cell = path.join(runs, task, arm, String(run));
    fs.mkdirSync(cell, { recursive: true });
    fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify({ tier: 'value', pass: run <= passes, defects: 0, loc: { added: 5 }, wallMs: 60000 }));
    fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: cost }));
    fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify(USAGE));
  }
}

// a and b are both-pass tasks; c drops out, its baseline passing 3 of 5.
function score(baselineArm, args = []) {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-overhead-'));
  const meta = { model: 'm', claudeVersion: '1', fixture: { name: 'f', commit: 'c' }, runs: 5, date: '2026-01-01', arms: [baselineArm, 'exo'], tasks: ['a', 'b', 'c'], cells: 30, mode: 'x' };
  fs.writeFileSync(path.join(runs, 'meta.json'), JSON.stringify(meta));
  writeArm(runs, 'a', 'exo', { passes: 5, cost: 0.11 });
  writeArm(runs, 'a', baselineArm, { passes: 5, cost: 0.10 });
  writeArm(runs, 'b', 'exo', { passes: 5, cost: 0.12 });
  writeArm(runs, 'b', baselineArm, { passes: 4, cost: 0.10 });
  writeArm(runs, 'c', 'exo', { passes: 5, cost: 0.90 });
  writeArm(runs, 'c', baselineArm, { passes: 3, cost: 0.10 });
  return spawnSync(process.execPath, [SCORE, runs, ...args], { encoding: 'utf8' });
}

const LINE = 'overhead exo vs baseline · R 1.15 (a 1.10, b 1.20) pass (limit 1.35) · Q +3 (15 vs 12 hidden passes over 3 tasks) pass (limit +3)';

test('O1 the overhead line sums cost over both-pass tasks and counts every task for Q', () => {
  const output = score('baseline');
  assert.equal(output.status, 0, output.stderr);
  assert.ok(output.stdout.split('\n').includes(LINE), output.stdout);
});

test('O2 --baseline-arm names the no-plugin arm', () => {
  const output = score('h2h-3', ['--baseline-arm', 'h2h-3']);
  assert.equal(output.status, 0, output.stderr);
  assert.ok(output.stdout.split('\n').includes(LINE.replace('vs baseline', 'vs h2h-3')), output.stdout);
});

test('O3 a missing arm name is refused', () => {
  const output = score('baseline', ['--baseline-arm']);
  assert.equal(output.status, 1);
  assert.match(output.stderr, /--baseline-arm needs an arm name/);
});
