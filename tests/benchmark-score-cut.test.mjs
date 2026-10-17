import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCORE = path.join(import.meta.dirname, '..', 'benchmarks', 'score.mjs');

function writeCell(runs, where, added) {
  const cell = path.join(runs, where.task, where.arm, '1');
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify({ tier: 'template', correct: true, loc: { added } }));
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: 1, duration_ms: 60000 }));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify({ counts: { weightedInput: 1000, output: 500 }, subagents: [] }));
}

function publishedLines(baseline, exo) {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cut-'));
  const tasks = baseline.map((_, index) => `t${index}`);
  const meta = {
    model: 'm', claudeVersion: '1', fixture: { name: 'f', commit: 'c' }, runs: 1, date: '2026-01-01',
    arms: ['baseline', 'exo'], tasks, cells: tasks.length * 2, mode: 'x'
  };
  fs.writeFileSync(path.join(runs, 'meta.json'), JSON.stringify(meta));
  tasks.forEach((task, index) => {
    writeCell(runs, { task, arm: 'baseline' }, baseline[index]);
    writeCell(runs, { task, arm: 'exo' }, exo[index]);
  });
  const output = spawnSync(process.execPath, [SCORE, runs, '--publish', '--results', path.join(runs, 'out.md')], { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  return JSON.parse(output.stdout.split('\n').find((line) => line.startsWith('{')));
}

test('a uniform 20% cut over B = 100, 300, 900 has no spread', () => {
  const ratios = publishedLines([100, 300, 900], [80, 240, 720]);
  assert.equal(ratios.lines, 0.2);
  assert.equal(ratios.spread.lines, 0);
});

test('B = 100, 200, 300 with E = 90, 150, 270 gives cut 0.15 and spread 0.052', () => {
  const ratios = publishedLines([100, 200, 300], [90, 150, 270]);
  assert.equal(ratios.lines, 0.15);
  assert.equal(ratios.spread.lines, 0.052);
});

test('two arms with no shared task stop the publish with an error naming the metric', () => {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-cut-'));
  try {
    const meta = {
      model: 'm', claudeVersion: '1', fixture: { name: 'f', commit: 'c' }, runs: 1, date: '2026-01-01',
      arms: ['baseline', 'exo'], tasks: ['a', 'b'], cells: 2, mode: 'x'
    };
    fs.writeFileSync(path.join(runs, 'meta.json'), JSON.stringify(meta));
    writeCell(runs, { task: 'a', arm: 'baseline' }, 100);
    writeCell(runs, { task: 'b', arm: 'exo' }, 80);
    const output = spawnSync(process.execPath, [SCORE, runs, '--publish', '--results', path.join(runs, 'out.md')], { encoding: 'utf8' });
    assert.notEqual(output.status, 0);
    assert.match(output.stderr, /needs a task with correct template cells in both arms for loc/);
    assert.equal(fs.existsSync(path.join(runs, 'out.md')), false);
  } finally {
    fs.rmSync(runs, { recursive: true, force: true });
  }
});
